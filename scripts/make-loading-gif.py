#!/usr/bin/env python3
# GARY — generate the boot "loading" GIF (public/gary-loading.gif): a 16-bit pixel-art husky puppy (face +
# palette from the isotipo: black ears/cap, white blaze, tan cheeks, golden eyes) sits watching a bouncing
# ball in the brand accent, over a scrolling ground, with a pixel-font "LOADING..." underneath.
# Deterministic, no assets needed: `python3 scripts/make-loading-gif.py` (requires Pillow).
# Output is drawn on a small logical canvas and upscaled ×SCALE with nearest-neighbour so pixels stay crisp.
import math
import os
from PIL import Image

W, H = 120, 80          # logical canvas (pixels)
SCALE = 4               # exported size = 480×320
FRAMES = 48             # one seamless loop (ball: 4 hops, tail: 6 wags)
DELAY = 70              # ms per frame (GIF stores centiseconds) → loop ≈ 3.4 s
GROUND = 66             # y of the ground line

# Palette (index 0 = transparent). Colors sampled from public/isotipo-clean.png + tokens.css accent.
PAL = {
    ".": (0, 0, 0),          # transparent
    "O": (14, 11, 13),       # outline
    "B": (42, 38, 48),       # black fur
    "H": (78, 72, 88),       # black fur highlight
    "T": (196, 154, 108),    # tan
    "t": (150, 112, 72),     # tan shade / far legs
    "W": (246, 241, 232),    # white
    "w": (206, 196, 182),    # white shade
    "Y": (232, 200, 74),     # eye
    "N": (8, 6, 8),          # nose
    "P": (228, 106, 122),    # tongue
    "p": (180, 70, 90),      # tongue shade (center groove)
    "A": (206, 129, 45),     # accent (ball)
    "a": (154, 83, 45),      # accent shade
    "L": (246, 200, 132),    # accent light
    "G": (110, 98, 92),      # ground
    "g": (70, 62, 60),       # ground shade / shadow
}
KEYS = list(PAL)
IDX = {k: i for i, k in enumerate(KEYS)}

# ── The husky (sitting puppy, front view like the isotipo) ───────────────────────────────────────────────
# Original sprite in the classic "sitting pet" pixel-art construction: big head (~half the height) with the
# isotipo face (black ears + cap, white blaze, tan cheeks, golden eyes, white muzzle, black nose), hand-drawn
# 1-px dark outline, white chest + front legs separated by outline, tan haunches, white paws with toe lines.
# Drawn as the left half and mirrored → perfectly symmetric. It watches the ball (eyes track it), wags its
# fluffy tail, bobs its head and blinks.
# Rows are (left half, center column), mirrored around the center column → odd width with a true center
# line (blaze, nose, 1-px gap between the front legs). The head is the isotipo mapped onto a 31-px grid: big
# solid-black ears, black cap over the top half, a thin white blaze widening into the muzzle, tan brows +
# lower face, big nose with the smile lines, pointed heart-shaped chin. Proportions follow the classic sitting-pet sprite:
# head ≈ body width, tall narrow ears, small eyes on the mask edge, fluffy cheeks, narrow neck, wide haunches.
HEAD = [
    ("....OOO........", "."),
    ("....OBBO.......", "."),
    ("...OBHBBO......", "."),
    ("...OBHBBO......", "."),
    ("...OBHBBBO.....", "."),
    ("...OBHBBBBO....", "."),
    ("..OBBHBBBBBOOOO", "O"),
    ("..OBBBBBBBBBBBB", "B"),
    ("..OBBBBBBBBBBBB", "B"),
    ("..OBBBBBBBBBBBB", "W"),
    ("..OBBBBBBBBBBBW", "W"),
    ("..OBBBBBBBBBBBW", "W"),
    ("..OBBBBBBBBBBBW", "W"),
    ("..OBBBBBBBTTTBW", "W"),
    ("..OBBBBBBTTTTTW", "W"),
    ("..OBBBBBTTTTTTW", "W"),
    ("..OBBBBTTTTTTTW", "W"),
    (".OBBBBBTTTTTTTW", "W"),
    (".OBBBBTTTTTTTTW", "W"),
    (".OBBBTTTTTTTTWW", "W"),
    ("OBBBTTTTTTTTTWW", "W"),
    ("OBBTTTTTTTTTOWW", "W"),
    (".OBTTTTTTTTOWWW", "W"),
    (".OBTTTTTTTTOWWW", "W"),
    (".OTTTTTTOTOWWNN", "N"),
    ("..OTTTTTOTOWWNN", "N"),
    ("..OTTTTTTOOWWWN", "N"),
    ("..OBTTTTTOOWWWW", "O"),
    ("...OTTTTTTOWWWO", "O"),
    ("....OTTTTTOOOOW", "W"),
    (".....OTTTTTOWWW", "W"),
    ("......OBTTTTOOO", "O"),
    (".......OBTTTTTT", "T"),
    (".........OBTTTT", "T"),
    ("...........OOOT", "T"),
    ("..............O", "O"),
]

BODY = [
    ("......OBBBBBBWWWWW", "W"),
    (".....OBBBBBBWWWWWW", "W"),
    ("....OBBBBBBWWWWWWW", "W"),
    ("....OBBBBBBBWwWWWW", "W"),
    ("...OBBBBBBBBwWWwWW", "W"),
    ("...OBBBBBBBBBWWWWW", "W"),
    ("...OBBBBBBBBOWWWWW", "w"),
    ("..OBBBBBBBBBOWWWWW", "O"),
    ("..OBBBBBBBTBOWWWWW", "O"),
    ("..OBBBBBBTTBOWWWWW", "O"),
    (".OBBBBBBTTTBOWWWWW", "O"),
    (".OBBBBBTTTTTOWWWWW", "O"),
    (".OBBBBTTTTTtOWWWWW", "O"),
    ("OBBBBTTTTTTtOWWWWW", "O"),
    ("OBBBTTTTTTTtOWWWWW", "O"),
    ("OBBTTTTTTTTtOWWWWW", "O"),
    ("OBBTTTTTTTttOWWWWW", "O"),
    ("OBTTTTTTTTttOWWWWW", "O"),
    ("OBTTTTTTTttOWWWWWW", "O"),
    ("OBTTTTTTtttOWWWWWW", "O"),
    ("OWWWWTTTttOWWWWWWW", "O"),
    ("OWWWWWWTtOWWWWWWWW", "O"),
    ("OWWWWWWWOOWWWWWWWW", "O"),
    ("OWOWOWOWO.OWOWOWOW", "O"),
    (".OOOOOOOO.OOOOOOOO", "O"),
]


def _build(rows, pad=0):
    return ["." * pad + h + c + h[::-1] + "." * pad for h, c in rows]


# The body is wider than the head (wide haunches, like the reference sitting pups) and starts OVERLAP rows
# above the chin so the jaw sits on the chest ruff; the head is centered on it and drawn on top.
HEAD_GRID = _build(HEAD, pad=3)
BODY_GRID = _build(BODY)
HEAD_ROWS = len(HEAD)
OVERLAP = 6
SPRITE_W = len(BODY_GRID[0])
SPRITE_H = HEAD_ROWS + len(BODY_GRID) - OVERLAP
# Eyes are drawn per frame on the tan mask (rows 16–19): the isotipo's almond eye — heavy black lid with the
# husky "eyeliner" wing, round golden iris, pupil with a soft catchlight. Gaze = the pupil slides inside the eye.
EYE_ROW = 16
EYE_X = (10, 21)  # left, right (head-grid coords)
EYE_LIDS = (["OOOOO.", None, None, ".OOOO."], [".OOOOO", None, None, ".OOOO."])
LOOK = {  # iris rows (row 17, row 18) per gaze; same on both eyes (one light source)
    -1: ("OHNYYO", "ONNYYO"),
    0: ("OYHNYO", "OYNNYO"),
    1: ("OYYHNO", "OYYNNO"),
}
EYE_BLINK = ("......", ".OOOO.", "O....O", "......")  # happy closed "^" eyes

# Fluffy tail curling out from behind the right haunch (fills only; the outline is automatic).
TAILS = [
    ["........WW..", ".......WBBW.", "......WBBBBW", ".....BBBBBW.", "....BBBBBW..", "...BBBBBW...",
     "..BBBBB.....", ".BBBBB......", "BBBBB.......", "BBBB........", "BBB........."],
    ["............", "............", "..........WW", "........WBBW", "......BBBBBW", "....BBBBBBW.",
     "..BBBBBBB...", ".BBBBBB.....", "BBBBB.......", "BBBB........", "BBB........."],
    ["............", "............", "............", "............", ".........WWW", "......BBBBBW",
     "...BBBBBBBBW", ".BBBBBBBBW..", "BBBBBB......", "BBBB........", "BBB........."],
]
WAG = [0, 1, 2, 1]  # tail pose sequence (one step every 2 frames)

# 5×5 pixel font for the caption.
FONT = {
    "L": ["X....", "X....", "X....", "X....", "XXXXX"],
    "O": [".XXX.", "X...X", "X...X", "X...X", ".XXX."],
    "A": [".XXX.", "X...X", "XXXXX", "X...X", "X...X"],
    "D": ["XXXX.", "X...X", "X...X", "X...X", "XXXX."],
    "I": ["XXX", ".X.", ".X.", ".X.", "XXX"],
    "N": ["X...X", "XX..X", "X.X.X", "X..XX", "X...X"],
    "G": [".XXXX", "X....", "X..XX", "X...X", ".XXX."],
    ".": ["..", "..", "..", "..", "XX"],
}


def new_frame():
    return [[0] * W for _ in range(H)]


def put(f, x, y, c):
    if 0 <= x < W and 0 <= y < H:
        f[y][x] = IDX[c]


def line(f, x0, y0, x1, y1, c):
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(n + 1):
        put(f, round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), c)


def outline(f, layer):
    """Paint an outline around every non-transparent pixel of `layer` (a sparse sprite mask) into f."""
    for (x, y), c in layer.items():
        if c == "O":  # hand-drawn outline already
            continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p = (x + dx, y + dy)
            if p not in layer and 0 <= p[0] < W and 0 <= p[1] < H:
                f[p[1]][p[0]] = IDX["O"]


def _stamp(layer, grid, x0, y0):
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c != ".":
                layer[(x0 + x, y0 + y)] = c


def sprite_layer(ox, oy, i, look, blink):
    """Sitting husky as {(x, y): color}. i = frame index (drives the tail wag + head bob)."""
    layer = {}
    tail = TAILS[WAG[(i // 2) % len(WAG)]]
    _stamp(layer, tail, ox + SPRITE_W - 3, oy + SPRITE_H - 5 - len(tail))  # behind the body
    _stamp(layer, BODY_GRID, ox, oy + HEAD_ROWS - OVERLAP)

    hb = 1 if (i // 6) % 2 else 0  # gentle head bob (head only; body stays planted)
    rows = [list(r) for r in HEAD_GRID]
    for ex, lids in zip(EYE_X, EYE_LIDS):
        eye = EYE_BLINK if blink else [lids[0], LOOK[look][0], LOOK[look][1], lids[3]]
        for dy, eye_row in enumerate(eye):
            for dx, c in enumerate(eye_row):
                if c != ".":
                    rows[EYE_ROW + dy][ex + dx] = c
    _stamp(layer, rows, ox, oy + hb)
    return layer


def draw_ball(f, cx, cy, squash):
    rx, ry = 4 + squash, 4 - squash
    pts = {}
    for y in range(-ry - 1, ry + 2):
        for x in range(-rx - 1, rx + 2):
            if (x / (rx + 0.5)) ** 2 + (y / (ry + 0.5)) ** 2 <= 1:
                c = "A"
                if x + y > rx - 1:
                    c = "a"
                if (x + 1.5) ** 2 + (y + 1.5) ** 2 <= 2.2:
                    c = "L"
                pts[(cx + x, cy + y)] = c
    outline(f, pts)
    for (x, y), c in pts.items():
        put(f, x, y, c)


def shadow(f, cx, w):
    for x in range(cx - w, cx + w + 1):
        put(f, x, GROUND + 1, "g")


def text(f, s, x, y, c):
    pts = {}
    for ch in s:
        g = FONT[ch]
        for gy, row in enumerate(g):
            for gx, px in enumerate(row):
                if px == "X":
                    pts[(x + gx, y + gy)] = c
        x += len(g[0]) + 1
    outline(f, pts)
    for (px, py), col in pts.items():
        put(f, px, py, col)


def text_width(s):
    return sum(len(FONT[ch][0]) + 1 for ch in s) - 1


def render(i):
    f = new_frame()
    t = i / FRAMES

    # Ground: a solid line with a few pebbles (static — the puppy sits, the ball does the moving).
    for x in range(W):
        put(f, x, GROUND, "G")
        k = x % 32
        if k in (3, 4, 19):
            put(f, x, GROUND + 2, "g")
        if k == 26:
            put(f, x, GROUND + 3, "g")

    # The ball bounces back and forth in front of the puppy: 4 hops per loop, squash on contact.
    ball_x = 88 + round(20 * math.sin(2 * math.pi * t))
    ph = (i % 12) / 12
    hgt = abs(math.sin(math.pi * ph)) * 16
    squash = 1 if ph == 0 else 0
    ball_y = GROUND - 5 - round(hgt) + squash
    shadow(f, ball_x, 3 if hgt < 8 else 2)
    draw_ball(f, ball_x, ball_y, squash)

    # The husky watches it: eyes follow the ball, blinks once per loop.
    dog_x, dog_y = 4, GROUND - SPRITE_H + 1
    look = 1 if ball_x > 88 else 0
    blink = i in (40, 41)
    shadow(f, dog_x + 18, 20)
    layer = sprite_layer(dog_x, dog_y, i, look, blink)
    outline(f, layer)
    for (x, y), c in layer.items():
        put(f, x, y, c)

    # Caption: LOADING + 0..3 cycling dots (dot slots reserved so the word never shifts).
    word = "LOADING"
    dots = "." * ((i // 6) % 4)
    tx = (W - text_width(word + "...")) // 2
    text(f, word + dots, tx, GROUND + 7, "A")
    return f


def to_image(f):
    img = Image.new("P", (W, H), 0)
    flat = []
    for k in KEYS:
        flat += PAL[k]
    img.putpalette(flat + [0] * (768 - len(flat)))
    img.putdata([c for row in f for c in row])
    return img.resize((W * SCALE, H * SCALE), Image.NEAREST)


def main():
    frames = [to_image(render(i)) for i in range(FRAMES)]
    out = os.path.join(os.path.dirname(__file__), "..", "public", "gary-loading.gif")
    frames[0].save(
        out, save_all=True, append_images=frames[1:], duration=DELAY, loop=0,
        transparency=0, disposal=2, optimize=False,
    )
    print("wrote", os.path.normpath(out))


if __name__ == "__main__":
    main()
