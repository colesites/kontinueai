"""Draws the site's Open Graph image: apps/marketing/public/og.png (1200x630).

    python3 -I apps/marketing/scripts/make-og.py <HankenGrotesk[wght].ttf>

A permanent version of the homepage hero: the headline, the line under it,
and the model and agent tiles with their logos in dots. No buttons, version,
download count or stars, so it never goes out of date. Needs Pillow and
rsvg-convert. The font is Hanken Grotesk (OFL), from github.com/google/fonts.
"""

import math
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(HERE, "..", "public")
FONT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "HankenGrotesk.ttf")

S = 2  # draw at 2x, downscale at the end
W, H = 1200 * S, 630 * S

BG = (251, 250, 247)
FG = (22, 19, 17)
BRAND = (125, 52, 230)
MUTED = (104, 100, 96)
GRID = (225, 223, 221)

# name, logo file, centre x/y (1x px), tile size, tilt, optional gradient
TILES = [
    ("OpenCode", "logos/opencode.svg", 318, 100, 74, -5, None),
    ("Antigravity", "logos/antigravity.svg", 882, 100, 74, 5, ["#3186ff", "#8e5cf6", "#ea4335", "#fbbc04"]),
    ("Claude", "claude-ai-icon.svg", 146, 250, 104, -7, None),
    ("OpenAI", "openai.svg", 1054, 250, 100, 6, None),
    ("DeepSeek", "logos/deepseek.svg", 100, 430, 78, 6, None),
    ("Cursor", "logos/cursor.svg", 238, 492, 84, 8, None),
    ("Grok", "grok-light.svg", 960, 482, 84, -8, None),
]


def font(size, weight):
    f = ImageFont.truetype(FONT, size * S)
    f.set_variation_by_axes([weight])
    return f


def text_width(draw, text, f, tracking):
    return draw.textlength(text, font=f) + tracking * (len(text) - 1)


def draw_text(draw, xy, text, f, fill, tracking=0.0):
    """Draws text with letter spacing, keeping the font's own kerning."""
    x, y = xy
    for i, ch in enumerate(text):
        offset = draw.textlength(text[:i], font=f) + tracking * i
        draw.text((x + offset, y), ch, font=f, fill=fill)


def centered(draw, y, text, f, fill, tracking=0.0):
    w = text_width(draw, text, f, tracking)
    draw_text(draw, ((W - w) / 2, y), text, f, fill, tracking)


def rasterize(svg, size):
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as out:
        path = out.name
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), "--keep-aspect-ratio", svg, "-o", path],
        check=True,
    )
    img = Image.open(path).convert("RGBA")
    os.unlink(path)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((size - img.width) // 2, (size - img.height) // 2))
    return canvas


def gradient(size, stops):
    def rgb(h):
        return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))

    colors = [rgb(c) for c in stops]
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            seg = min(int(t * (len(colors) - 1)), len(colors) - 2)
            local = t * (len(colors) - 1) - seg
            a, b = colors[seg], colors[seg + 1]
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * local) for i in range(3))
    return img


def tile_image(svg, tile, grad):
    """A light rounded tile with the logo drawn in dots, before rotation."""
    t = tile * S
    pad = 40 * S
    img = Image.new("RGBA", (t + 2 * pad, t + 2 * pad), (0, 0, 0, 0))

    # Soft shadow.
    shadow = Image.new("L", img.size, 0)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (pad, pad + 10 * S, pad + t, pad + t + 10 * S), radius=t * 0.27, fill=70
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(14 * S))
    img.paste((20, 16, 40, 255), (0, 0), shadow)

    # Tile: white to warm off-white, hairline edge.
    body = Image.new("RGBA", (t, t))
    top, bottom = (255, 255, 255), (241, 240, 235)
    for y in range(t):
        k = y / (t - 1)
        ImageDraw.Draw(body).line(
            [(0, y), (t, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * k) for i in range(3)) + (255,)
        )
    mask = Image.new("L", (t, t), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, t - 1, t - 1), radius=t * 0.27, fill=255)
    img.paste(body, (pad, pad), mask)
    ImageDraw.Draw(img).rounded_rectangle(
        (pad, pad, pad + t - 1, pad + t - 1), radius=t * 0.27, outline=(0, 0, 0, 20), width=S
    )

    # Logo in dots, about half the tile.
    g = round(t * 0.52)
    logo = rasterize(os.path.join(PUBLIC, svg), g)
    if grad:
        colored = gradient(g, grad).convert("RGBA")
        colored.putalpha(logo.getchannel("A"))
        logo = colored
    dots = ImageDraw.Draw(img)
    gap, r = 2.6 * S, 0.95 * S
    ox = oy = pad + (t - g) / 2
    px = logo.load()
    y = 0.0
    while y < g:
        x = 0.0
        while x < g:
            cr, cg, cb, ca = px[int(x), int(y)]
            if ca >= 110:
                cx, cy = ox + x, oy + y
                dots.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(cr, cg, cb, 235))
            x += gap
        y += gap
    return img


def main():
    img = Image.new("RGBA", (W, H), BG + (255,))

    # Faint grid that fades out toward the edges (the site's bg-grid).
    grid = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grid)
    step = 56 * S
    for x in range(0, W, step):
        gd.line([(x, 0), (x, H)], fill=255, width=S)
    for y in range(0, H, step):
        gd.line([(0, y), (W, y)], fill=255, width=S)
    fade = Image.new("L", (W, H), 0)
    ImageDraw.Draw(fade).ellipse((-W * 0.1, -H * 0.25, W * 1.1, H * 1.25), fill=105)
    fade = fade.filter(ImageFilter.GaussianBlur(160 * S))
    img.paste(GRID + (255,), (0, 0), ImageChops.multiply(grid, fade))

    # Tiles behind the text.
    for _, svg, cx, cy, tile, tilt, grad in TILES:
        t = tile_image(svg, tile, grad).rotate(-tilt, resample=Image.BICUBIC, expand=True)
        img.alpha_composite(t, (round(cx * S - t.width / 2), round(cy * S - t.height / 2)))

    draw = ImageDraw.Draw(img)

    # Wordmark.
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as out:
        wm_path = out.name
    subprocess.run(["rsvg-convert", "-h", str(30 * S), os.path.join(PUBLIC, "kontinueai.svg"), "-o", wm_path], check=True)
    mark = Image.open(wm_path).convert("RGBA")
    os.unlink(wm_path)
    black = Image.new("RGBA", mark.size, FG + (255,))
    black.putalpha(mark.getchannel("A"))
    img.alpha_composite(black, ((W - mark.width) // 2, 60 * S))

    # Headline: two lines, the second in brand purple.
    head = font(88, 600)
    track = -0.04 * 88 * S
    centered(draw, 168 * S, "Hit your AI limit?", head, FG + (255,), track)
    centered(draw, 262 * S, "Keep going.", head, BRAND + (255,), track)

    # The line under it.
    sub = font(27, 400)
    centered(draw, 400 * S, "Continue ChatGPT, Claude and Gemini chats, and", sub, MUTED + (255,))
    centered(draw, 438 * S, "Claude Code or Codex sessions, after a limit.", sub, MUTED + (255,))

    # Address.
    small = font(19, 500)
    centered(draw, 560 * S, "kontinueai.com", small, (140, 136, 132, 255), 0.5 * S)

    out = img.convert("RGB").resize((1200, 630), Image.LANCZOS)
    path = os.path.join(PUBLIC, "og.png")
    out.save(path, optimize=True)
    print("wrote", os.path.relpath(path))


if __name__ == "__main__":
    main()
