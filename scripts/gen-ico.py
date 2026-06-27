"""Generate ICO and PNG icons — PCB auto-routing style.
Blue traces, grey vias, 45-degree corners, transparent background."""
from PIL import Image, ImageDraw
import struct, os

SIZES = [16, 24, 32, 48, 64, 128, 256]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "images")
ICO_PATH = os.path.join(OUT_DIR, "logo.ico")
PNG_PATH = os.path.join(OUT_DIR, "logo.png")

TRACE_COLORS = [
    (41, 128, 255, 255),   # blue
    (72, 156, 255, 255),   # lighter blue
    (30, 100, 220, 255),   # darker blue
    (100, 180, 255, 255),  # light blue
]
VIA_COLOR = (160, 160, 170, 255)       # grey
VIA_RING = (120, 120, 130, 255)        # darker grey ring
BOARD_COLOR = (34, 40, 49, 255)        # dark board fill
BOARD_STROKE = (60, 70, 85, 255)       # board border

def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = size / 256

    # Board background (rounded rect)
    d.rounded_rectangle(
        [int(16*m), int(16*m), int(240*m), int(240*m)],
        radius=int(10*m), fill=BOARD_COLOR, outline=BOARD_STROKE,
        width=max(1, int(2*m))
    )

    w = max(1, int(3.5 * m))
    via_r = max(1, int(4.5 * m))
    ring_r = max(1, int(6 * m))

    def trace(pts, color):
        scaled = [(int(p[0]*m), int(p[1]*m)) for p in pts]
        d.line(scaled, fill=color, width=w, joint="curve")

    def via(cx, cy):
        x, y, r = int(cx*m), int(cy*m), ring_r
        d.ellipse([x-r, y-r, x+r, y+r], fill=VIA_RING)
        d.ellipse([x-via_r, y-via_r, x+via_r, y+via_r], fill=VIA_COLOR)

    # === 45-degree routing paths ===

    # Route 1: top-left → top-right, horizontal then 45° down
    trace([(30,50), (100,50), (130,80), (160,80), (190,110), (220,110)], TRACE_COLORS[0])
    via(100, 50)
    via(130, 80)
    via(190, 110)

    # Route 2: middle-left → bottom-right, 45° down then horizontal
    trace([(30,130), (70,130), (100,160), (150,160), (180,190), (220,190)], TRACE_COLORS[1])
    via(70, 130)
    via(100, 160)
    via(180, 190)

    # Route 3: bottom-left → middle-right, horizontal then 45° up
    trace([(30,210), (80,210), (110,180), (140,180), (170,150), (220,150)], TRACE_COLORS[2])
    via(80, 210)
    via(110, 180)
    via(170, 150)

    # Route 4: vertical route, center column
    trace([(160,40), (160,70), (190,100), (190,130), (160,160), (160,200)], TRACE_COLORS[3])
    via(160, 70)
    via(190, 100)
    via(190, 130)
    via(160, 160)

    # Route 5: short cross route
    trace([(60,80), (100,80), (120,100), (140,100), (160,120)], TRACE_COLORS[0])
    via(120, 100)
    via(160, 120)

    return img

# Generate PNG
main = draw_icon(256)
main.save(PNG_PATH)
print(f"Generated {PNG_PATH}")

# Generate ICO
ico_images = [draw_icon(s).convert("RGBA") for s in SIZES]

with open(ICO_PATH, "wb") as f:
    f.write(struct.pack("<HHH", 0, 1, len(SIZES)))
    data_start = 6 + 16 * len(SIZES)
    png_chunks = []
    for i, img in enumerate(ico_images):
        from io import BytesIO
        buf = BytesIO()
        img.save(buf, "PNG")
        data = buf.getvalue()
        png_chunks.append(data)
        sz = SIZES[i]
        w = 0 if sz >= 256 else sz
        h = 0 if sz >= 256 else sz
        f.write(struct.pack("<BBBBHHIH", w, h, 0, 0, 1, 32, len(data), data_start))
        data_start += len(data)
    for data in png_chunks:
        f.write(data)

print(f"Generated {ICO_PATH} ({len(SIZES)} sizes)")
print("Done.")
