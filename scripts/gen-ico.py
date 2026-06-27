"""Generate ICO and PNG — PCB routing icon with blue traces, grey vias, 'FR' text."""
import struct, os
from PIL import Image, ImageDraw, ImageFont

SIZES = [16, 24, 32, 48, 64, 128, 256]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PNG = os.path.join(ROOT, "images", "logo.png")
ICO = os.path.join(ROOT, "images", "logo.ico")

BLUE = (41, 128, 255, 255)
BLUE2 = (72, 156, 255, 255)
VIA = (160, 160, 170, 255)
TEXT = (220, 220, 230, 255)
BOARD = (26, 26, 46, 255)

def icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 16
    pad = int(s * 0.5)

    # Board
    d.rounded_rectangle([pad, pad, size-pad, size-pad], radius=max(1,int(s*1.5)), fill=BOARD)

    w = max(1, int(s * 1.0))

    # Route 1 (top) — diagonal PCB traces
    r1 = [(2,4), (5,4), (6.5,5.5), (8,5.5), (10,7.5), (14,7.5)]
    for i in range(len(r1)-1):
        d.line([(r1[i][0]*s, r1[i][1]*s), (r1[i+1][0]*s, r1[i+1][1]*s)], fill=BLUE, width=w)

    # Route 2 (bottom)
    r2 = [(2.5,10.5), (5,10.5), (7,9), (9,9), (11,10), (14,10)]
    for i in range(len(r2)-1):
        d.line([(r2[i][0]*s, r2[i][1]*s), (r2[i+1][0]*s, r2[i+1][1]*s)], fill=BLUE2, width=w)

    # Vias at junctions
    for (x, y) in [(5,4), (6.5,5.5), (10,7.5), (5,10.5), (7,9), (11,10)]:
        r = max(1, int(s * 0.9))
        d.ellipse([x*s-r, y*s-r, x*s+r, y*s+r], fill=VIA)

    # "FR" text
    try:
        f = ImageFont.truetype("segoeui.ttf", max(6, int(s*4)))
    except Exception:
        f = ImageFont.load_default()
    b = d.textbbox((0, 0), "FR", font=f)
    tx = (size - b[2] + b[0]) // 2
    d.text((tx, int(s*10.5) - (b[3]-b[1])//2), "FR", fill=TEXT, font=f)

    return img

main = icon(256)
main.save(PNG)
print(f"Generated {PNG}")

imgs = [icon(s).convert("RGBA") for s in SIZES]
with open(ICO, "wb") as f:
    f.write(struct.pack("<HHH", 0, 1, len(SIZES)))
    off = 6 + 16 * len(SIZES)
    chunks = []
    for i, img in enumerate(imgs):
        from io import BytesIO
        b = BytesIO(); img.save(b, "PNG"); data = b.getvalue()
        chunks.append(data)
        sz = SIZES[i]
        w = 0 if sz >= 256 else sz
        h = 0 if sz >= 256 else sz
        f.write(struct.pack("<BBBBHHIH", w, h, 0, 0, 1, 32, len(data), off))
        off += len(data)
    for data in chunks:
        f.write(data)
print(f"Generated {ICO} ({len(SIZES)} sizes)")
