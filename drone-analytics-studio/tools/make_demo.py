#!/usr/bin/env python3
"""Create a demo construction site (synthetic drone clips + photos) and a ready-made demo project.

    python tools/make_demo.py              # writes into ./workspace
    python tools/make_demo.py --data D:\\DroneStudio

Real footage is not needed to try the studio; this paints a small site with towers at different
construction stages, renders two "drone" fly-over clips from it and pre-fills a project.
"""
import argparse
import math
import os
import random
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

from engine import media  # noqa: E402
from engine.store import Store  # noqa: E402

SW, SH = 4800, 2700
SKEW, DEPTH, ZS = 0.22, 0.92, 0.95


def P(x, y, z=0.0):
    return (x + y * SKEW, 260 + y * DEPTH - z * ZS)


def hull(points):
    pts = sorted(set((round(x, 1), round(y, 1)) for x, y in points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


class Site:
    def __init__(self, progress):
        self.progress = progress  # dict of per-building parameters (lets us paint "last month" too)
        self.outlines = {}

    def box(self, d, name, x0, y0, x1, y1, h, color, windows=None, floors=0, open_top=0):
        corners = [P(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (0, h)]
        self.outlines.setdefault(name, []).extend(corners)
        top = [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)]
        front = [P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)]
        side = [P(x0, y0, 0), P(x0, y1, 0), P(x0, y1, h), P(x0, y0, h)]
        d.polygon(side, fill=shade(color, 0.72))
        d.polygon(front, fill=shade(color, 0.9))
        d.polygon(top, fill=shade(color, 1.08))
        if floors:
            fh = h / floors
            for i in range(1, floors):
                z = i * fh
                d.line([P(x0, y1, z), P(x1, y1, z)], fill=shade(color, 0.7), width=3)
                d.line([P(x0, y0, z), P(x0, y1, z)], fill=shade(color, 0.55), width=3)
            if windows:
                for i in range(floors):
                    z0 = i * fh + fh * 0.3
                    z1 = z0 + fh * 0.45
                    n = int((x1 - x0) / 46)
                    for k in range(n):
                        wx = x0 + 18 + k * (x1 - x0 - 30) / n
                        d.polygon([P(wx, y1, z0), P(wx + 22, y1, z0), P(wx + 22, y1, z1), P(wx, y1, z1)], fill=windows)
        if open_top:  # exposed columns on the working floor
            for k in range(7):
                cx = x0 + 10 + k * (x1 - x0 - 20) / 6
                for cy in (y0 + 8, y1 - 8):
                    d.line([P(cx, cy, h), P(cx, cy, h + open_top)], fill=(120, 120, 118), width=7)
            d.line([P(x0, y1, h + open_top * 0.15), P(x1, y1, h + open_top * 0.15)], fill=(180, 140, 70), width=4)

    def crane(self, d, x, y, h, jib):
        base = P(x, y, 0)
        topp = P(x, y, h)
        d.line([base, topp], fill=(235, 180, 30), width=12)
        for z in range(0, int(h), 40):
            d.line([P(x - 8, y, z), P(x + 8, y, z + 40)], fill=(200, 150, 20), width=3)
        d.line([P(x - jib * 0.3, y, h), P(x + jib, y, h)], fill=(235, 180, 30), width=10)
        d.rectangle([P(x - jib * 0.3, y, h)[0] - 10, P(x, y, h)[1] - 4, P(x - jib * 0.3, y, h)[0] + 50,
                     P(x, y, h)[1] + 26], fill=(90, 90, 90))
        hook = P(x + jib * 0.7, y, h)
        d.line([hook, (hook[0], hook[1] + 260)], fill=(60, 60, 60), width=3)
        d.line([P(x, y, h + 60), P(x + jib, y, h)], fill=(160, 120, 20), width=3)

    def paint(self):
        rnd = random.Random(7)
        img = Image.new('RGB', (SW, SH), (148, 128, 98))
        noise = Image.effect_noise((SW // 8, SH // 8), 40).resize((SW, SH), Image.BICUBIC)
        img = Image.composite(img, Image.new('RGB', (SW, SH), (118, 104, 82)), noise)
        d = ImageDraw.Draw(img)
        # roads and plot boundary
        d.polygon([P(-400, 1890), P(5600, 1890), P(5600, 2160), P(-400, 2160)], fill=(78, 80, 84))
        for x in range(-300, 5600, 260):
            d.line([P(x, 2025), P(x + 120, 2025)], fill=(230, 230, 220), width=8)
        d.polygon([P(1950, -200), P(2150, -200), P(2150, 1890), P(1950, 1890)], fill=(96, 96, 98))
        d.line([P(120, 60), P(4300, 60), P(4300, 1840), P(120, 1840), P(120, 60)], fill=(225, 220, 205), width=10)
        # greenery
        for _ in range(140):
            x, y = rnd.uniform(-200, 5000), rnd.choice([rnd.uniform(1850, 1880), rnd.uniform(2180, 3900)])
            r = rnd.uniform(26, 58)
            cx, cy = P(x, y)
            d.ellipse([cx - r, cy - r * 0.8, cx + r, cy + r * 0.8], fill=(54 + rnd.randint(0, 30), 96 + rnd.randint(0, 30), 52))
        pr = self.progress
        # Tower D: excavation pit
        d.polygon([P(2350, 250), P(3150, 250), P(3150, 760), P(2350, 760)], fill=(110, 82, 58))
        d.polygon([P(2420, 310), P(3080, 310), P(3080, 700), P(2420, 700)], fill=(92, 66, 46))
        self.outlines['tower_d'] = [P(2350, 250), P(3150, 250), P(3150, 760), P(2350, 760)]
        ex = P(2700 + pr['exc'] * 300, 520)
        d.rectangle([ex[0] - 50, ex[1] - 40, ex[0] + 50, ex[1] + 10], fill=(240, 190, 40))
        d.line([ex, (ex[0] + 120, ex[1] - 90), (ex[0] + 190, ex[1] - 20)], fill=(220, 170, 30), width=12)
        # Tower B: foundation raft with water logging
        d.polygon([P(400, 300), P(1200, 300), P(1200, 860), P(400, 860)], fill=(104, 98, 92))
        for gx in range(420, 1200, 34):
            d.line([P(gx, 310), P(gx, 850)], fill=(140, 120, 100), width=2)
        for gy in range(310, 860, 34):
            d.line([P(410, gy), P(1190, gy)], fill=(140, 120, 100), width=2)
        if pr['water']:
            wx, wy = P(820, 640)
            d.ellipse([wx - 260, wy - 90, wx + 230, wy + 80], fill=(88, 118, 132))
            d.ellipse([wx - 160, wy - 50, wx + 120, wy + 40], fill=(110, 142, 156))
        self.outlines['tower_b'] = [P(400, 300), P(1200, 300), P(1200, 860), P(400, 860)]
        # Tower A: superstructure in progress (back-left)
        fa = pr['a_floors']
        self.box(d, 'tower_a', 450, 1050, 1150, 1500, fa * 58, (176, 172, 166), floors=fa, open_top=58)
        self.crane(d, 1300, 1260, fa * 58 + 380, 900)
        # Tower C: finishing (right)
        fc = 22
        self.box(d, 'tower_c', 3300, 950, 4050, 1450, fc * 58, (214, 206, 192), windows=(150, 190, 214), floors=fc)
        if pr['c_scaffold']:
            x0, x1, y1 = 3300, 4050, 1450
            for k in range(14):
                xx = x0 + k * (x1 - x0) / 13
                d.line([P(xx, y1 + 12, fc * 58 * 0.55), P(xx, y1 + 12, fc * 58)], fill=(150, 150, 150), width=3)
        # Clubhouse: completed, with pool
        self.box(d, 'clubhouse', 2300, 1180, 3000, 1560, 150, (232, 228, 220), windows=(140, 186, 210), floors=2)
        d.polygon([P(2320, 1180, 150), P(2980, 1180, 150), P(2980, 1560, 150), P(2320, 1560, 150)], fill=(176, 88, 64))
        d.polygon([P(2420, 1620), P(2900, 1620), P(2900, 1800), P(2420, 1800)], fill=(240, 240, 236))
        d.polygon([P(2450, 1640), P(2870, 1640), P(2870, 1780), P(2450, 1780)], fill=(70, 180, 210))
        self.outlines['clubhouse'] += [P(2420, 1800)]
        # site office containers & material yard
        for i, c in enumerate([(250, 250, 250), (60, 110, 190), (250, 250, 250)]):
            self.box(d, 'office', 3500 + i * 230, 300, 3700 + i * 230, 420, 70, c)
        for i in range(9):
            x = 3450 + (i % 3) * 170
            y = 560 + (i // 3) * 90
            d.polygon([P(x, y), P(x + 140, y), P(x + 140, y + 60), P(x, y + 60)], fill=(120 + i * 6, 70, 50))
        img = img.filter(ImageFilter.GaussianBlur(0.6))
        return img

    def outline(self, name):
        return hull(self.outlines[name])


def crop_norm(points, box, size_w=None, size_h=None):
    x0, y0, x1, y1 = box
    return [[round((x - x0) / (x1 - x0), 4), round((y - y0) / (y1 - y0), 4)] for x, y in points]


def render_clip(img, path, seconds, path_fn, size=(1920, 1080), fps=30):
    ff = media.ffmpeg_path()
    w, h = size
    cmd = [ff, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}',
           '-r', str(fps), '-i', 'pipe:0', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
           '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-colorspace', 'bt709', '-color_primaries', 'bt709',
           '-color_trc', 'bt709', '-movflags', '+faststart', path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(seconds * fps)
    for i in range(n):
        box = path_fn(i / fps)
        frame = img.transform((w, h), Image.EXTENT, box, Image.BILINEAR)
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    proc.wait()


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def create_demo(data_dir, with_project=True, log=print):
    out_dir = os.path.join(data_dir, 'demo-media')
    os.makedirs(out_dir, exist_ok=True)
    log('Painting demo site ...')
    now = Site({'a_floors': 14, 'water': True, 'c_scaffold': True, 'exc': 0.6})
    site = now.paint()
    prev_site = Site({'a_floors': 10, 'water': False, 'c_scaffold': True, 'exc': 0.0}).paint()

    # Clip 1: lateral fly-by, left -> right with a gentle push in
    def fly(t, dur=18.0):
        k = ease(t / dur)
        cw = 2700 - 300 * k
        ch = cw * 9 / 16
        cx = 1500 + 1900 * k
        cy = 1250 - 120 * k
        return (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)

    # Clip 2: reveal from a wide establishing view
    def reveal(t, dur=14.0):
        k = ease(t / dur)
        cw = 4600 - 1400 * k
        ch = cw * 9 / 16
        cx = 2400 - 300 * k
        cy = 1350 - 200 * k
        return (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)

    c1 = os.path.join(out_dir, 'DJI_0001.MP4')
    c2 = os.path.join(out_dir, 'DJI_0002.MP4')
    if not os.path.exists(c1):
        log('Rendering DJI_0001.MP4 (fly-by) ...')
        render_clip(site, c1 + '.tmp.mp4', 18, fly)
        os.replace(c1 + '.tmp.mp4', c1)
    if not os.path.exists(c2):
        log('Rendering DJI_0002.MP4 (2.5K establishing shot) ...')
        render_clip(site, c2 + '.tmp.mp4', 14, reveal, size=(2560, 1440))
        os.replace(c2 + '.tmp.mp4', c2)

    photo_box = (300, 250, 300 + 4000, 250 + 3000 * 0.75 * 4000 / 4000)
    photo_box = (250, 330, 4250, 330 + 2250)  # 16:9 crop for photo, 4000x2250
    pbox43 = (500, 0, 4100, 2700)  # 4:3 photo
    site.crop(pbox43).resize((4000, 3000), Image.LANCZOS).save(os.path.join(out_dir, 'DJI_0101.JPG'), quality=90)
    prev_site.crop(pbox43).resize((4000, 3000), Image.LANCZOS).save(os.path.join(out_dir, 'DJI_0101_PREV_SEP.JPG'),
                                                                    quality=90)
    site.crop(photo_box).resize((1600, 900), Image.LANCZOS).save(os.path.join(out_dir, 'cover.jpg'), quality=88)
    logo = Image.new('RGBA', (360, 120), (0, 0, 0, 0))
    ld = ImageDraw.Draw(logo)
    ld.polygon([(10, 100), (60, 20), (110, 100)], fill=(31, 78, 158, 255))
    ld.polygon([(50, 100), (85, 45), (120, 100)], fill=(229, 32, 46, 235))
    try:
        from PIL import ImageFont
        font = ImageFont.truetype('DejaVuSans-Bold.ttf', 44)
    except OSError:
        font = None
    ld.text((135, 30), 'BUILDCO', fill=(31, 78, 158, 255), font=font)
    logo.save(os.path.join(out_dir, 'logo.png'))
    log('Media written to ' + out_dir)
    if not with_project:
        return None

    # ---------------------------------------------------------------- demo project
    t1 = 4.5
    box1 = fly(t1)
    t2 = 11.0
    box2 = reveal(t2)

    def zone(name, bx, building, **kw):
        return dict({'id': 'z' + name + str(len(bx)), 'type': 'zone', 'pts': crop_norm(now.outline(name), bx),
                     'building': building, 'label': '', 'color': None, 'spotlight': False, 'card': True,
                     'labelPos': None}, **kw)

    def pt(x, y, bx):
        return crop_norm([P(x, y)], bx)[0]

    stages = [
        {'id': 'ns', 'name': 'Not Started', 'color': '#94A3B8'},
        {'id': 'exc', 'name': 'Excavation', 'color': '#EAB308'},
        {'id': 'fdn', 'name': 'Foundation', 'color': '#F97316'},
        {'id': 'str', 'name': 'Superstructure', 'color': '#3B82F6'},
        {'id': 'fin', 'name': 'Finishing', 'color': '#A855F7'},
        {'id': 'done', 'name': 'Completed', 'color': '#22C55E'},
        {'id': 'hold', 'name': 'On Hold', 'color': '#78716C'},
    ]
    buildings = [
        {'id': 'ta', 'name': 'Tower A', 'stage': 'str', 'progress': 62, 'floors': '14 / 22 floors', 'critical': False,
         'remarks': '15th floor slab shuttering in progress'},
        {'id': 'tb', 'name': 'Tower B', 'stage': 'fdn', 'progress': 18, 'floors': 'Raft', 'critical': True,
         'remarks': 'Water logging in raft area, dewatering required'},
        {'id': 'tc', 'name': 'Tower C', 'stage': 'fin', 'progress': 88, 'floors': '22 / 22 floors', 'critical': False,
         'remarks': 'External painting & facade glazing'},
        {'id': 'cl', 'name': 'Clubhouse', 'stage': 'done', 'progress': 100, 'floors': 'G+1', 'critical': False,
         'remarks': 'Handed over for interiors'},
        {'id': 'td', 'name': 'Tower D', 'stage': 'exc', 'progress': 8, 'floors': 'Excavation', 'critical': False,
         'remarks': 'Excavation at 60%'},
    ]
    concerns = [
        {'id': 'c1', 'title': 'Water logging in Tower B raft', 'detail': 'Stagnant water over ~35% of raft area; risk to rebar and concrete quality.',
         'severity': 'high', 'building': 'tb', 'action': 'Deploy dewatering pumps, clean & inspect rebar', 'owner': 'Site Engineer', 'due': '2026-10-18'},
        {'id': 'c2', 'title': 'Crane swing over public road', 'detail': 'Tower crane jib passes over the access road during lifts.',
         'severity': 'medium', 'building': 'ta', 'action': 'Barricade road during lifting hours', 'owner': 'Safety Officer', 'due': '2026-10-15'},
        {'id': 'c3', 'title': 'Material stacking near boundary', 'detail': 'Steel and blocks stacked against boundary wall.',
         'severity': 'low', 'building': None, 'action': 'Shift to designated yard', 'owner': 'Stores', 'due': '2026-10-20'},
    ]
    milestones = [
        {'id': 'm1', 'title': 'Clubhouse handover', 'date': '2026-09-30', 'status': 'done', 'building': 'cl', 'note': ''},
        {'id': 'm2', 'title': 'Tower A — 15th slab', 'date': '2026-10-20', 'status': 'ontrack', 'building': 'ta', 'note': ''},
        {'id': 'm3', 'title': 'Tower B — raft casting', 'date': '2026-10-25', 'status': 'risk', 'building': 'tb', 'note': 'Depends on dewatering'},
        {'id': 'm4', 'title': 'Tower C — facade complete', 'date': '2026-11-15', 'status': 'ontrack', 'building': 'tc', 'note': ''},
        {'id': 'm5', 'title': 'Tower D — excavation done', 'date': '2026-11-05', 'status': 'delayed', 'building': 'td', 'note': 'Rock strata encountered'},
    ]
    za = zone('tower_a', box1, 'ta')
    zb = zone('tower_b', box1, 'tb', spotlight=False)
    zc = zone('clubhouse', box1, 'cl')
    pin1 = {'id': 'p1', 'type': 'pin', 'at': pt(820, 640, box1), 'concern': 'c1', 'text': '', 'severity': 'high', 'labelPos': None}
    zc2 = zone('tower_c', box2, 'tc')
    zd2 = zone('tower_d', box2, 'td')
    arrow = {'id': 'ar1', 'type': 'arrow', 'a': pt(3900, 380, box2), 'b': pt(3250, 520, box2), 'text': 'Excavator working',
             'color': None}
    pbox = pbox43
    photo_anns = [zone('tower_a', pbox, 'ta'), zone('tower_c', pbox, 'tc'),
                  {'id': 'p2', 'type': 'pin', 'at': pt(1700, 1350, pbox), 'concern': 'c2', 'text': '', 'severity': 'medium', 'labelPos': None}]
    project = {
        'version': 1,
        'mediaDir': out_dir,
        'exportDir': '',
        'info': {'name': 'Skyline Residency', 'site': 'Plot 21, Sector 5, Pune', 'client': 'Skyline Developers',
                 'surveyDate': '2026-10-12', 'surveyLabel': 'Survey 14', 'preparedBy': 'Drone Analytics Team',
                 'company': 'BuildCo Infra', 'accent': '#1F4E9E', 'labelColor': '#0B78D6', 'zoneColor': '#1F5BC4',
                 'markerColor': '#E5202E', 'highlightsLabel': 'KEY HIGHLIGHTS', 'overline': 'DRONE PROGRESS REPORT',
                 'logo': 'logo.png', 'cover': {'path': 'cover.jpg', 't': 0}, 'music': None, 'musicVolume': 0.6,
                 'nextSurvey': '12 Nov 2026'},
        'stages': stages, 'buildings': buildings, 'concerns': concerns, 'milestones': milestones,
        'scenes': [
            {'id': 's1', 'type': 'title', 'dur': 6},
            {'id': 's2', 'type': 'clip', 'path': 'DJI_0001.MP4', 'in': 0.0, 'out': 18.0, 'caption': 'Tower A & B Block',
             'sub': 'Towers A & B, Clubhouse', 'freezes': [
                 {'id': 'f1', 't': t1, 'hold': 8, 'zoom': 1.07, 'title': 'Tower A & B Block',
                  'highlights': [{'title': 'Tower A superstructure', 'detail': '14 of 22 floors cast, 15th slab shuttering in progress'},
                                {'title': 'Water logging at Tower B raft', 'detail': 'Dewatering needed before raft casting'}],
                  'panel': True, 'anns': [za, zb, zc, pin1]}]},
            {'id': 's3', 'type': 'clip', 'path': 'DJI_0002.MP4', 'in': 0.0, 'out': 14.0, 'caption': 'Site Overview',
             'sub': 'Full site from south', 'freezes': [
                 {'id': 'f2', 't': t2, 'hold': 7, 'zoom': 1.05, 'title': 'Tower C & D',
                  'highlights': [{'title': 'Tower C facade glazing ~70%', 'detail': 'External painting started on upper floors'},
                                 {'title': 'Tower D excavation ~60%', 'detail': 'Rock strata slowing progress'}], 'panel': True,
                  'anns': [zc2, zd2, arrow]}]},
            {'id': 's4', 'type': 'compare', 'a': {'path': 'DJI_0101_PREV_SEP.JPG', 't': 0, 'label': 'Sep 2026'},
             'b': {'path': 'DJI_0101.JPG', 't': 0, 'label': 'Oct 2026'}, 'dur': 8, 'caption': 'Month-on-month progress',
             'sub': 'Tower A: +4 floors'},
            {'id': 's5', 'type': 'photo', 'path': 'DJI_0101.JPG', 'dur': 9, 'caption': 'Oblique photo — North', 'sub': '',
             'zoom': 1.05, 'title': 'Tower A crane operations', 'highlights': [], 'panel': True, 'anns': photo_anns},
            {'id': 's6', 'type': 'summary', 'dur': 10},
            {'id': 's7', 'type': 'concerns', 'dur': 10},
            {'id': 's8', 'type': 'milestones', 'dur': 9},
            {'id': 's9', 'type': 'end', 'dur': 5},
        ],
        'settings': {'width': 1920, 'height': 1080, 'fps': 30, 'quality': 'high', 'encoder': 'auto',
                     'transitions': True, 'autoProxy': True, 'chrome': True, 'theme': 'corporate', 'zoneColors': 'brand'},
    }
    p = Store(data_dir).create(project)
    log('Demo project created: ' + p['id'])
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default=os.path.join(ROOT, 'workspace'))
    ap.add_argument('--no-project', action='store_true')
    args = ap.parse_args()
    create_demo(args.data, not args.no_project)


if __name__ == '__main__':
    main()
