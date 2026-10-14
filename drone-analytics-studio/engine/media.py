"""FFmpeg helpers: locating ffmpeg, probing media, thumbnails, frame grabs and proxies.

Everything runs locally. Raw drone footage never leaves the machine.
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
import threading
import queue

VIDEO_EXT = {'.mp4', '.mov', '.m4v', '.avi', '.mkv', '.mts', '.m2ts', '.3gp', '.webm'}  # DJI .LRF low-res duplicates are skipped
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.bmp'}
AUDIO_EXT = {'.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'}
BROWSER_VIDEO_EXT = {'.mp4', '.mov', '.m4v', '.webm'}

_FFMPEG = None
_lock = threading.Lock()


def ffmpeg_path():
    """System ffmpeg if present (may have GPU encoders), else the one bundled by imageio-ffmpeg."""
    global _FFMPEG
    if _FFMPEG:
        return _FFMPEG
    candidates = [os.environ.get('DAS_FFMPEG'), shutil.which('ffmpeg')]
    try:
        import imageio_ffmpeg
        candidates.append(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception:
        pass
    for c in candidates:
        if c and os.path.isfile(c):
            _FFMPEG = c
            return c
    raise RuntimeError('FFmpeg not found. Run:  pip install imageio-ffmpeg')


def ffmpeg_version():
    try:
        out = subprocess.run([ffmpeg_path(), '-hide_banner', '-version'], capture_output=True, text=True,
                             errors='replace', timeout=20).stdout
        return out.splitlines()[0] if out else 'unknown'
    except Exception as e:  # noqa: BLE001
        return f'unavailable ({e})'


_ENCODERS = None


def available_encoders():
    global _ENCODERS
    if _ENCODERS is None:
        try:
            out = subprocess.run([ffmpeg_path(), '-hide_banner', '-encoders'], capture_output=True, text=True,
                                 errors='replace', timeout=20).stdout
        except Exception:
            out = ''
        _ENCODERS = [e for e in ('libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox')
                     if re.search(r'\s' + e + r'\s', out)]
    return _ENCODERS


def media_kind(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in VIDEO_EXT:
        return 'video'
    if ext in IMAGE_EXT:
        return 'image'
    if ext in AUDIO_EXT:
        return 'audio'
    return None


def file_key(path, *extra):
    st = os.stat(path)
    raw = '|'.join([os.path.abspath(path), str(st.st_size), str(int(st.st_mtime))] + [str(e) for e in extra])
    return hashlib.sha1(raw.encode('utf-8')).hexdigest()[:20]


def run(args, timeout=None):
    """Run ffmpeg with the given args, raising with the tail of stderr on failure."""
    cmd = [ffmpeg_path(), '-hide_banner', '-nostdin', '-loglevel', 'error'] + [str(a) for a in args]
    r = subprocess.run(cmd, capture_output=True, text=True, errors='replace', timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError('ffmpeg failed: ' + (r.stderr or '').strip()[-1500:])
    return r


def probe(path):
    """Return basic metadata. Uses `ffmpeg -i` parsing so no ffprobe is needed."""
    kind = media_kind(path)
    info = {'kind': kind}
    if kind == 'image':
        try:
            from PIL import Image
            with Image.open(path) as im:
                w, h = im.size
                try:
                    if im.getexif().get(0x0112, 1) in (5, 6, 7, 8):
                        w, h = h, w
                except Exception:
                    pass
            info.update(width=w, height=h)
        except Exception as e:  # noqa: BLE001
            info['error'] = str(e)
        return info

    r = subprocess.run([ffmpeg_path(), '-hide_banner', '-nostdin', '-i', path], capture_output=True, text=True,
                       errors='replace', timeout=60)
    s = r.stderr or ''
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)', s)
    if m:
        info['duration'] = round(int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)), 3)
    if kind == 'video':
        for line in s.splitlines():
            if 'Video:' in line and 'attached pic' not in line:
                mc = re.search(r'Video:\s*([A-Za-z0-9_]+)', line)
                mr = re.search(r',\s*(\d{2,5})x(\d{2,5})', line)
                mf = re.search(r'([\d.]+)\s*fps', line) or re.search(r'([\d.]+)\s*tbr', line)
                mp = re.search(r'Video:\s*[^,]+,\s*([a-z0-9]+)', line)
                if mc:
                    info['codec'] = mc.group(1)
                if mr:
                    info['width'], info['height'] = int(mr.group(1)), int(mr.group(2))
                if mf:
                    info['fps'] = round(float(mf.group(1)), 3)
                if mp:
                    info['pix'] = mp.group(1)
                break
        rot = re.search(r'rotation of (-?[\d.]+) degrees', s) or re.search(r'rotate\s*:\s*(-?\d+)', s)
        if rot and 'width' in info and abs(round(float(rot.group(1)))) % 180 == 90:
            info['width'], info['height'] = info['height'], info['width']
        ext = os.path.splitext(path)[1].lower()
        heavy = info.get('width', 0) * info.get('height', 0) > 1920 * 1088
        ten_bit = '10' in (info.get('pix') or '')
        info['needsProxy'] = bool(info.get('codec') != 'h264' or heavy or ten_bit or ext not in BROWSER_VIDEO_EXT)
    return info


def thumbnail(src, out, t=1.0, width=320):
    """Small JPEG preview for media lists and filmstrips."""
    if os.path.exists(out):
        return out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + '.tmp.jpg'
    if media_kind(src) == 'image':
        from PIL import Image, ImageOps
        with Image.open(src) as im:
            im.draft('RGB', (width * 2, width * 2))
            im = ImageOps.exif_transpose(im).convert('RGB')
            im.thumbnail((width, width * 4))
            im.save(tmp, 'JPEG', quality=82)
    else:
        run(['-ss', f'{max(0.0, t):.3f}', '-i', src, '-frames:v', '1', '-vf', f'scale={width}:-2', '-q:v', '5',
             '-y', tmp], timeout=120)
        if not os.path.exists(tmp):  # t beyond the end: take the first frame
            run(['-i', src, '-frames:v', '1', '-vf', f'scale={width}:-2', '-q:v', '5', '-y', tmp], timeout=120)
    os.replace(tmp, out)
    return out


def grab_frame(src, out, t=0.0, width=1920, duration=None):
    """Lossless PNG of the exact frame at time t (or a resized photo), used as freeze / still background."""
    if os.path.exists(out):
        return out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + '.tmp.png'
    if media_kind(src) == 'image':
        from PIL import Image, ImageOps
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert('RGB')
            if width and im.width > width:
                im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
            im.save(tmp, 'PNG', compress_level=1)
    else:
        if duration:
            t = min(t, max(0.0, duration - 0.05))
        # Strip colour tags: ffmpeg would otherwise write a BT.709 gAMA/cICP chunk that browsers
        # "correct", making the freeze frame brighter than the playing video around it.
        strip = 'format=rgb24,setparams=color_trc=unknown:color_primaries=unknown:colorspace=unknown'
        vf = (f'scale=w=min({width}\\,iw):h=-2:flags=lanczos,' if width else '') + strip
        run(['-ss', f'{max(0.0, t):.4f}', '-i', src, '-frames:v', '1', '-vf', vf, '-pix_fmt', 'rgb24',
             '-compression_level', '1', '-y', tmp], timeout=180)
        if not os.path.exists(tmp):
            run(['-sseof', '-0.2', '-i', src, '-frames:v', '1', '-vf', vf, '-pix_fmt', 'rgb24', '-y', tmp],
                timeout=180)
    os.replace(tmp, out)
    return out


def _progress_run(cmd, total, on_progress, cancel_event=None):
    """Run an ffmpeg command that writes `-progress pipe:1`, reporting 0..1 progress."""
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
                            text=True, errors='replace')
    err_lines = []

    def drain():
        for line in proc.stderr:
            err_lines.append(line)
            if len(err_lines) > 60:
                del err_lines[:20]

    th = threading.Thread(target=drain, daemon=True)
    th.start()
    for line in proc.stdout:
        if cancel_event is not None and cancel_event.is_set():
            proc.kill()
            break
        if line.startswith('out_time_ms=') or line.startswith('out_time_us='):
            try:
                us = int(line.split('=')[1])
                if total:
                    on_progress(min(0.999, us / 1e6 / total))
            except ValueError:
                pass
    proc.wait()
    th.join(timeout=2)
    if proc.returncode != 0:
        raise RuntimeError('ffmpeg failed: ' + ''.join(err_lines)[-1500:])


def make_proxy(src, out, duration, on_progress=lambda p: None, height=720):
    """Light H.264 copy for smooth scrubbing in the browser (originals are used for the final render)."""
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + '.part.mp4'
    base = [ffmpeg_path(), '-hide_banner', '-nostdin', '-y']
    tail = ['-i', src, '-map', '0:v:0', '-vf', f'scale=-2:{height}:flags=bicubic,format=yuv420p',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-g', '15', '-bf', '0',
            '-an', '-sn', '-dn', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp]
    try:
        _progress_run(base + ['-hwaccel', 'auto'] + tail, duration, on_progress)
    except RuntimeError:
        _progress_run(base + tail, duration, on_progress)
    os.replace(tmp, out)
    on_progress(1.0)
    return out


class ProxyQueue:
    """Single background worker so proxy creation never fights the UI for CPU."""

    def __init__(self):
        self.q = queue.Queue()
        self.state = {}  # out path -> {'state': queued|running|error, 'progress': float, 'error': str}
        self.lock = threading.Lock()
        threading.Thread(target=self._worker, daemon=True).start()

    def status(self, out):
        if os.path.exists(out):
            return {'state': 'ready', 'progress': 1.0}
        with self.lock:
            return dict(self.state.get(out, {'state': 'none', 'progress': 0.0}))

    def request(self, src, out, duration):
        with self.lock:
            st = self.state.get(out)
            if os.path.exists(out) or (st and st['state'] in ('queued', 'running')):
                return
            self.state[out] = {'state': 'queued', 'progress': 0.0}
        self.q.put((src, out, duration))

    def _worker(self):
        while True:
            src, out, duration = self.q.get()
            with self.lock:
                self.state[out] = {'state': 'running', 'progress': 0.0}

            def prog(p, out=out):
                with self.lock:
                    self.state[out]['progress'] = round(p, 3)

            try:
                make_proxy(src, out, duration, prog)
                with self.lock:
                    self.state.pop(out, None)
            except Exception as e:  # noqa: BLE001
                with self.lock:
                    self.state[out] = {'state': 'error', 'progress': 0.0, 'error': str(e)[-400:]}
                print(f'[proxy] failed for {src}: {e}', file=sys.stderr)
