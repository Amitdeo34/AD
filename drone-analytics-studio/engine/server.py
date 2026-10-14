"""Local HTTP server for the studio UI (stdlib only, binds to localhost by default)."""
import json
import mimetypes
import os
import platform
import re
import subprocess
import sys
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from . import media
from .render import RenderSession
from .store import Store

APP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app')
VERSION = '1.0.0'

# Windows registries sometimes map .js to text/plain which breaks ES modules, so never trust mimetypes here.
STATIC_TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
                '.txt': 'text/plain; charset=utf-8'}
MEDIA_TYPES = {'.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm',
               '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
               '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
               '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.pptx':
                   'application/vnd.openxmlformats-officedocument.presentationml.presentation'}


class ProbeCache:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.busy = set()
        try:
            with open(path, encoding='utf-8') as f:
                self.data = json.load(f)
        except (OSError, ValueError):
            self.data = {}

    def get(self, abs_path):
        try:
            key = media.file_key(abs_path)
        except OSError:
            return None
        return self.data.get(key)

    def probe_async(self, paths):
        todo = []
        with self.lock:
            for p in paths:
                if p not in self.busy:
                    self.busy.add(p)
                    todo.append(p)
        if not todo:
            return

        def work():
            for p in todo:
                try:
                    info = media.probe(p)
                    with self.lock:
                        self.data[media.file_key(p)] = info
                except Exception as e:  # noqa: BLE001
                    with self.lock:
                        try:
                            self.data[media.file_key(p)] = {'kind': media.media_kind(p), 'error': str(e)[-300:]}
                        except OSError:
                            pass
                finally:
                    with self.lock:
                        self.busy.discard(p)
            with self.lock:
                tmp = self.path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(self.data, f)
                os.replace(tmp, self.path)

        threading.Thread(target=work, daemon=True).start()


class App:
    def __init__(self, data_dir):
        self.store = Store(data_dir)
        self.cache = self.store.cache_dir
        self.probes = ProbeCache(os.path.join(self.cache, 'probe.json'))
        self.proxies = media.ProxyQueue()
        self.renders = {}

    # ------------------------------------------------------------------ media helpers
    def resolve(self, pid, rel):
        base = self.store.media_dir(pid)
        if not base:
            raise PermissionError('media folder not set')
        rel = (rel or '').replace('\\', '/').lstrip('/')
        full = os.path.realpath(os.path.join(base, rel))
        if os.path.commonpath([full, os.path.realpath(base)]) != os.path.realpath(base):
            raise PermissionError('path outside media folder')
        if not os.path.isfile(full):
            raise FileNotFoundError(rel)
        return full

    def proxy_out(self, abs_path):
        return os.path.join(self.cache, 'proxies', media.file_key(abs_path, 'p720') + '.mp4')

    def scan(self, pid, auto_proxy=True):
        base = self.store.media_dir(pid)
        if not base or not os.path.isdir(base):
            return {'dir': base, 'exists': False, 'items': []}
        items, unprobed = [], []
        base_depth = base.rstrip(os.sep).count(os.sep)
        for root, dirs, files in os.walk(base):
            dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d.lower() not in ('exports', '__pycache__'))
            if root.count(os.sep) - base_depth >= 4:
                dirs[:] = []
            for fn in sorted(files):
                if fn.startswith('.'):
                    continue
                full = os.path.join(root, fn)
                kind = media.media_kind(full)
                if not kind:
                    continue
                st = os.stat(full)
                rel = os.path.relpath(full, base).replace(os.sep, '/')
                it = {'path': rel, 'name': fn, 'kind': kind, 'size': st.st_size, 'mtime': int(st.st_mtime)}
                info = self.probes.get(full)
                if info:
                    it.update(info)
                    it['probed'] = True
                    if kind == 'video':
                        ps = self.proxies.status(self.proxy_out(full))
                        it['proxy'] = ps
                        if auto_proxy and info.get('needsProxy') and ps['state'] == 'none' and info.get('duration'):
                            self.proxies.request(full, self.proxy_out(full), info['duration'])
                else:
                    it['probed'] = False
                    unprobed.append(full)
                items.append(it)
                if len(items) >= 3000:
                    break
        if unprobed:
            self.probes.probe_async(unprobed)
        return {'dir': base, 'exists': True, 'items': items}


def open_in_os(path):
    if sys.platform.startswith('win'):
        os.startfile(path)  # noqa: S606
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', path])
    else:
        subprocess.Popen(['xdg-open', path])


def pick_folder(initial=''):
    code = ('import tkinter as tk\nfrom tkinter import filedialog\nr=tk.Tk();r.withdraw()\n'
            'try:\n r.attributes("-topmost", True)\nexcept Exception:\n pass\n'
            f'p=filedialog.askdirectory(title="Select the drone media folder", initialdir={initial!r} or None)\n'
            'print(p or "")')
    r = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, timeout=900)
    if r.returncode != 0:
        raise RuntimeError('Folder dialog is not available here. Paste the folder path instead.')
    return r.stdout.strip()


def safe_name(s, default='export'):
    s = re.sub(r'[^\w\-. ]+', '_', s or '', flags=re.UNICODE).strip(' ._')
    return s[:90] or default


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'DroneAnalyticsStudio/' + VERSION
    app: App = None

    def log_message(self, fmt, *args):  # keep the console quiet
        pass

    # ------------------------------------------------------------------ responses
    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, code, msg):
        self.close_connection = True  # an unread request body must not leak into the next request
        self.send_json({'error': str(msg)}, code)

    def send_file(self, path, ctype=None, cache='no-cache', download_name=None):
        size = os.path.getsize(path)
        ctype = ctype or MEDIA_TYPES.get(os.path.splitext(path)[1].lower()) or \
            mimetypes.guess_type(path)[0] or 'application/octet-stream'
        start, end = 0, size - 1
        rng = self.headers.get('Range')
        if rng:
            m = re.match(r'bytes=(\d*)-(\d*)', rng)
            if m:
                if m.group(1):
                    start = int(m.group(1))
                    if m.group(2):
                        end = min(int(m.group(2)), size - 1)
                elif m.group(2):
                    start = max(0, size - int(m.group(2)))
            if start >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            self.send_response(206)
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        else:
            self.send_response(200)
        length = end - start + 1
        self.send_header('Content-Type', ctype)
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        self.send_header('Cache-Control', cache)
        if download_name:
            self.send_header('Content-Disposition', f'attachment; filename="{download_name}"')
        self.end_headers()
        if self.command == 'HEAD':
            return
        with open(path, 'rb') as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(1 << 20, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    return
                remaining -= len(chunk)

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        data = b''
        while len(data) < n:
            chunk = self.rfile.read(min(1 << 22, n - len(data)))
            if not chunk:
                break
            data += chunk
        return data

    def json_body(self):
        raw = self.body()
        return json.loads(raw.decode('utf-8')) if raw else {}

    # ------------------------------------------------------------------ routing
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self.route('GET')

    def do_POST(self):
        self.route('POST')

    def do_PUT(self):
        self.route('PUT')

    def do_DELETE(self):
        self.route('DELETE')

    def route(self, method):
        u = urlparse(self.path)
        path = unquote(u.path)
        q = {k: v[-1] for k, v in parse_qs(u.query).items()}
        try:
            if not path.startswith('/api/'):
                if method in ('POST', 'PUT', 'DELETE'):
                    self.body()
                return self.static(path)
            for m, pattern, fn in ROUTES:
                if m != method:
                    continue
                mt = re.fullmatch(pattern, path)
                if mt:
                    return fn(self, q, *mt.groups())
            self.body()
            self.send_error_json(404, 'not found')
        except (KeyError, FileNotFoundError) as e:
            self.send_error_json(404, f'not found: {e}')
        except PermissionError as e:
            self.send_error_json(403, e)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            try:
                self.send_error_json(500, e)
            except Exception:  # noqa: BLE001
                pass

    def static(self, path):
        if path in ('', '/'):
            path = '/index.html'
        full = os.path.realpath(os.path.join(APP_DIR, path.lstrip('/')))
        if not full.startswith(os.path.realpath(APP_DIR)) or not os.path.isfile(full):
            return self.send_error_json(404, 'not found')
        self.send_file(full, STATIC_TYPES.get(os.path.splitext(full)[1].lower()))

    # ------------------------------------------------------------------ api: system & projects
    def api_info(self, q):
        try:
            ff = media.ffmpeg_path()
        except RuntimeError as e:
            ff = None
            err = str(e)
        else:
            err = None
        self.send_json({'version': VERSION, 'ffmpeg': ff, 'ffmpegError': err,
                        'ffmpegVersion': media.ffmpeg_version() if ff else None,
                        'encoders': media.available_encoders() if ff else [],
                        'dataDir': self.app.store.root, 'platform': platform.system(),
                        'python': platform.python_version()})

    def api_projects(self, q):
        self.send_json(self.app.store.list())

    def api_project_create(self, q):
        self.send_json(self.app.store.create(self.json_body()))

    def api_project_get(self, q, pid):
        self.send_json(self.app.store.load(pid))

    def api_project_put(self, q, pid):
        data = self.json_body()
        self.app.store.load(pid)  # must exist
        self.app.store.save(pid, data)
        self.send_json({'ok': True, 'saved': time.time()})

    def api_project_delete(self, q, pid):
        self.app.store.delete(pid)
        self.send_json({'ok': True})

    def api_pick_folder(self, q):
        body = self.json_body()
        self.send_json({'path': pick_folder(body.get('initial', ''))})

    def api_check_folder(self, q):
        d = os.path.abspath(os.path.expanduser(self.json_body().get('path', '').strip().strip('"')))
        self.send_json({'path': d, 'exists': os.path.isdir(d)})

    def api_open(self, q, pid):
        what = self.json_body().get('what', 'exports')
        d = self.app.store.exports_dir(pid) if what == 'exports' else self.app.store.media_dir(pid)
        open_in_os(d)
        self.send_json({'ok': True, 'path': d})

    # ------------------------------------------------------------------ api: media
    def api_media(self, q, pid):
        p = self.app.store.load(pid)
        self.send_json(self.app.scan(pid, p.get('settings', {}).get('autoProxy', True)))

    def api_file(self, q, pid):
        full = self.app.resolve(pid, q.get('path'))
        if q.get('proxy') == '1' and media.media_kind(full) == 'video':
            px = self.app.proxy_out(full)
            if os.path.exists(px):
                return self.send_file(px, 'video/mp4', cache='max-age=3600')
        self.send_file(full, cache='max-age=3600')

    def api_thumb(self, q, pid):
        full = self.app.resolve(pid, q.get('path'))
        t = float(q.get('t', 1.0))
        w = int(q.get('w', 320))
        out = os.path.join(self.app.cache, 'thumbs', media.file_key(full, round(t, 2), w) + '.jpg')
        src = full
        px = self.app.proxy_out(full) if media.media_kind(full) == 'video' else None
        if px and os.path.exists(px):
            src = px
        media.thumbnail(src, out, t, w)
        self.send_file(out, 'image/jpeg', cache='max-age=86400')

    def api_frame(self, q, pid):
        full = self.app.resolve(pid, q.get('path'))
        t = float(q.get('t', 0) or 0)
        w = int(q.get('w', 1920) or 0)
        info = self.app.probes.get(full) or {}
        out = os.path.join(self.app.cache, 'frames', media.file_key(full, f'{t:.4f}', w, 'v2') + '.png')
        media.grab_frame(full, out, max(0.0, t - 0.002), w, info.get('duration'))
        self.send_file(out, 'image/png', cache='max-age=86400')

    def api_proxy(self, q, pid):
        body = self.json_body()
        full = self.app.resolve(pid, body.get('path'))
        info = self.app.probes.get(full) or media.probe(full)
        self.app.proxies.request(full, self.app.proxy_out(full), info.get('duration') or 0)
        self.send_json({'ok': True})

    def api_snapshot(self, q, pid):
        body = self.json_body()
        full = self.app.resolve(pid, body.get('path'))
        t = float(body.get('t', 0))
        name = safe_name(os.path.splitext(os.path.basename(full))[0]) + f'_{t:08.3f}s.png'.replace('.', '_', 1)
        out_dir = os.path.join(self.app.store.exports_dir(pid), 'frames')
        out = os.path.join(out_dir, name)
        info = self.app.probes.get(full) or {}
        if os.path.exists(out):
            os.remove(out)
        media.grab_frame(full, out, t, 0, info.get('duration'))
        self.send_json({'ok': True, 'file': out})

    # ------------------------------------------------------------------ api: uploads, exports
    def api_upload(self, q, pid):
        data = self.body()
        name = safe_name(os.path.basename(q.get('name', 'file.bin')))
        if q.get('dest') == 'exports':
            folder = safe_name(q.get('folder', ''), '')
            d = os.path.join(self.app.store.exports_dir(pid), folder) if folder else self.app.store.exports_dir(pid)
        else:
            job = safe_name(q.get('job', ''), 'job')
            d = os.path.join(self.app.store.jobs_dir(), job)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), 'wb') as f:
            f.write(data)
        self.send_json({'ok': True, 'file': os.path.join(d, name), 'dir': d})

    def api_pptx(self, q, pid):
        from .pptx_export import build_pptx
        body = self.json_body()
        job = safe_name(body.get('job', ''), 'job')
        img_dir = os.path.join(self.app.store.jobs_dir(), job)
        out = os.path.join(self.app.store.exports_dir(pid), safe_name(body.get('name'), 'report') + '.pptx')
        build_pptx(body.get('spec', {}), img_dir, out)
        self.send_json({'ok': True, 'file': out, 'name': os.path.basename(out)})

    def api_exports(self, q, pid):
        d = self.app.store.exports_dir(pid)
        items = []
        for root, _dirs, files in os.walk(d):
            for fn in files:
                full = os.path.join(root, fn)
                items.append({'name': os.path.relpath(full, d).replace(os.sep, '/'), 'size': os.path.getsize(full),
                              'mtime': os.path.getmtime(full)})
        items.sort(key=lambda x: -x['mtime'])
        self.send_json({'dir': d, 'items': items[:300]})

    def api_export_file(self, q, pid):
        d = self.app.store.exports_dir(pid)
        full = os.path.realpath(os.path.join(d, q.get('name', '')))
        if os.path.commonpath([full, os.path.realpath(d)]) != os.path.realpath(d):
            raise PermissionError('bad path')
        self.send_file(full, download_name=os.path.basename(full) if q.get('dl') else None)

    # ------------------------------------------------------------------ api: video render
    def _session(self, job):
        s = self.app.renders.get(job)
        if not s:
            raise KeyError('render job')
        return s

    def api_render_start(self, q, pid):
        body = self.json_body()
        s = RenderSession(self.app.store.jobs_dir(), body)
        s.pid = pid
        self.app.renders[s.id] = s
        # forget stale sessions
        for k, old in list(self.app.renders.items()):
            if time.time() - old.created > 6 * 3600:
                old.cleanup()
                self.app.renders.pop(k, None)
        self.send_json({'job': s.id, 'encoder': s.encoder})

    def api_render_overlay(self, q, job, index):
        s = self._session(job)
        path = os.path.join(s.dir, f'overlay_{int(index):04d}.png')
        with open(path, 'wb') as f:
            f.write(self.body())
        self.send_json({'ok': True})

    def api_render_video(self, q, job, index):
        s = self._session(job)
        b = self.json_body()
        src = self.app.resolve(s.pid, b['path'])
        ov = os.path.join(s.dir, f'overlay_{int(index):04d}.png')
        s.encode_video(index, src, float(b['in']), float(b['dur']), ov if os.path.exists(ov) else None,
                       b.get('fadeIn'), b.get('fadeOut'), b.get('chromeIn'), b.get('chromeOut'),
                       b.get('transitions', True))
        self.send_json({'ok': True, 'encoder': s.encoder})

    def api_frames_begin(self, q, job, index):
        s = self._session(job)
        b = self.json_body()
        s.frames_begin(index, int(b['count']))
        self.send_json({'ok': True})

    def api_frames_data(self, q, job, index):
        s = self._session(job)
        s.frames_write(index, self.body())
        self.send_json({'ok': True})

    def api_frames_end(self, q, job, index):
        s = self._session(job)
        self.body()
        s.frames_end(index)
        self.send_json({'ok': True})

    def api_render_finish(self, q, job):
        s = self._session(job)
        b = self.json_body()
        music = None
        if b.get('music'):
            try:
                music = self.app.resolve(s.pid, b['music'])
            except (FileNotFoundError, PermissionError):
                music = None
        out = os.path.join(self.app.store.exports_dir(s.pid), safe_name(b.get('name'), 'drone-report') + '.mp4')
        s.finish(out, music, b.get('volume', 0.7), b.get('total'))
        if not b.get('keep'):
            s.cleanup()
            self.app.renders.pop(job, None)
        self.send_json({'ok': True, 'file': out, 'name': os.path.basename(out)})

    def api_render_cancel(self, q, job):
        self.body()
        s = self.app.renders.pop(job, None)
        if s:
            s.cleanup()
        self.send_json({'ok': True})

    def api_demo_start(self, q):
        self.body()
        app = self.app
        if getattr(app, 'demo', None) and app.demo['state'] == 'running':
            return self.send_json(app.demo)
        app.demo = {'state': 'running', 'log': [], 'project': None, 'error': None}

        def work():
            try:
                tools = os.path.join(os.path.dirname(APP_DIR), 'tools')
                if tools not in sys.path:
                    sys.path.insert(0, tools)
                import make_demo
                p = make_demo.create_demo(app.store.root, True, app.demo['log'].append)
                app.demo.update(state='done', project=p['id'])
            except Exception as e:  # noqa: BLE001
                traceback.print_exc()
                app.demo.update(state='error', error=str(e))

        threading.Thread(target=work, daemon=True).start()
        self.send_json(app.demo)

    def api_demo_status(self, q):
        self.send_json(getattr(self.app, 'demo', None) or {'state': 'idle'})

    def api_job_new(self, q):
        self.body()
        self.send_json({'job': uuid.uuid4().hex[:12]})


P = r'/api/p/([A-Za-z0-9_-]+)'
J = r'/api/render/([a-f0-9]+)'
ROUTES = [
    ('GET', r'/api/info', Handler.api_info),
    ('GET', r'/api/projects', Handler.api_projects),
    ('POST', r'/api/projects', Handler.api_project_create),
    ('POST', r'/api/pick-folder', Handler.api_pick_folder),
    ('POST', r'/api/check-folder', Handler.api_check_folder),
    ('POST', r'/api/job', Handler.api_job_new),
    ('POST', r'/api/demo', Handler.api_demo_start),
    ('GET', r'/api/demo', Handler.api_demo_status),
    ('GET', P, Handler.api_project_get),
    ('PUT', P, Handler.api_project_put),
    ('DELETE', P, Handler.api_project_delete),
    ('POST', P + r'/open', Handler.api_open),
    ('GET', P + r'/media', Handler.api_media),
    ('GET', P + r'/file', Handler.api_file),
    ('GET', P + r'/thumb', Handler.api_thumb),
    ('GET', P + r'/frame', Handler.api_frame),
    ('POST', P + r'/proxy', Handler.api_proxy),
    ('POST', P + r'/snapshot', Handler.api_snapshot),
    ('POST', P + r'/upload', Handler.api_upload),
    ('POST', P + r'/pptx', Handler.api_pptx),
    ('GET', P + r'/exports', Handler.api_exports),
    ('GET', P + r'/exports/file', Handler.api_export_file),
    ('POST', P + r'/render/start', Handler.api_render_start),
    ('POST', J + r'/overlay/(\d+)', Handler.api_render_overlay),
    ('POST', J + r'/video/(\d+)', Handler.api_render_video),
    ('POST', J + r'/frames/(\d+)/begin', Handler.api_frames_begin),
    ('POST', J + r'/frames/(\d+)/data', Handler.api_frames_data),
    ('POST', J + r'/frames/(\d+)/end', Handler.api_frames_end),
    ('POST', J + r'/finish', Handler.api_render_finish),
    ('POST', J + r'/cancel', Handler.api_render_cancel),
]


def serve(data_dir, host='127.0.0.1', port=8765):
    Handler.app = App(data_dir)
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    return httpd
