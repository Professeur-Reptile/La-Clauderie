#!/usr/bin/env python3
"""Génère les icônes de l'app (PWA) à partir du même blason que le favicon.

Le favicon du site est un SVG inline : hexagone doré + « C ». Les navigateurs
mobiles, eux, veulent des PNG pour l'écran d'accueil. Ce script les fabrique
une fois pour toutes ; il n'a pas besoin de tourner à chaque MAJ.

    pip install pillow && python3 scripts/make_icons.py

Sorties (dans assets/) :
  icon-192.png, icon-512.png   → manifest, purpose "any"
  icon-maskable-512.png        → manifest, purpose "maskable" (blason rétréci
                                 pour survivre au rognage rond d'Android)
  icon-180.png                 → apple-touch-icon (iOS)
"""

import os
from PIL import Image, ImageDraw, ImageFont

BG = (11, 13, 18)        # --bg   #0b0d12
GOLD = (200, 160, 75)    # --gold #c8a04b
INK = (26, 19, 10)       # #1a130a, la couleur du « C » dans le favicon

# Hexagone du favicon, en coordonnées 0-100 (viewBox du SVG).
HEX = [(50, 0), (100, 16), (100, 60), (50, 100), (0, 60), (0, 16)]

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SS = 4  # supersampling : on dessine 4× plus grand puis on réduit (anticrénelage)


def render(size, fill=0.78):
    """Blason centré occupant `fill` de la largeur, sur fond sombre opaque."""
    px = size * SS
    img = Image.new("RGB", (px, px), BG)
    d = ImageDraw.Draw(img)

    side = px * fill
    ox = (px - side) / 2
    oy = (px - side) / 2
    def pt(p):
        return (ox + p[0] / 100 * side, oy + p[1] / 100 * side)

    d.polygon([pt(p) for p in HEX], fill=GOLD)

    # « C » : même proportion que dans le SVG (font-size 58, baseline y=72).
    font = ImageFont.truetype(FONT, int(side * 0.58))
    l, t, r, b = font.getbbox("C")
    d.text((ox + side / 2 - (l + r) / 2, oy + side * 0.72 - b), "C",
           font=font, fill=INK)

    return img.resize((size, size), Image.LANCZOS)


def save(img, name):
    path = os.path.join(ROOT, "assets", name)
    img.save(path, "PNG", optimize=True)
    print("écrit :", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    save(render(192), "icon-192.png")
    save(render(512), "icon-512.png")
    save(render(180), "icon-180.png")
    # Maskable : Android peut rogner jusqu'à 20 % de chaque côté → blason plus
    # petit, bien dans la « zone sûre » (cercle central de 80 %).
    save(render(512, fill=0.52), "icon-maskable-512.png")
