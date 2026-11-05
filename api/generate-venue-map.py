#!/usr/bin/env python3
"""Static venue map for the desktop detail page's venue card.

Stitches OpenStreetMap tiles (zoom 16) around a venue coordinate into a
576x230 PNG, draws a purple teardrop pin whose tip sits exactly on the
coordinate, and prints the venue's STREET ADDRESS as a text label right
of the pin (Angelo, Nov 4 late: the address treatment, like the mockup —
never the venue name as the map's label; and the pin must be purple,
which the keyless Google embed iframe cannot do).

Usage:
  generate-venue-map.py --lat 43.6612 --lng -70.2468 \
      --line1 "144 Fore Street" --line2 "Portland, ME" --out map-435.png

Tiles are fetched once and the result is self-hosted under
/opt/smevents/api/uploads/ by the API (see venueMapUrl/generateVenueMap
in server.js). Attribution line is baked into the image bottom-right,
per the OSM tile usage policy.
"""
import argparse
import io
import math
import os
import sys

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ZOOM = 16
OUT_W, OUT_H = 576, 230
TILE = 256
UA = {"User-Agent": "JoinarooVenueMaps/1.0 (https://joinaroo.com)"}

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
FONT_BOLD = os.path.join(ASSETS, "DejaVuSans-Bold.ttf")
FONT_REG = os.path.join(ASSETS, "DejaVuSans.ttf")

PIN_PURPLE = (124, 58, 237, 255)      # #7C3AED
PIN_EDGE = (91, 33, 182, 255)         # #5B21B6
LABEL_DARK = (31, 41, 55, 255)        # slate-800
ATTR_DARK = (71, 85, 105, 255)


def world_px(lat, lng, zoom):
    n = TILE * (2 ** zoom)
    x = (lng + 180.0) / 360.0 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def fetch_tile(z, x, y):
    url = "https://tile.openstreetmap.org/%d/%d/%d.png" % (z, x, y)
    r = requests.get(url, headers=UA, timeout=15)
    r.raise_for_status()
    return Image.open(io.BytesIO(r.content)).convert("RGB")


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def text_size(draw, text, font):
    try:
        return font.getsize(text)
    except Exception:
        box = draw.textbbox((0, 0), text, font=font)
        return box[2] - box[0], box[3] - box[1]


def halo_text(draw, xy, text, font, fill):
    """Dark text with a soft white halo, legible over map detail."""
    x, y = xy
    for dx in (-3, -2, -1, 0, 1, 2, 3):
        for dy in (-3, -2, -1, 0, 1, 2, 3):
            if dx or dy:
                draw.text((x + dx, y + dy), text, font=font,
                          fill=(255, 255, 255, 200))
    draw.text((x, y), text, font=font, fill=fill)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lng", type=float, required=True)
    ap.add_argument("--line1", default="")
    ap.add_argument("--line2", default="")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    cx, cy = world_px(args.lat, args.lng, ZOOM)
    left, top = cx - OUT_W / 2.0, cy - OUT_H / 2.0

    tx0, ty0 = int(left // TILE), int(top // TILE)
    tx1, ty1 = int((left + OUT_W) // TILE), int((top + OUT_H) // TILE)
    canvas = Image.new("RGB", ((tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE),
                       (238, 238, 238))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            tile = fetch_tile(ZOOM, tx, ty)
            canvas.paste(tile, ((tx - tx0) * TILE, (ty - ty0) * TILE))
    ox, oy = int(round(left - tx0 * TILE)), int(round(top - ty0 * TILE))
    img = canvas.crop((ox, oy, ox + OUT_W, oy + OUT_H)).convert("RGBA")

    px, py = OUT_W // 2, OUT_H // 2  # the coordinate sits exactly here

    # --- pin, drawn on a 3x supersampled layer for clean edges ---
    S = 3
    layer = Image.new("RGBA", (OUT_W * S, OUT_H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cxp, cyp = px * S, py * S
    head_cy = cyp - 40 * S          # head center above the tip
    head_r = 23 * S
    # soft shadow
    sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    ds.ellipse([cxp - head_r, head_cy - head_r + 4 * S,
                cxp + head_r, head_cy + head_r + 4 * S], fill=(0, 0, 0, 90))
    ds.polygon([(cxp - 15 * S, head_cy + 10 * S), (cxp + 15 * S, head_cy + 10 * S),
                (cxp, cyp + 4 * S)], fill=(0, 0, 0, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(4 * S))
    layer = Image.alpha_composite(layer, sh)
    d = ImageDraw.Draw(layer)
    # teardrop: head circle + tapered tail to the tip point
    d.polygon([(cxp - 16 * S, head_cy + 8 * S), (cxp + 16 * S, head_cy + 8 * S),
               (cxp, cyp)], fill=PIN_PURPLE)
    d.ellipse([cxp - head_r, head_cy - head_r, cxp + head_r, head_cy + head_r],
              fill=PIN_PURPLE)
    d.ellipse([cxp - head_r, head_cy - head_r, cxp + head_r, head_cy + head_r],
              outline=PIN_EDGE, width=2 * S)
    d.ellipse([cxp - 10 * S, head_cy - 10 * S, cxp + 10 * S, head_cy + 10 * S],
              fill=(255, 255, 255, 255))
    layer = layer.resize((OUT_W, OUT_H), Image.LANCZOS)
    img = Image.alpha_composite(img, layer)

    d = ImageDraw.Draw(img)
    # --- address label right of the pin (Angelo: address, not venue name) ---
    if args.line1:
        size1 = 25
        while size1 > 17:
            f1 = load_font(FONT_BOLD, size1)
            w1 = text_size(d, args.line1, f1)[0]
            if px + 38 + w1 <= OUT_W - 10:
                break
            size1 -= 2
        f1 = load_font(FONT_BOLD, size1)
        f2 = load_font(FONT_REG, 21)
        lx = px + 38
        ly = (py - 40) - 27
        halo_text(d, (lx, ly), args.line1, f1, LABEL_DARK)
        if args.line2:
            halo_text(d, (lx, ly + size1 + 7), args.line2, f2, LABEL_DARK)
    # --- OSM attribution, bottom-right ---
    fa = load_font(FONT_REG, 11)
    attr = u"© OpenStreetMap contributors"
    aw = text_size(d, attr, fa)[0]
    halo_text(d, (OUT_W - aw - 6, OUT_H - 16), attr, fa, ATTR_DARK)

    img.convert("RGB").save(args.out, "PNG", optimize=True)
    print("wrote", args.out)


if __name__ == "__main__":
    sys.exit(main())
