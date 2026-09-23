"""Side-profile illustrations of the two bikes, drawn with PIL.

Both bikes face right on a 1400x800 canvas with the rear axle at REAR and the
front axle at FRONT. The body is drawn without wheels so the wheels can spin:
``Bike.render(angle)`` composites rotated wheels beneath the body.
"""

import math

from PIL import Image, ImageDraw, ImageFilter

CW, CH = 1400, 800
REAR, FRONT = (330, 560), (1070, 560)
R_TIRE, R_RIM = 175, 148

BLACK = (18, 18, 20, 255)
TIRE = (28, 28, 30, 255)
CHROME = (206, 210, 216, 255)
CHROME_HI = (250, 250, 252, 255)
CHROME_LO = (120, 126, 134, 255)
STEEL = (92, 96, 104, 255)
GT_RED = (176, 20, 28, 255)
GT_RED_HI = (232, 72, 64, 255)
LIME = (104, 190, 34, 255)
LIME_HI = (168, 232, 80, 255)
LIME_LO = (54, 120, 14, 255)
LAMP = (255, 246, 206, 255)


def _circle(d, c, r, **kw):
    d.ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), **kw)


def _thick(d, pts, w, fill):
    d.line(pts, fill=fill, width=w, joint="curve")
    for p in (pts[0], pts[-1]):
        _circle(d, p, w // 2, fill=fill)


# --- wheels -----------------------------------------------------------------

def _wire_wheel(disc):
    s = 2 * R_TIRE + 8
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = (s // 2, s // 2)
    _circle(d, c, R_TIRE, fill=TIRE)
    _circle(d, c, R_TIRE - 8, outline=(48, 48, 52, 255), width=3)  # tread line
    _circle(d, c, R_RIM, fill=CHROME)
    _circle(d, c, R_RIM - 12, fill=(0, 0, 0, 0))
    _circle(d, c, R_RIM - 3, outline=CHROME_HI, width=3)
    if disc:
        _circle(d, c, 88, fill=(150, 154, 160, 255))
        _circle(d, c, 60, fill=(0, 0, 0, 0))
        for k in range(12):
            a = k * math.pi / 6
            _circle(d, (c[0] + 74 * math.cos(a), c[1] + 74 * math.sin(a)), 5, fill=(60, 60, 64, 255))
    # 36 tangential spokes, laced both ways
    for k in range(36):
        a = k * 2 * math.pi / 36
        hub_a = a + (0.35 if k % 2 else -0.35)
        p0 = (c[0] + 26 * math.cos(hub_a), c[1] + 26 * math.sin(hub_a))
        p1 = (c[0] + (R_RIM - 12) * math.cos(a), c[1] + (R_RIM - 12) * math.sin(a))
        d.line([p0, p1], fill=(214, 218, 224, 255), width=3)
    _circle(d, c, 34, fill=CHROME)
    _circle(d, c, 14, fill=CHROME_LO)
    return im


def _alloy_wheel(disc_r):
    s = 2 * R_TIRE + 8
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = (s // 2, s // 2)
    _circle(d, c, R_TIRE, fill=TIRE)
    _circle(d, c, R_TIRE - 8, outline=(48, 48, 52, 255), width=3)
    _circle(d, c, R_RIM, fill=(24, 24, 26, 255))
    _circle(d, c, R_RIM - 2, outline=LIME, width=5)  # rim pinstripe
    _circle(d, c, R_RIM - 16, fill=(0, 0, 0, 0))
    if disc_r:
        _circle(d, c, disc_r, fill=(170, 174, 180, 255))
        _circle(d, c, disc_r - 22, fill=(0, 0, 0, 0))
        for k in range(10):  # petal disc
            a = k * math.pi / 5
            _circle(d, (c[0] + disc_r * math.cos(a), c[1] + disc_r * math.sin(a)), 9, fill=(0, 0, 0, 0))
    for k in range(5):  # five split spokes
        for off in (-0.09, 0.09):
            a = k * 2 * math.pi / 5 + off
            p1 = (c[0] + (R_RIM - 14) * math.cos(a + off), c[1] + (R_RIM - 14) * math.sin(a + off))
            d.line([c, p1], fill=(30, 30, 32, 255), width=13)
    _circle(d, c, 36, fill=(30, 30, 32, 255))
    _circle(d, c, 14, fill=CHROME)
    return im


# --- bodies -----------------------------------------------------------------

def _gt_body():
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # rear fender + swingarm + twin shocks
    d.arc((REAR[0] - 190, REAR[1] - 190, REAR[0] + 190, REAR[1] + 190), 195, 290, fill=BLACK, width=20)
    _thick(d, [(600, 500), REAR], 24, BLACK)
    _thick(d, [(362, 548), (455, 322)], 18, CHROME)
    for k in range(9):
        y = 360 + k * 18
        x = 440 - (y - 322) * 93 / 226
        d.line([(x - 13, y - 4), (x + 13, y + 4)], fill=CHROME_LO, width=5)
    # frame
    _thick(d, [(905, 232), (560, 300)], 16, BLACK)
    _thick(d, [(930, 330), (820, 590), (585, 600), (560, 470)], 16, BLACK)
    _thick(d, [(560, 300), (310, 300)], 14, BLACK)
    # engine: crankcase, slanted twin cylinders with fins, covers
    d.polygon([(590, 450), (820, 440), (832, 570), (760, 612), (600, 604), (574, 540)], fill=STEEL)
    d.polygon([(655, 330), (802, 330), (818, 452), (640, 456)], fill=(150, 154, 160, 255))
    for k in range(9):
        y = 342 + k * 12
        d.line([(650 - (y - 330) * 0.12, y), (805 + (y - 330) * 0.12, y)], fill=(70, 72, 78, 255), width=4)
    d.polygon([(648, 312), (808, 312), (812, 336), (644, 338)], fill=BLACK)
    _circle(d, (640, 538), 46, fill=CHROME)
    _circle(d, (640, 538), 30, outline=CHROME_HI, width=4)
    d.ellipse((740, 505, 830, 570), fill=CHROME)
    d.polygon([(600, 604), (760, 612), (740, 630), (620, 628)], fill=BLACK)
    # side panel with badge
    d.rounded_rectangle((462, 318, 585, 440), 20, fill=BLACK)
    d.rounded_rectangle((492, 360, 556, 392), 10, fill=CHROME)
    # twin peashooter exhausts: far side (darker, higher) then near side
    for off, col, hi in ((-34, CHROME_LO, CHROME), (0, CHROME, CHROME_HI)):
        _thick(d, [(800, 420 + off), (835, 520 + off), (760, 600 + off), (560, 606 + off)], 26, col)
        d.polygon([(560, 588 + off), (560, 624 + off), (215, 566 + off), (210, 530 + off)], fill=col)
        d.line([(560, 594 + off), (220, 538 + off)], fill=hi, width=5)
        d.ellipse((194, 526 + off, 230, 570 + off), fill=BLACK)
    # tank with highlight and knee pad
    tank = [(565, 300), (600, 250), (680, 226), (800, 222), (882, 238), (918, 270), (902, 318),
            (820, 340), (640, 346), (575, 332)]
    d.polygon(tank, fill=GT_RED)
    d.polygon([(610, 258), (690, 236), (800, 232), (870, 246), (800, 252), (690, 256)], fill=GT_RED_HI)
    d.rounded_rectangle((650, 282, 712, 330), 12, fill=BLACK)
    d.ellipse((760, 270, 830, 305), fill=CHROME)
    # cafe seat with hump cowl + tail light
    d.polygon([(378, 298), (578, 296), (578, 326), (380, 332)], fill=BLACK)
    d.polygon([(298, 302), (325, 262), (398, 256), (412, 302)], fill=GT_RED)
    d.rectangle((282, 284, 300, 304), fill=(255, 40, 40, 255))
    # front fork, fender
    _thick(d, [(915, 248), (1062, 556)], 22, CHROME)
    _thick(d, [(1000, 424), (1068, 562)], 30, (176, 180, 186, 255))
    d.arc((FRONT[0] - 192, FRONT[1] - 192, FRONT[0] + 192, FRONT[1] + 192), 205, 322, fill=CHROME, width=16)
    # clip-ons, bar-end mirror, twin pods, round headlamp
    _thick(d, [(905, 238), (846, 266)], 12, BLACK)
    _circle(d, (838, 268), 14, fill=CHROME)
    for c in ((900, 192), (944, 186)):
        _circle(d, c, 22, fill=CHROME)
        _circle(d, c, 16, fill=(240, 236, 220, 255))
    _circle(d, (982, 246), 60, fill=CHROME)
    _circle(d, (982, 246), 48, fill=CHROME_LO)
    d.ellipse((1008, 190, 1052, 302), fill=LAMP)
    return im


def _ninja_body():
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # swingarm, lower engine, header
    d.polygon([(610, 470), (620, 520), (340, 578), (322, 542)], fill=(150, 154, 160, 255))
    d.polygon([(600, 460), (820, 450), (850, 590), (760, 620), (620, 610)], fill=(40, 40, 44, 255))
    _thick(d, [(820, 520), (790, 612), (600, 616)], 20, (120, 110, 100, 255))
    # side muffler, angled up
    d.polygon([(620, 596), (600, 628), (420, 572), (392, 530), (420, 512)], fill=(190, 194, 200, 255))
    d.polygon([(420, 512), (392, 530), (420, 572), (440, 560), (428, 520)], fill=BLACK)
    d.line([(600, 606), (430, 528)], fill=CHROME_HI, width=5)
    # frame glimpse, dark infill behind the fairing, upper fork
    d.polygon([(560, 300), (700, 330), (640, 420), (620, 470), (560, 384)], fill=(40, 40, 44, 255))
    _thick(d, [(560, 380), (620, 470)], 14, BLACK)
    _thick(d, [(905, 242), (1062, 556)], 26, BLACK)
    # tail: sharp upswept, black under-tray, tail light
    d.polygon([(236, 244), (330, 250), (470, 276), (566, 300), (606, 336), (560, 384), (420, 352),
               (300, 292)], fill=LIME)
    d.polygon([(300, 292), (420, 352), (560, 384), (540, 400), (410, 372), (300, 310)], fill=BLACK)
    d.polygon([(236, 244), (262, 246), (270, 262), (244, 258)], fill=(255, 40, 40, 255))
    d.line([(330, 262), (520, 300)], fill=LIME_HI, width=4)
    # step seat
    d.polygon([(330, 262), (470, 272), (470, 300), (360, 292)], fill=BLACK)
    d.polygon([(470, 280), (650, 300), (640, 318), (470, 306)], fill=BLACK)
    # tank
    d.polygon([(620, 300), (660, 250), (790, 224), (882, 238), (902, 268), (836, 306), (700, 322)], fill=LIME)
    d.polygon([(668, 256), (790, 232), (860, 244), (780, 250)], fill=LIME_HI)
    d.polygon([(680, 282), (760, 270), (740, 316), (690, 318)], fill=BLACK)
    # main side fairing
    fair = [(1152, 318), (1106, 246), (1016, 204), (926, 212), (876, 262), (836, 306), (700, 330),
            (640, 420), (700, 468), (790, 498), (862, 556), (902, 478), (1000, 420), (1082, 380),
            (1152, 340)]
    d.polygon(fair, fill=LIME)
    d.polygon([(640, 420), (700, 468), (790, 498), (862, 556), (826, 604), (700, 610), (628, 560)], fill=BLACK)
    d.polygon([(700, 330), (836, 306), (960, 300), (870, 360), (760, 420), (680, 400)], fill=LIME_LO)
    d.polygon([(760, 420), (870, 360), (1000, 330), (930, 400), (840, 440)], fill=BLACK)
    d.polygon([(1016, 204), (1106, 246), (1152, 318), (1100, 300), (1040, 250)], fill=LIME_HI)
    # angular headlights, smoked screen
    d.polygon([(1150, 318), (1112, 262), (1076, 262), (1104, 318)], fill=LAMP)
    d.polygon([(1100, 334), (1060, 300), (1036, 304), (1070, 336)], fill=LAMP)
    d.polygon([(930, 214), (1030, 208), (962, 146), (904, 142)], fill=(34, 40, 48, 235))
    d.line([(906, 146), (962, 150)], fill=(120, 130, 140, 255), width=3)
    # lower fork leg + fender (upper fork sits behind the fairing)
    _thick(d, [(1000, 430), (1068, 562)], 30, (176, 180, 186, 255))
    d.arc((FRONT[0] - 192, FRONT[1] - 192, FRONT[0] + 192, FRONT[1] + 192), 215, 300, fill=LIME, width=20)
    return im


class Bike:
    def __init__(self, kind):
        self.kind = kind
        if kind == "gt":
            self.body = _gt_body()
            self.wheels = (_wire_wheel(False), _wire_wheel(True))
        else:
            self.body = _ninja_body()
            self.wheels = (_alloy_wheel(70), _alloy_wheel(98))
        self.shadow = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
        ImageDraw.Draw(self.shadow).ellipse((120, 712, 1290, 770), fill=(0, 0, 0, 150))
        self.shadow = self.shadow.filter(ImageFilter.GaussianBlur(18))

    def render(self, angle=0.0, shadow=True, blur=0):
        """Bike with wheels rotated by ``angle`` degrees (negative = rolling forward)."""
        im = self.shadow.copy() if shadow else Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
        for w, c in zip(self.wheels, (REAR, FRONT)):
            r = w.rotate(angle, resample=Image.BICUBIC)
            if blur:
                r = r.filter(ImageFilter.GaussianBlur(blur))
            im.alpha_composite(r, (c[0] - r.width // 2, c[1] - r.height // 2))
        im.alpha_composite(self.body)
        return im
