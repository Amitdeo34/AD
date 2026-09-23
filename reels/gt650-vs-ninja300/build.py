"""Render the "Continental GT 650 vs Ninja 300" Instagram Reel (1080x1920, 30 fps).

Run voiceover.py first; scene lengths follow the narrator, so the cut always
lands on the voice. Visuals are motion graphics built from the illustrations in
bikes.py; the audio is the voiceover over a synthesized beat and twin-cylinder
engine sounds, ducked under the voice.

Usage:
    python3 build.py                 # -> out/gt650-vs-ninja300.mp4 (+ .srt, cover.png)
    python3 build.py --stills 1 7.5  # write preview frames at those times only
"""

import argparse
import json
import math
import os
import random
import re
import subprocess
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.signal import butter, lfilter

from bikes import Bike

HERE = os.path.dirname(os.path.abspath(__file__))
VO_DIR = os.path.join(HERE, "build", "vo")
OUT_DIR = os.path.join(HERE, "out")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H, FPS = 1080, 1920, 30
SR = 48000
VO_LEAD = 0.06      # voice starts this long after each cut
TAIL = 0.18         # breathing room after the last word of a scene
OUTRO_HOLD = 1.0    # extra hold on the call to action
CAP_Y = 1500        # caption baseline zone, clear of Instagram's bottom UI

YELLOW = (255, 212, 0)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (206, 30, 38)
GREEN = (104, 190, 34)

ANTON = os.path.join(HERE, "assets", "fonts", "Anton-Regular.ttf")
BEBAS = os.path.join(HERE, "assets", "fonts", "BebasNeue-Regular.ttf")
_fonts = {}


def font(size, path=ANTON):
    size = max(8, int(size))
    key = (path, size)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(path, size)
    return _fonts[key]


# --- easing & small helpers ---------------------------------------------------

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return 3 * x * x - 2 * x * x * x


def back_out(x, s=2.2):
    x = clamp(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def pop(lt, t0, dur=0.22):
    """0 before t0, overshooting 0->1 scale over ``dur``."""
    return 0.0 if lt < t0 else back_out((lt - t0) / dur)


def text(img, xy, s, size, fill=WHITE, stroke=8, anchor="mm", path=ANTON, shadow=True):
    d = ImageDraw.Draw(img)
    f = font(size, path)
    if shadow:
        d.text((xy[0] + size * 0.05, xy[1] + size * 0.07), s, font=f, fill=(0, 0, 0), anchor=anchor,
               stroke_width=stroke, stroke_fill=(0, 0, 0))
    d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=BLACK)


def fit_size(s, size, max_w, path=ANTON):
    w = font(size, path).getlength(s)
    return size if w <= max_w else size * max_w / w


def stamp(img, center, s, size, fill, bg, angle=0.0, scale=1.0, pad=(34, 16)):
    """A rotated label with a solid background, popping in with ``scale``."""
    if scale <= 0.01:
        return
    f = font(size * scale)
    tw = f.getlength(s)
    bw, bh = int(tw + 2 * pad[0] * scale), int(size * scale * 1.25 + 2 * pad[1] * scale)
    lab = Image.new("RGBA", (bw + 20, bh + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(lab)
    d.rounded_rectangle((10, 10, 10 + bw, 10 + bh), int(14 * scale), fill=bg + (255,),
                        outline=BLACK + (255,), width=max(2, int(6 * scale)))
    d.text((10 + bw / 2, 10 + bh / 2), s, font=f, fill=fill, anchor="mm")
    if angle:
        lab = lab.rotate(angle, expand=True, resample=Image.BICUBIC)
    img.paste(lab, (int(center[0] - lab.width / 2), int(center[1] - lab.height / 2)), lab)


def place(img, sprite, center, width, angle=0.0, alpha=1.0, flip=False):
    """Paste a bike sprite scaled to ``width`` px, centred on ``center``."""
    h = int(width * sprite.height / sprite.width)
    sp = sprite.resize((int(width), h), Image.BILINEAR)
    if flip:
        sp = sp.transpose(Image.FLIP_LEFT_RIGHT)
    if angle:
        sp = sp.rotate(angle, expand=True, resample=Image.BILINEAR)
    if alpha < 1:
        a = sp.getchannel("A").point(lambda v: int(v * alpha))
        sp.putalpha(a)
    img.paste(sp, (int(center[0] - sp.width / 2), int(center[1] - sp.height / 2)), sp)


def to_screen(p, center, width):
    """Map a bike-canvas point (1400x800 space) to screen for place()."""
    s = width / 1400
    return center[0] + (p[0] - 700) * s, center[1] + (p[1] - 400) * s


# --- backgrounds ---------------------------------------------------------------

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def vgrad(top, bottom, y0=0, y1=H):
    t = np.clip((YY - y0) / (y1 - y0), 0, 1)[..., None]
    a = np.array(top, np.float32) * (1 - t) + np.array(bottom, np.float32) * t
    return a


def radial(center, inner, outer, r):
    t = np.clip(np.hypot(XX - center[0], YY - center[1]) / r, 0, 1)[..., None] ** 1.3
    return np.array(inner, np.float32) * (1 - t) + np.array(outer, np.float32) * t


def img_of(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")


VIGNETTE = (np.clip(1.15 - 0.55 * (((XX - W / 2) / (W * 0.75)) ** 2 + ((YY - H / 2) / (H * 0.62)) ** 2),
                    0.35, 1.0) * 256).astype(np.uint16)[..., None]


def carbon():
    a = np.full((H, W, 3), 14, np.float32)
    weave = ((XX // 18 + YY // 18) % 2) * 8 + ((XX + YY) % 36 < 18) * 4
    return a + weave[..., None]


def mountains(seed, color, base, amp, width):
    rnd = random.Random(seed)
    im = Image.new("RGBA", (width, H), (0, 0, 0, 0))
    pts, x = [(0, H)], 0
    while x <= width:
        pts.append((x, base - rnd.uniform(0.2, 1.0) * amp))
        x += rnd.randint(80, 200)
    pts += [(width, base - amp * 0.5), (width, H)]
    ImageDraw.Draw(im).polygon(pts, fill=color)
    return im


# --- voiceover timing -----------------------------------------------------------

def load_vo():
    scenes = []
    for n in range(1, 8):
        with open(os.path.join(VO_DIR, f"scene{n}.json")) as f:
            words = json.load(f)
        audio = decode(os.path.join(VO_DIR, f"scene{n}.mp3"))
        dur = words[-1]["end"] + VO_LEAD + TAIL
        audio = audio[:int((words[-1]["end"] + 0.25) * SR)]  # drop trailing silence
        if n == 7:
            dur += OUTRO_HOLD
        for w in words:
            w["start"] += VO_LEAD
            w["end"] += VO_LEAD
        scenes.append({"words": words, "audio": audio, "dur": dur})
    t = 0.0
    for s in scenes:
        s["start"] = t
        t += s["dur"]
    return scenes, t


def decode(path):
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def at(words, token, nth=0):
    """Start time of the nth caption token matching ``token`` (case-insensitive prefix)."""
    hits = [w["start"] for w in words if w["text"].lower().startswith(token.lower())]
    return hits[min(nth, len(hits) - 1)] if hits else 0.0


# --- captions ------------------------------------------------------------------

def phrases(words):
    """Group caption tokens into short kinetic lines (<= 3 tokens, break on punctuation)."""
    out, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) == 3 or re.search(r"[.,!?:]$", w["text"]):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def draw_captions(img, groups, lt, scene_dur):
    for i, g in enumerate(groups):
        t0 = g[0]["start"] - 0.04
        t1 = groups[i + 1][0]["start"] - 0.04 if i + 1 < len(groups) else scene_dur
        if t0 <= lt < t1:
            break
    else:
        return
    toks = [w["text"].upper() for w in g]
    base = 104
    space = font(base).getlength(" ")
    total = sum(font(base).getlength(t) for t in toks) + space * (len(toks) - 1)
    size = base * min(1.0, 960 / total)
    space = font(size).getlength(" ") * 1.6  # room for the active word's scale-up
    widths = [font(size).getlength(t) for t in toks]
    x = W / 2 - (sum(widths) + space * (len(toks) - 1)) / 2
    active = None
    for j, w in enumerate(g):
        if w["start"] <= lt:
            active = j
    for j, (w, t, tw) in enumerate(zip(g, toks, widths)):
        cx = x + tw / 2
        x += tw + space
        if lt < w["start"] - 0.02:
            continue
        sc = 0.55 + 0.45 * back_out((lt - w["start"] + 0.02) / 0.16)
        on = j == active
        if on:
            sc *= 1.05
        text(img, (cx, CAP_Y - (6 if on else 0)), t, size * sc, fill=YELLOW if on else WHITE, stroke=10)


# --- scenes -----------------------------------------------------------------------

class Assets:
    def __init__(self):
        self.gt = Bike("gt")
        self.ninja = Bike("ninja")
        self.bg_red = img_of(vgrad((120, 12, 18), (30, 4, 8)))
        self.bg_green = img_of(vgrad((40, 110, 20), (6, 28, 8)))
        self.studio = img_of(radial((540, 880), (110, 52, 36), (10, 6, 6), 1100))
        self.dusk = img_of(vgrad((8, 46, 38), (2, 10, 12)))
        self.carbon = img_of(carbon())
        self.cta = img_of(radial((540, 760), (58, 30, 80), (6, 4, 12), 1300))
        self.sky = img_of(vgrad((40, 14, 60), (255, 136, 56), 0, 1060))
        self.far = mountains(3, (92, 36, 72, 255), 1060, 260, W * 2)
        self.near = mountains(7, (44, 16, 40, 255), 1120, 170, W * 2)


def split_panels(A, lt, dim_top=0.0, dim_bot=0.0):
    img = A.bg_red.copy()
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([(0, 1030), (W, 870), (W, H), (0, H)], fill=255)
    img.paste(A.bg_green, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.line([(0, 1030), (W, 870)], fill=YELLOW, width=10)
    return img


def dim_region(img, poly, amount):
    if amount <= 0:
        return
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ov).polygon(poly, fill=(0, 0, 0, int(200 * amount)))
    img.paste(ov, (0, 0), ov)


TOP_POLY = [(0, 0), (W, 0), (W, 870), (0, 1030)]
BOT_POLY = [(0, 1030), (W, 870), (W, H), (0, H)]


def scene1(A, lt, d, words):
    if lt < 1.5:  # rapid cuts
        k = int(lt / 0.19)
        gt = k % 2 == 0
        img = (A.bg_red if gt else A.bg_green).copy()
        z = 1.0 + 0.08 * ((lt % 0.19) / 0.19)
        bike = (A.gt if gt else A.ninja).render(-lt * 900)
        place(img, bike, (540 + (k % 3 - 1) * 20, 900), 1060 * z, angle=(-3 if gt else 3))
        text(img, (540, 420), "GT 650" if gt else "NINJA 300", 150, fill=WHITE, stroke=10)
    else:
        img = split_panels(A, lt)
        p = ease_out((lt - 1.5) / 0.45)
        place(img, A.gt.render(-lt * 300), (540 - (1 - p) * 900, 740), 880)
        place(img, A.ninja.render(-lt * 300), (540 + (1 - p) * 900, 1180), 860, flip=True)
        s = pop(lt, 1.75, 0.3)
        if s:
            ImageDraw.Draw(img).ellipse((540 - 95 * s, 950 - 95 * s, 540 + 95 * s, 950 + 95 * s), fill=YELLOW,
                                        outline=BLACK, width=8)
            text(img, (540, 952), "VS", 100 * s, fill=BLACK, stroke=0, shadow=False)
    s = pop(lt, at(words, "₹"))
    if s:
        text(img, (540, 300), "BOTH ~₹3.5 LAKHS...", 108 * s, fill=WHITE, stroke=9)
    s = pop(lt, at(words, "but"))
    if s:
        text(img, (540, 430), "WHICH TWIN?", 150 * s, fill=YELLOW, stroke=10)
    return img


def callout(img, target, label_xy, s, t):
    """Animated pointer from a bike part to a label; t in 0..1."""
    if t <= 0:
        return
    d = ImageDraw.Draw(img)
    e = ease_out(t / 0.5)
    lx = target[0] + (label_xy[0] - target[0]) * e
    ly = target[1] + (label_xy[1] - target[1]) * e
    d.ellipse((target[0] - 14, target[1] - 14, target[0] + 14, target[1] + 14), fill=YELLOW, outline=BLACK, width=4)
    d.line([target, (lx, ly)], fill=YELLOW, width=6)
    if t > 0.35:
        stamp(img, label_xy, s, 50, BLACK, YELLOW, scale=back_out((t - 0.35) / 0.3))


def scene2(A, lt, d, words):
    img = A.studio.copy()
    dr = ImageDraw.Draw(img)
    dr.rectangle((0, 1180, W, H), fill=(14, 8, 8))
    zoom = 1.0 + 0.10 * ease_in_out(lt / d)
    width = 1020 * zoom
    c = (560 - 40 * ease_in_out(lt / d), 900)
    bike = A.gt.render(-lt * 40)  # slow-motion roll
    # light sweep across the paintwork
    sweep = Image.new("L", bike.size, 0)
    sx = -400 + 2200 * ((lt / 3.2) % 1.0)
    ImageDraw.Draw(sweep).polygon([(sx, 0), (sx + 140, 0), (sx - 160, 800), (sx - 300, 800)], fill=110)
    sweep = sweep.filter(ImageFilter.GaussianBlur(30))
    alpha = bike.getchannel("A")
    hl = Image.new("RGBA", bike.size, (255, 255, 255, 0))
    hl.putalpha(Image.fromarray((np.asarray(sweep, np.uint16) * np.asarray(alpha, np.uint16) // 255).astype(np.uint8)))
    bike.alpha_composite(hl)
    # floor reflection
    refl = bike.transpose(Image.FLIP_TOP_BOTTOM)
    place(img, refl, (c[0], c[1] + width * 800 / 1400 * 0.83), width, alpha=0.16)
    place(img, bike, c, width)
    t_re = at(words, "Royal")
    s = pop(lt, t_re)
    if s:
        text(img, (540, 250), "ROYAL ENFIELD", 64 * s, fill=WHITE, stroke=6, path=BEBAS)
        text(img, (540, 350), "CONTINENTAL GT 650", fit_size("CONTINENTAL GT 650", 120, 1000) * s, fill=RED, stroke=9)
    for tok, lab, x in (("650CC", "650CC", 330), ("52 NM", "52 NM TORQUE", 700)):
        s = pop(lt, at(words, tok), 0.25)
        if s:
            stamp(img, (x, 505), lab, 64, BLACK, YELLOW, angle=-4, scale=s)
    callout(img, to_screen((300, 540), c, width), (250, 1290), "TWIN EXHAUSTS", lt - 0.5)
    callout(img, to_screen((872, 252), c, width), (830, 640), "CLIP-ONS", lt - 1.6)
    callout(img, to_screen((360, 262), c, width), (300, 660), "CAFÉ RACER SOUL", lt - at(words, "retro") + 0.2)
    return img


def gt_rpm_s3(lt):
    """GT 650 revs through scene 3: pull to 5,800, shift, pull again."""
    if lt < 2.4:
        return 1500 + 4300 * ease_in_out(lt / 2.4)
    if lt < 2.65:
        return 5800 - 2400 * ((lt - 2.4) / 0.25)
    return 3400 + 3000 * ease_in_out((lt - 2.65) / 2.6)


def scene3(A, lt, d, words):
    img = A.sky.copy()
    dr = ImageDraw.Draw(img)
    dr.ellipse((720, 880, 960, 1120), fill=(255, 214, 120))
    speed = 0.25 + 1.6 * ease_in_out(lt / d)  # screen widths/sec, roughly
    dist = 0.25 * lt + 0.8 * (lt ** 2) / d
    for layer, k in ((A.far, 0.12), (A.near, 0.35)):
        off = int((dist * W * k) % W)
        img.paste(layer.crop((off, 0, off + W, H)), (0, 0), layer.crop((off, 0, off + W, H)))
    dr.rectangle((0, 1180, W, H), fill=(22, 20, 26))
    dr.rectangle((0, 1180, W, 1192), fill=(200, 190, 180))
    dr.rectangle((0, 1440, W, 1452), fill=(200, 190, 180))
    dash_off = (dist * W * 1.4) % 240
    for x in np.arange(-dash_off, W + 240, 240):
        dr.rectangle((x, 1308, x + 130, 1322), fill=(240, 220, 120))
    rnd = random.Random(int(lt * FPS))
    for _ in range(int(10 + 30 * speed)):  # speed streaks
        y = rnd.uniform(420, 1440)
        x = rnd.uniform(-200, W)
        ln = 80 + 260 * speed
        dr.line([(x, y), (x + ln, y)], fill=(255, 240, 220), width=rnd.choice((2, 3, 4)))
    shake = 4 + 10 * speed
    bx = 300 + 280 * ease_out(lt / 2.0) + rnd.uniform(-shake, shake) * 0.4
    lift = 7 * clamp((lt - 0.2) / 0.4) * (1 - clamp((lt - 2.3) / 0.4)) + 4 * clamp((lt - 2.8) / 0.5)
    width = 900
    c = (bx, 1330 - 0.42 * width * 800 / 1400 + rnd.uniform(-shake, shake) * 0.3)
    # exhaust puffs trailing from the peashooters
    tip = to_screen((200, 548), c, width)
    for i in range(8):
        age = ((lt * 3 + i / 8) % 1.0)
        r = 20 + 90 * age
        px = tip[0] - age * 500 * speed
        a = int(110 * (1 - age))
        puff = Image.new("RGBA", (int(2 * r), int(2 * r)), (0, 0, 0, 0))
        ImageDraw.Draw(puff).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=(200, 190, 190, a))
        img.paste(puff, (int(px - r), int(tip[1] - r - age * 60)), puff)
    place(img, A.gt.render(-lt * 2200 * speed, blur=2), c, width, angle=lift)
    # HUD: speed + torque meter
    kmh = int(20 + 130 * ease_in_out(lt / d))
    text(img, (820, 250), f"{kmh}", 140, fill=WHITE, stroke=8)
    text(img, (820, 350), "KM/H", 50, fill=YELLOW, stroke=5)
    dr = ImageDraw.Draw(img)
    rpm = gt_rpm_s3(lt)
    dr.rounded_rectangle((70, 230, 560, 290), 14, fill=(0, 0, 0), outline=WHITE, width=4)
    dr.rounded_rectangle((78, 238, 78 + 474 * clamp(rpm / 6500), 282), 10, fill=RED)
    text(img, (315, 340), "LOW-END GRUNT", 52, fill=WHITE, stroke=5)
    s = pop(lt, at(words, "rumble"))
    if s:
        j = 8 if lt > at(words, "rumble") else 0
        text(img, (540 + rnd.uniform(-j, j), 560 + rnd.uniform(-j, j)), "RUMBLE!", 170 * s, fill=YELLOW, stroke=11)
    s = pop(lt, at(words, "muscle"))
    if s and lt < at(words, "rumble"):
        text(img, (540, 560), "MUSCLE-CAR PULL", 110 * s, fill=WHITE, stroke=9)
    return img


def road_ribbon(img, scroll, color=(34, 38, 40)):
    d = ImageDraw.Draw(img)
    pts = [(540 + 300 * math.sin((y + scroll) / 330), y) for y in range(-60, H + 80, 20)]
    d.line(pts, fill=(200, 210, 200), width=300, joint="curve")
    d.line(pts, fill=color, width=270, joint="curve")
    for i in range(0, len(pts) - 1):
        if ((i * 20 + int(scroll)) // 60) % 2:
            d.line([pts[i], pts[i + 1]], fill=(250, 230, 120), width=8)


def ninja_lean(lt):
    return 13 * math.sin(lt * 2.4)


def scene4(A, lt, d, words):
    img = A.dusk.copy()
    road_ribbon(img, lt * 900)
    img = Image.blend(img, A.dusk, 0.45)
    dr = ImageDraw.Draw(img)
    rnd = random.Random(int(lt * FPS) + 99)
    for _ in range(40):
        x, y = rnd.uniform(-200, W), rnd.uniform(0, H)
        dr.line([(x, y), (x + 220, y - 90)], fill=(150, 230, 90), width=rnd.choice((2, 3)))
    lean = ninja_lean(lt)
    c = (540 + 40 * math.sin(lt * 2.4), 960)
    place(img, A.ninja.render(-lt * 1800, blur=2), c, 1000, angle=lean)
    s = pop(lt, at(words, "Kawasaki"))
    if s:
        text(img, (540, 250), "KAWASAKI", 64 * s, fill=WHITE, stroke=6, path=BEBAS)
        text(img, (540, 350), "NINJA 300", 150 * s, fill=GREEN, stroke=10)
    for tok, lab, xy, ang in (("300CC", "300CC", (270, 1270), -5), ("liquid", "LIQUID-COOLED", (720, 1270), 4),
                              ("Japanese", "JAPANESE PRECISION", (540, 530), -2)):
        s = pop(lt, at(words, tok), 0.25)
        if s:
            stamp(img, xy, lab, 58, BLACK, GREEN if tok != "Japanese" else YELLOW, angle=ang, scale=s)
    return img


def tach_rpm(lt, words):
    """Ninja revs in scene 5, shared by the tach needle and the engine sound."""
    t_red = at(words, "11,000")
    t_hand = at(words, "handles")
    if lt < 0.5:
        return 3000 + 5000 * math.sin(math.pi * lt / 0.5) ** 2
    if lt < t_red - 0.4:
        return 3000
    if lt < t_hand - 0.2:
        up = ease_out((lt - (t_red - 0.4)) / 0.55)
        return 3000 + 8000 * up + 250 * math.sin(lt * 70) * up
    # cornering: shifts and rev blips between 8k and 11k
    return 9000 + 1600 * math.sin((lt - t_hand) * 7.0)


def draw_tach(img, c, r, rpm):
    d = ImageDraw.Draw(img)
    d.ellipse((c[0] - r - 18, c[1] - r - 18, c[0] + r + 18, c[1] + r + 18), fill=(10, 10, 12), outline=(90, 94, 100),
              width=10)
    a0, a1, mx = 135, 405, 14000

    def ang(v):
        return math.radians(a0 + (a1 - a0) * v / mx)

    d.arc((c[0] - r + 10, c[1] - r + 10, c[0] + r - 10, c[1] + r - 10), a0 + (a1 - a0) * 11500 / mx, a1,
          fill=(230, 30, 30), width=34)
    for v in range(0, mx + 1, 500):
        a = ang(v)
        big = v % 1000 == 0
        r0 = r - (60 if big else 38)
        d.line([(c[0] + r0 * math.cos(a), c[1] + r0 * math.sin(a)),
                (c[0] + (r - 14) * math.cos(a), c[1] + (r - 14) * math.sin(a))],
               fill=(255, 80, 80) if v >= 11500 else WHITE, width=8 if big else 4)
        if big:
            text(img, (c[0] + (r - 105) * math.cos(a), c[1] + (r - 105) * math.sin(a)), str(v // 1000), r * 0.17,
                 fill=WHITE, stroke=0, shadow=False)
    a = ang(rpm)
    tip = (c[0] + (r - 30) * math.cos(a), c[1] + (r - 30) * math.sin(a))
    tail = (c[0] - 50 * math.cos(a), c[1] - 50 * math.sin(a))
    d.line([tail, tip], fill=(255, 120, 0), width=14)
    d.ellipse((c[0] - 34, c[1] - 34, c[0] + 34, c[1] + 34), fill=(30, 30, 34), outline=(255, 120, 0), width=6)
    text(img, (c[0], c[1] + r * 0.45), f"{int(rpm) // 100 * 100:,}", r * 0.22, fill=YELLOW, stroke=0, shadow=False)
    text(img, (c[0], c[1] + r * 0.63), "RPM x1000", r * 0.08, fill=(170, 170, 170), stroke=0, shadow=False,
         path=BEBAS)
    if rpm > 10500:  # shift light
        d.ellipse((c[0] - 26, c[1] - r * 0.52 - 26, c[0] + 26, c[1] - r * 0.52 + 26), fill=(255, 40, 40))


def scene5(A, lt, d, words):
    img = A.carbon.copy()
    rpm = tach_rpm(lt, words)
    t_hand = at(words, "handles")
    k = ease_in_out((lt - t_hand + 0.3) / 0.5)
    r = 400 - 110 * k
    c = (540, 860 - 200 * k)
    jitter = 6 if rpm > 10500 else 0
    draw_tach(img, (c[0] + random.uniform(-jitter, jitter), c[1]), r, rpm)
    s = pop(lt, at(words, "35 KG"))
    if s and k < 0.5:
        stamp(img, (540, 290), "-35 KG LIGHTER", 78, BLACK, YELLOW, angle=-4, scale=s)
    if k > 0:
        lean = ninja_lean(lt * 1.4)
        dr = ImageDraw.Draw(img)
        rnd = random.Random(int(lt * FPS))
        for _ in range(30):
            y = rnd.uniform(1050, 1450)
            x = rnd.uniform(-100, W)
            dr.line([(x, y), (x + 200, y)], fill=(150, 230, 90), width=3)
        place(img, A.ninja.render(-lt * 2000, blur=2), (540 + (1 - k) * 800, 1230), 820, angle=lean)
    s = pop(lt, at(words, "track"))
    if s:
        stamp(img, (540, 1030), "TRACK WEAPON", 96, WHITE, (200, 20, 20), angle=-3, scale=s)
    return img


def scene6(A, lt, d, words):
    t_gt = at(words, "GT!")
    t_hr = at(words, "high-revving")
    t_nj = at(words, "Ninja!")
    if lt < t_gt:  # quick alternating highlight
        top_on = int(lt / 0.32) % 2 == 0
    elif lt < t_hr:
        top_on = True
    else:
        top_on = False
    img = split_panels(A, lt)
    gt_w = 900 if top_on else 820
    nj_w = 880 if not top_on else 800
    place(img, A.gt.render(-lt * 500), (540, 700), gt_w)
    place(img, A.ninja.render(-lt * 700), (540, 1250), nj_w, flip=True)
    dim_region(img, BOT_POLY if top_on else TOP_POLY, 0.55)
    text(img, (540, 280), "TORQUE vs HIGH-REV?", fit_size("TORQUE vs HIGH-REV?", 130, 1000), fill=YELLOW, stroke=10)
    text(img, (540, 400), "ROAD PRESENCE • RAW TORQUE", 54, fill=WHITE, stroke=5)
    text(img, (560, 1035), "AGILITY • REVS • FAIRING", 54, fill=WHITE, stroke=5)
    s = pop(lt, t_gt, 0.25)
    if s:
        stamp(img, (800, 560), "GO GT!", 100, WHITE, RED, angle=-8, scale=s)
    s = pop(lt, t_nj, 0.25)
    if s:
        stamp(img, (280, 1080), "GO NINJA!", 100, BLACK, GREEN, angle=6, scale=s)
    return img


def scene7(A, lt, d, words):
    img = A.cta.copy()
    dr = ImageDraw.Draw(img)
    for x, col in ((150, (120, 20, 30)), (930, (40, 110, 20))):
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse((x - 380, 700, x + 380, 1400), fill=col + (120,))
        glow = glow.filter(ImageFilter.GaussianBlur(120))
        img.paste(glow, (0, 0), glow)
    s = pop(lt, 0.0, 0.3)
    text(img, (540, 280), "WHICH TWIN", 140 * s, fill=WHITE, stroke=10)
    text(img, (540, 420), "SOUNDS BETTER?", 140 * s, fill=YELLOW, stroke=10)
    # comment bubble
    s = pop(lt, at(words, "Drop"), 0.3)
    if s:
        bw, bh = 700 * s, 170 * s
        cx, cy = 540, 640
        dr = ImageDraw.Draw(img)
        dr.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), 50 * s, fill=WHITE,
                             outline=BLACK, width=6)
        dr.polygon([(cx - 180 * s, cy + bh / 2 - 4), (cx - 120 * s, cy + bh / 2 - 4), (cx - 210 * s, cy + bh / 2 + 60 * s)],
                   fill=WHITE)
        text(img, (cx, cy), "GT 650 or NINJA 300?", 70 * s, fill=BLACK, stroke=0, shadow=False)
    # both bikes, nose to nose
    e = ease_out(lt / 0.6)
    place(img, A.gt.render(0), (300 - (1 - e) * 500, 980), 560)
    place(img, A.ninja.render(0), (780 + (1 - e) * 500, 980), 560, flip=True)
    # animated follow: avatar with + badge, button, tap, "following"
    t_f = at(words, "follow")
    s = pop(lt, t_f - 0.3, 0.3)
    if s:
        dr = ImageDraw.Draw(img)
        ax, ay, ar = 330, 1250, 70 * s
        dr.ellipse((ax - ar, ay - ar, ax + ar, ay + ar), fill=(30, 30, 40), outline=YELLOW, width=8)
        text(img, (ax, ay), "GT", 50 * s, fill=RED, stroke=0, shadow=False)
        tapped = lt > t_f + 0.55
        bx, by, bw2, bh2 = 640, 1250, 250 * s, 62 * s
        dr.rounded_rectangle((bx - bw2, by - bh2, bx + bw2, by + bh2), int(bh2), fill=(60, 60, 70) if tapped else (0, 149, 246))
        text(img, (bx, by), "FOLLOWING ✓" if tapped else "+ FOLLOW", 70 * s, fill=WHITE, stroke=0, shadow=False,
             path=ANTON if not tapped else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
        tt = lt - (t_f + 0.4)
        if 0 < tt < 0.6:  # tap ripple
            rr = 30 + 120 * ease_out(tt / 0.6)
            a = int(200 * (1 - tt / 0.6))
            rip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(rip).ellipse((bx + 120 - rr, by - rr, bx + 120 + rr, by + rr), outline=(255, 255, 255, a), width=10)
            img.paste(rip, (0, 0), rip)
        if tt > -0.3:
            hx, hy = bx + 120 + 40 * clamp(-tt / 0.3), by + 30 + 40 * clamp(-tt / 0.3)
            dr = ImageDraw.Draw(img)
            dr.ellipse((hx - 26, hy - 26, hx + 26, hy + 26), fill=(255, 255, 255), outline=BLACK, width=5)
    return img


SCENES = [scene1, scene2, scene3, scene4, scene5, scene6, scene7]


def frame(A, scenes, t):
    for i, sc in enumerate(scenes):
        if t < sc["start"] + sc["dur"] or i == len(scenes) - 1:
            break
    lt = t - sc["start"]
    img = SCENES[i](A, lt, sc["dur"], sc["words"])
    draw_captions(img, sc["groups"], lt, sc["dur"])
    arr = np.asarray(img, np.uint16)
    arr = (arr * VIGNETTE >> 8).astype(np.uint8)
    img = Image.fromarray(arr)
    if i > 0 and lt < 0.2:  # punch-in + flash on every cut
        k = 1 - lt / 0.2
        z = 1 + 0.07 * k
        big = img.resize((int(W * z), int(H * z)), Image.BILINEAR)
        img = big.crop(((big.width - W) // 2, (big.height - H) // 2, (big.width - W) // 2 + W, (big.height - H) // 2 + H))
        img = Image.blend(img, Image.new("RGB", (W, H), WHITE), 0.55 * k * k)
    return img


# --- audio -----------------------------------------------------------------------

def lowpass(x, hz, order=2):
    b, a = butter(order, hz / (SR / 2), "low")
    return lfilter(b, a, x)


def bandpass(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], "band")
    return lfilter(b, a, x)


def engine(rpm, fire, width, cutoff, drive, seed):
    """Twin-cylinder engine from an rpm curve: firing pulses per 720 deg cycle."""
    rng = np.random.default_rng(seed)
    cyc = np.cumsum(rpm / 60.0 / 2.0) / SR  # 4-stroke: one cycle per two revs
    cyc = cyc + np.cumsum(rng.normal(0, 2e-6, len(rpm)))  # slight irregularity
    ph = cyc % 1.0
    s = np.zeros_like(rpm)
    for fp in fire:
        dph = (ph - fp + 0.5) % 1.0 - 0.5
        s += np.exp(-(dph / width) ** 2)
    s -= s.mean()
    noise = lowpass(rng.normal(0, 1, len(rpm)), cutoff * 1.5) * (0.3 + s.clip(0))
    x = lowpass(s + 0.35 * noise, cutoff) + 0.4 * lowpass(s, cutoff / 4)
    x = np.tanh(drive * x / (np.abs(x).max() + 1e-9))
    return x / (np.abs(x).max() + 1e-9)


def curve(total, pts, default):
    """Piecewise-linear control curve sampled at SR."""
    n = int(total * SR)
    if not pts:
        return np.full(n, default)
    ts, vs = zip(*sorted(pts))
    return np.interp(np.arange(n) / SR, ts, vs)


def envelope(x, ms=60):
    k = int(SR * ms / 1000)
    return np.convolve(np.abs(x), np.ones(k) / k, mode="same")


def beat(total, bpm=126):
    n = int(total * SR)
    out = np.zeros(n)
    spb = 60 / bpm
    rng = np.random.default_rng(5)
    kt = np.arange(int(0.35 * SR)) / SR
    kick = np.sin(2 * np.pi * (45 * kt + 60 * (1 - np.exp(-kt * 30)) / 30)) * np.exp(-kt * 9)
    ht = np.arange(int(0.05 * SR)) / SR
    hat = bandpass(rng.normal(0, 1, len(ht)), 6000, 14000) * np.exp(-ht * 90)
    ct = np.arange(int(0.2 * SR)) / SR
    clap = bandpass(rng.normal(0, 1, len(ct)), 900, 3000) * np.exp(-ct * 25)
    bass_notes = [55.0, 55.0, 43.65, 49.0]  # A, A, F, G
    bt = np.arange(int(spb / 2 * SR)) / SR
    k = 0
    t = 0.0
    while t < total:
        i = int(t * SR)

        def add(sig, g, at_=i):
            e = min(n, at_ + len(sig))
            out[at_:e] += g * sig[:e - at_]
        add(kick, 1.0)
        if k % 2 == 1:
            add(clap, 0.5)
        add(hat, 0.25, int((t + spb / 2) * SR))
        f = bass_notes[(k // 8) % 4]
        for half in (0, 1):
            j = int((t + half * spb / 2) * SR)
            add(np.tanh(3 * np.sin(2 * np.pi * f * bt)) * np.exp(-bt * 6) * 0.5, 0.6, j)
        k += 1
        t += spb
    return out


def whoosh(rng, n_pre=0.4, n_post=0.2):
    t = np.arange(int((n_pre + n_post) * SR)) / SR
    env = np.where(t < n_pre, (t / n_pre) ** 2, np.exp(-(t - n_pre) * 18))
    return bandpass(rng.normal(0, 1, len(t)), 500, 5000) * env, int(n_pre * SR)


def boom():
    t = np.arange(int(0.5 * SR)) / SR
    return np.sin(2 * np.pi * (35 * t + 60 * (1 - np.exp(-t * 20)) / 20)) * np.exp(-t * 7)


def build_audio(scenes, total, path):
    n = int(total * SR) + SR
    vo = np.zeros(n)
    for sc in scenes:
        i = int((sc["start"] + VO_LEAD) * SR)
        vo[i:i + len(sc["audio"])] += sc["audio"]
    duck = 1 - 0.65 * np.clip(envelope(vo, 120) / 0.06, 0, 1)
    duck = lowpass(duck, 8)

    S = [sc["start"] for sc in scenes]
    wd = [sc["words"] for sc in scenes]
    # GT 650: 270-degree crank, lumpy and deep
    gt_rpm = [(0, 1100), (0.1, 4200), (0.5, 1500), (1.4, 1100), (S[1], 1000), (S[2], 1100)]
    gt_rpm += [(S[2] + x / 20, gt_rpm_s3(x / 20)) for x in range(int(scenes[2]["dur"] * 20))]
    t_gt = S[5] + at(wd[5], "GT!")
    gt_rpm += [(S[3], 1200), (t_gt - 0.05, 1100), (t_gt + 0.25, 5200), (t_gt + 0.9, 1300), (total, 1000)]
    gt_gain = [(0, 0.9), (0.76, 0.9), (0.8, 0.3), (S[1], 0.35), (S[2] - 0.2, 0.4), (S[2] + 0.2, 1.0),
               (S[3], 1.0), (S[3] + 0.3, 0.0), (t_gt - 0.1, 0.0), (t_gt, 0.9), (t_gt + 1.2, 0.2),
               (S[6], 0.25), (total, 0.0)]
    # Ninja 300: high-revving, bright
    nj_rpm = [(0, 4000), (0.8, 4000), (1.0, 10500), (1.5, 5000), (S[1], 3500), (S[3], 7500)]
    nj_rpm += [(S[3] + x / 20, 9000 + 1800 * math.sin(x / 20 * 2.4 * 2)) for x in range(int(scenes[3]["dur"] * 20))]
    nj_rpm += [(S[4] + x / 20, tach_rpm(x / 20, wd[4])) for x in range(int(scenes[4]["dur"] * 20))]
    t_nj = S[5] + at(wd[5], "Ninja!")
    nj_rpm += [(S[5], 4000), (t_nj - 0.05, 4000), (t_nj + 0.35, 11500), (t_nj + 1.0, 5000), (total, 3500)]
    nj_gain = [(0, 0.0), (0.76, 0.0), (0.8, 0.8), (1.6, 0.3), (S[1], 0.0), (S[3] - 0.1, 0.0), (S[3] + 0.1, 0.8),
               (S[5], 0.8), (S[5] + 0.3, 0.0), (t_nj - 0.1, 0.0), (t_nj, 0.9), (t_nj + 1.2, 0.2),
               (S[6], 0.25), (total, 0.0)]
    m = int(total * SR)
    gt = engine(curve(total, gt_rpm, 1000), [0.0, 0.375], 0.045, 520, 2.4, 1) * curve(total, gt_gain, 0)
    nj = engine(curve(total, nj_rpm, 4000), [0.0, 0.25], 0.03, 2600, 1.8, 2) * curve(total, nj_gain, 0)
    eng = np.zeros(n)
    eng[:m] = 0.55 * gt + 0.38 * nj

    music = np.zeros(n)
    b = beat(total)
    music[:len(b)] = b
    fx = np.zeros(n)
    rng = np.random.default_rng(11)
    for s0 in S[1:]:
        w, pre = whoosh(rng)
        i = int(s0 * SR) - pre
        fx[i:i + len(w)] += 0.25 * w
    for sc, toks in zip(scenes, (["₹", "but"], ["650CC", "52 NM"], ["rumble"], ["300CC"], ["35 KG", "track"],
                                  ["GT!", "Ninja!"], ["follow"])):
        for tok in toks:
            i = int((sc["start"] + at(sc["words"], tok)) * SR)
            bm = boom()
            fx[i:i + len(bm)] += 0.5 * bm

    mix = 1.0 * vo + (0.30 * eng + 0.20 * music + fx) * duck
    mix = np.tanh(1.2 * mix) / np.tanh(1.2)
    mix = mix / (np.abs(mix).max() + 1e-9) * 0.93
    fade = int(0.4 * SR)
    mix[m - fade:m] *= np.linspace(1, 0, fade)
    mix = mix[:m]
    pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
    stereo = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(path, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(stereo.tobytes())


def write_srt(scenes, path):
    def ts(t):
        ms = int(round(t * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    rows = []
    for sc in scenes:
        for i, g in enumerate(sc["groups"]):
            t0 = sc["start"] + g[0]["start"]
            t1 = sc["start"] + (sc["groups"][i + 1][0]["start"] if i + 1 < len(sc["groups"]) else g[-1]["end"] + 0.2)
            rows.append((t0, t1, " ".join(w["text"] for w in g)))
    with open(path, "w") as f:
        for k, (a, b, s) in enumerate(rows, 1):
            f.write(f"{k}\n{ts(a)} --> {ts(b)}\n{s}\n\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", nargs="*", type=float, help="only write preview frames at these times")
    ap.add_argument("--out", default=os.path.join(OUT_DIR, "gt650-vs-ninja300.mp4"))
    a = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    scenes, total = load_vo()
    for sc in scenes:
        sc["groups"] = phrases(sc["words"])
    print("scenes:", " ".join(f"{sc['start']:.2f}+{sc['dur']:.2f}" for sc in scenes), f"total {total:.2f}s")
    A = Assets()
    if a.stills is not None:
        for t in a.stills:
            p = os.path.join(HERE, "build", f"still_{t:05.2f}.png")
            frame(A, scenes, t).save(p)
            print(p)
        return

    wav = os.path.join(HERE, "build", "mix.wav")
    build_audio(scenes, total, wav)
    write_srt(scenes, os.path.splitext(a.out)[0] + ".srt")
    n = int(round(total * FPS))
    cmd = [FFMPEG, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", a.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for k in range(n):
        t = k / FPS
        img = frame(A, scenes, t)
        if k == int(1.9 * FPS):
            img.save(os.path.join(OUT_DIR, "cover.png"))
        proc.stdin.write(img.tobytes())
        if k % 150 == 0:
            print(f"frame {k}/{n}", flush=True)
    proc.stdin.close()
    proc.wait()
    print("wrote", a.out)


if __name__ == "__main__":
    main()
