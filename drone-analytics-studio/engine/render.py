"""Video render sessions.

The browser draws every designed frame (title cards, freeze-frame analysis, dashboards) with the exact
same code it uses for the live preview, and streams them here as JPEGs. Plain footage segments are cut
straight from the original files by ffmpeg with a transparent overlay for the on-screen branding.
All segments share identical encoder settings and are concatenated losslessly at the end.
"""
import os
import shutil
import subprocess
import threading
import time
import uuid

from . import media

QUALITY = {
    'draft': {'crf': 26, 'preset': 'veryfast', 'cq': 28},
    'high': {'crf': 19, 'preset': 'medium', 'cq': 21},
    'max': {'crf': 16, 'preset': 'slow', 'cq': 18},
}

# Must match the JS renderer (app/js/timeline.js -> FX)
DIP = 0.35
CHROME_IN_START, CHROME_IN_DUR = 0.2, 0.6
CHROME_OUT_DUR, CHROME_OUT_END = 0.5, 0.1

COLOR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']


class RenderSession:
    def __init__(self, root, settings):
        self.id = uuid.uuid4().hex[:12]
        self.dir = os.path.join(root, self.id)
        os.makedirs(self.dir, exist_ok=True)
        self.w = int(settings.get('width', 1920))
        self.h = int(settings.get('height', 1080))
        self.fps = int(settings.get('fps', 30))
        self.quality = QUALITY.get(settings.get('quality', 'high'), QUALITY['high'])
        enc = settings.get('encoder', 'auto')
        self.encoder = enc if enc in media.available_encoders() else 'libx264'
        self.segments = {}
        self.pipes = {}
        self.cancelled = False
        self.created = time.time()
        self.lock = threading.Lock()

    # ---------------------------------------------------------------- encoder settings
    def _venc(self, encoder=None):
        enc = encoder or self.encoder
        g = str(self.fps * 2)
        if enc == 'h264_nvenc':
            v = ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', str(self.quality['cq']), '-b:v', '0',
                 '-g', g, '-bf', '2', '-profile:v', 'high']
        elif enc in ('h264_qsv', 'h264_amf', 'h264_videotoolbox'):
            v = ['-c:v', enc, '-b:v', '40M' if self.h > 1500 else '16M', '-g', g]
        else:
            v = ['-c:v', 'libx264', '-preset', self.quality['preset'], '-crf', str(self.quality['crf']),
                 '-profile:v', 'high', '-x264-params', f'keyint={g}:min-keyint={g}:scenecut=0:bframes=2:ref=3']
        return v + ['-pix_fmt', 'yuv420p', '-r', str(self.fps), '-video_track_timescale', str(self.fps * 1000),
                    '-an'] + COLOR_TAGS

    def _seg_path(self, index):
        return os.path.join(self.dir, f'seg_{int(index):04d}.mp4')

    def _run_with_fallback(self, build):
        """build(encoder) -> cmd. Retry on libx264 when a GPU encoder is unavailable on this machine."""
        try:
            media.run(build(self.encoder))
        except RuntimeError:
            if self.encoder == 'libx264':
                raise
            self.encoder = 'libx264'
            media.run(build('libx264'))

    # ---------------------------------------------------------------- footage segments
    def encode_video(self, index, src, t_in, dur, overlay=None, fade_in=False, fade_out=False,
                     chrome_in=False, chrome_out=False, transitions=True):
        if self.cancelled:
            raise RuntimeError('cancelled')
        n = max(1, round(dur * self.fps))
        dur = n / self.fps
        W, H, fps = self.w, self.h, self.fps
        out = self._seg_path(index)
        base = (f'[0:v]scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},setsar=1,'
                f'fps={fps},tpad=stop_mode=clone:stop_duration=2')
        graph = base + '[base]'
        last = 'base'
        if overlay:
            ov = '[1:v]format=rgba'
            if chrome_in:
                ov += f',fade=t=in:st={CHROME_IN_START}:d={CHROME_IN_DUR}:alpha=1'
            if chrome_out:
                ov += f',fade=t=out:st={max(0.0, dur - CHROME_OUT_DUR - CHROME_OUT_END):.4f}:d={CHROME_OUT_DUR}:alpha=1'
            graph += f';{ov}[ov];[base][ov]overlay=0:0:shortest=1[comp]'
            last = 'comp'
        post = []
        if transitions and fade_in:
            post.append(f'fade=t=in:st=0:d={DIP}')
        if transitions and fade_out:
            post.append(f'fade=t=out:st={max(0.0, dur - DIP):.4f}:d={DIP}')
        post.append('scale=out_color_matrix=bt709:out_range=tv')
        post.append('format=yuv420p')
        graph += f';[{last}]' + ','.join(post) + '[out]'

        def build(enc):
            cmd = ['-ss', f'{max(0.0, t_in - 0.002):.4f}', '-t', f'{dur + 0.5:.4f}', '-i', src]
            if overlay:
                cmd += ['-framerate', str(fps), '-loop', '1', '-t', f'{dur + 0.5:.4f}', '-i', overlay]
            return cmd + ['-filter_complex', graph, '-map', '[out]', '-frames:v', str(n)] + self._venc(enc) + ['-y', out]

        self._run_with_fallback(build)
        self.segments[int(index)] = out
        return out

    # ---------------------------------------------------------------- designed (browser-drawn) segments
    def frames_begin(self, index, count):
        if self.cancelled:
            raise RuntimeError('cancelled')
        out = self._seg_path(index)
        log = open(os.path.join(self.dir, f'seg_{int(index):04d}.log'), 'wb')
        # JPEG (full-range BT.601) -> RGB -> limited-range BT.709, via RGB so swscale applies the matrices
        # properly; keeps designed frames colour-matched with the footage around them.
        vf = (f'scale={self.w}:{self.h}:in_range=pc:in_color_matrix=bt601:flags=bicubic+accurate_rnd+full_chroma_int,'
              'format=gbrp,scale=out_range=tv:out_color_matrix=bt709:flags=bicubic+accurate_rnd+full_chroma_inp,'
              'format=yuv420p')

        def start(enc):
            cmd = [media.ffmpeg_path(), '-hide_banner', '-nostdin', '-loglevel', 'error',
                   '-f', 'image2pipe', '-framerate', str(self.fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
                   '-vf', vf, '-frames:v', str(int(count))] + self._venc(enc) + ['-y', out]
            return subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)

        proc = start(self.encoder)
        time.sleep(0.05)
        if proc.poll() is not None and self.encoder != 'libx264':
            self.encoder = 'libx264'
            proc = start('libx264')
        self.pipes[int(index)] = {'proc': proc, 'log': log, 'out': out, 'count': int(count)}

    def frames_write(self, index, data):
        p = self.pipes.get(int(index))
        if not p:
            raise RuntimeError('segment not started')
        try:
            p['proc'].stdin.write(data)
        except (BrokenPipeError, OSError):
            raise RuntimeError('encoder stopped: ' + self._log_tail(index))

    def frames_end(self, index):
        p = self.pipes.pop(int(index), None)
        if not p:
            raise RuntimeError('segment not started')
        try:
            p['proc'].stdin.close()
        except OSError:
            pass
        p['proc'].wait()
        p['log'].close()
        if p['proc'].returncode != 0 or not os.path.exists(p['out']):
            raise RuntimeError('frame segment failed: ' + self._log_tail(index))
        self.segments[int(index)] = p['out']
        return p['out']

    def _log_tail(self, index):
        try:
            with open(os.path.join(self.dir, f'seg_{int(index):04d}.log'), 'r', errors='replace') as f:
                return f.read()[-1200:]
        except OSError:
            return ''

    # ---------------------------------------------------------------- final assembly
    def finish(self, out_path, music=None, volume=0.7, total=None):
        if self.cancelled:
            raise RuntimeError('cancelled')
        idx = sorted(self.segments)
        if not idx:
            raise RuntimeError('nothing rendered')
        lst = os.path.join(self.dir, 'concat.txt')
        with open(lst, 'w', encoding='utf-8') as f:
            for i in idx:
                f.write("file '" + self.segments[i].replace('\\', '/').replace("'", "'\\''") + "'\n")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        tmp = out_path + '.part.mp4'
        cmd = ['-f', 'concat', '-safe', '0', '-i', lst]
        if music and os.path.exists(music):
            total = float(total or 0)
            fade_st = max(0.0, total - 3.0)
            cmd += ['-stream_loop', '-1', '-i', music, '-map', '0:v', '-map', '1:a',
                    '-af', f'volume={float(volume):.2f},afade=t=in:d=1.5,afade=t=out:st={fade_st:.2f}:d=3',
                    '-c:a', 'aac', '-b:a', '192k']
            if total:
                cmd += ['-t', f'{total:.3f}']
            else:
                cmd += ['-shortest']
        else:
            cmd += ['-map', '0:v']
        cmd += ['-c:v', 'copy', '-movflags', '+faststart', '-f', 'mp4', '-y', tmp]
        media.run(cmd)
        os.replace(tmp, out_path)
        return out_path

    def cancel(self):
        self.cancelled = True
        for p in list(self.pipes.values()):
            try:
                p['proc'].kill()
            except OSError:
                pass
        self.pipes.clear()

    def cleanup(self):
        self.cancel()
        shutil.rmtree(self.dir, ignore_errors=True)
