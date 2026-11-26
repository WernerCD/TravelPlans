"""Animated GIF: rough 14-night cost for 2 people, six destinations, with visa status per passport.
Run: python tools/make_gif.py  -> site/winter-trip-costs.gif and site/og.png."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "site" / "winter-trip-costs.gif"
W = 1000
BG, FG, MUTED, GRID = (246, 247, 249), (27, 35, 48), (91, 102, 118), (221, 226, 234)
OK, WARN, BAD = (31, 122, 67), (196, 124, 0), (179, 38, 30)

# name, low, high, colour, US status, NG status, note
DATA = [
    ("Sri Lanka", 4000, 6900, (161, 92, 29), WARN, WARN, "ETA both; NG rule unconfirmed"),
    ("Thailand", 4300, 7100, (126, 87, 194), OK, WARN, "NG e-visa ~1 week"),
    ("Vietnam", 4000, 7500, (168, 50, 110), WARN, WARN, "same e-visa both; avoid Tet ~6 Feb"),
    ("Germany", 5600, 7700, (59, 74, 99), OK, BAD, "NG Schengen visa, long wait"),
    ("Japan", 6400, 9900, (181, 54, 58), OK, WARN, "NG visa ~2-3 weeks"),
    ("Barbados", 6750, 10700, (15, 127, 134), OK, OK, "Air Peace fare extra; few flights"),
    ("Kenya", 6300, 11200, (64, 120, 50), WARN, OK, "safari is most of the cost"),
]
XMAX = 12000
L, R, TOP, ROW = 170, 70, 150, 64
H = TOP + ROW * len(DATA) + 86  # 684 for seven rows


def font(name, size):
    try:
        return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
    except OSError:
        return ImageFont.load_default()


F_T, F_S, F_B, F_R, F_SM = font("segoeuib.ttf", 30), font("segoeui.ttf", 17), font("segoeuib.ttf", 19), font("segoeui.ttf", 16), font("segoeui.ttf", 14)


def x_of(v):
    return L + (W - L - R) * v / XMAX


def frame(shown, progress):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((40, 28), "Two weeks for two: rough total cost", font=F_T, fill=FG)
    d.text((40, 70), "14 nights, Jan/Feb 2027, flights from St. Louis + Port Harcourt, mid-range hotel. Estimates, not quotes.", font=F_S, fill=MUTED)
    # legend
    lx = 40
    for lab, col in (("visa-free", OK), ("online / simple visa", WARN), ("consulate visa, slow", BAD)):
        d.ellipse((lx, 108, lx + 12, 120), fill=col)
        d.text((lx + 18, 103), lab, font=F_SM, fill=MUTED)
        lx += 40 + d.textlength(lab, font=F_SM)
    d.text((W - 230, 103), "dots: US passport | NG passport", font=F_SM, fill=MUTED)
    # grid
    gy0, gy1 = TOP - 8, TOP + ROW * len(DATA)
    for v in range(0, XMAX + 1, 2000):
        x = x_of(v)
        d.line((x, gy0, x, gy1), fill=GRID, width=1)
        lab = f"${v // 1000}k" if v else "$0"
        d.text((x - d.textlength(lab, font=F_SM) / 2, gy1 + 6), lab, font=F_SM, fill=MUTED)
    for i, (name, lo, hi, col, us, ng, note) in enumerate(DATA[:shown]):
        y = TOP + i * ROW
        p = progress if i == shown - 1 else 1.0
        d.text((40, y + 4), name, font=F_B, fill=FG)
        d.ellipse((40, y + 32, 52, y + 44), fill=us)
        d.ellipse((58, y + 32, 70, y + 44), fill=ng)
        x0 = x_of(lo)
        x1 = x0 + (x_of(hi) - x0) * p
        d.rounded_rectangle((x0, y + 6, max(x1, x0 + 2), y + 30), radius=5, fill=col)
        if p >= 1.0:
            rng = f"${lo:,} - ${hi:,}" + ("+" if name == "Barbados" else "")
            d.text((x0, y + 33), f"{rng}   {note}", font=F_SM, fill=MUTED)
    d.text((40, H - 34), "Sources and details: Winter Trip comparison page. Researched 26 Nov 2026.", font=F_SM, fill=MUTED)
    return im


frames, durs = [], []
for n in range(1, len(DATA) + 1):
    for k in range(1, 9):
        frames.append(frame(n, k / 8))
        durs.append(45)
    durs[-1] = 500
frames.append(frame(len(DATA), 1.0))
durs.append(6000)
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=durs, loop=0, optimize=True)
frames[-1].save(OUT.with_name("og.png"))
print(OUT, len(frames), "frames", OUT.stat().st_size // 1024, "KB")

