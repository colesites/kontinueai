"""Draws the Kontinue AI app icon.

  python3 -I src-tauri/icons/make_icon.py   (from apps/desktop)

Writes two 1024px masters next to this file:
  icon-macos.png  Apple's icon grid: an 824px tile with room around it for the
                  shadow, so the app is the same size as others in the Dock.
  icon-full.png   The tile filling the canvas, for Windows and Linux.
Then `bunx tauri icon` turns them into the bundle icons (see README in the PR).
"""

import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "..", "public", "kontinueai-icon.png")

SS = 2  # draw at 2x, then downscale for smooth edges
SIZE = 1024 * SS


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def vertical_gradient(w, h, top, bottom):
    grad = Image.new("RGBA", (1, h))
    for y in range(h):
        grad.putpixel((0, y), lerp(top, bottom, y / max(1, h - 1)))
    return grad.resize((w, h))


def squircle_mask(size, box, exponent=5.0):
    """Apple-like continuous corners (superellipse) inside box=(x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    points = []
    for i in range(720):
        t = 2 * math.pi * i / 720
        c, s = math.cos(t), math.sin(t)
        x = cx + rx * math.copysign(abs(c) ** (2 / exponent), c)
        y = cy + ry * math.copysign(abs(s) ** (2 / exponent), s)
        points.append((x, y))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def edge_light(size, box, exponent=5.0):
    """How much light each point of the edge catches (0-255).

    The edge's outward direction comes from the superellipse itself; light
    comes from the top-left, with a weaker reflection from the bottom-right.
    Worked out on a small grid (it changes slowly) and scaled up.
    """
    grid = 256
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    lx, ly = -math.sqrt(0.5), -math.sqrt(0.5)
    field = Image.new("L", (grid, grid), 0)
    px = field.load()
    for gy in range(grid):
        for gx in range(grid):
            u = ((gx + 0.5) * size / grid - cx) / rx
            v = ((gy + 0.5) * size / grid - cy) / ry
            nx = math.copysign(abs(u) ** (exponent - 1), u) / rx
            ny = math.copysign(abs(v) ** (exponent - 1), v) / ry
            length = math.hypot(nx, ny)
            if length == 0:
                continue
            d = (nx * lx + ny * ly) / length
            value = 0.1 + 0.9 * (max(d, 0) ** 1.8) + 0.75 * (max(-d, 0) ** 1.8)
            px[gx, gy] = int(255 * min(1.0, value))
    return field.resize((size, size), Image.BICUBIC)


def tile(size, box, shadow):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = squircle_mask(size, box)
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0

    if shadow:
        blur = int(18 * SS)
        shade = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        offset = mask.transform(mask.size, Image.AFFINE, (1, 0, 0, 0, 1, -int(10 * SS)))
        shade.putalpha(offset.point(lambda v: int(v * 0.45)).filter(ImageFilter.GaussianBlur(blur)))
        canvas = Image.alpha_composite(canvas, shade)

    # Background: OpenCode's neutral charcoal, lighter at the top, near black at the bottom.
    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    body.paste(vertical_gradient(w, h, (54, 54, 54, 255), (22, 22, 22, 255)), (x0, y0))
    body.putalpha(ImageChops.multiply(body.getchannel("A"), mask))
    canvas = Image.alpha_composite(canvas, body)

    # Glass edge: light catches the rim where it faces the top-left, and again
    # where it faces the bottom-right; the other two corners stay dark. A bright
    # hairline at the very edge, plus a soft bevel fading inward.
    light = edge_light(size, box)
    line = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(int(2 * SS) * 2 + 1)))
    line = line.filter(ImageFilter.GaussianBlur(0.6 * SS))
    bevel = ImageChops.multiply(mask, ImageChops.invert(mask.filter(ImageFilter.GaussianBlur(9 * SS))))
    bevel = bevel.point(lambda v: min(255, v * 2))
    rim_alpha = ImageChops.add(line.point(lambda v: int(v * 0.95)), bevel.point(lambda v: int(v * 0.55)))
    rim_alpha = ImageChops.multiply(rim_alpha, light)
    rim = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    rim.putalpha(rim_alpha)
    canvas = Image.alpha_composite(canvas, rim)

    # Logo: about half the tile's width, purple gradient, small shadow.
    logo = Image.open(LOGO).convert("RGBA").getchannel("A")
    target_w = int(w * 0.5)
    target_h = round(logo.height * target_w / logo.width)
    logo = logo.resize((target_w, target_h), Image.LANCZOS)
    lx = x0 + (w - target_w) // 2
    ly = y0 + (h - target_h) // 2 + int(h * 0.01)

    logo_mask = Image.new("L", (size, size), 0)
    logo_mask.paste(logo, (lx, ly))
    drop = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    drop.putalpha(
        logo_mask.transform(logo_mask.size, Image.AFFINE, (1, 0, 0, 0, 1, -int(8 * SS)))
        .point(lambda v: int(v * 0.5))
        .filter(ImageFilter.GaussianBlur(14 * SS))
    )
    canvas = Image.alpha_composite(canvas, drop)

    fill = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fill.paste(vertical_gradient(target_w, target_h, (150, 104, 255, 255), (98, 22, 214, 255)), (lx, ly))
    fill.putalpha(logo_mask)
    canvas = Image.alpha_composite(canvas, fill)
    return canvas


def save(img, name):
    img.resize((1024, 1024), Image.LANCZOS).save(os.path.join(HERE, name))


margin = 100 * SS  # 824px tile on a 1024px canvas (Apple's macOS grid)
save(tile(SIZE, (margin, margin, SIZE - margin, SIZE - margin), shadow=True), "icon-macos.png")
edge = 8 * SS
save(tile(SIZE, (edge, edge, SIZE - edge, SIZE - edge), shadow=False), "icon-full.png")
print("wrote icon-macos.png and icon-full.png")
