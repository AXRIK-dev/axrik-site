#!/usr/bin/env python3
"""AXRIK Instagram / social profile avatar (1080x1080, circle-safe).

A wide wordmark disappears in Instagram's small circle, so this builds a
square icon from the brand 'X' mark on the near-black brand background, sized
to sit comfortably inside the circular crop. Same palette as the tiles/cover.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "..", "website", "assets", "axrik-logo-transparent.png")
OUT  = os.path.join(HERE, "instagram-avatar.png")

S = 1080
BG=(10,10,11); GREEN=(47,191,133)

# --- background: brand near-black with a soft green glow bottom-right ---
img = Image.new("RGB",(S,S),BG)
glow = Image.new("RGB",(S,S),BG); gd=ImageDraw.Draw(glow)
gd.ellipse([S-620, S-620, S+180, S+180], fill=(16,58,43))
glow = glow.filter(ImageFilter.GaussianBlur(150))
img = Image.blend(img, glow, 0.85)

# --- locate the 'X' mark using the green chevron pixels ---
lg = Image.open(LOGO).convert("RGBA")
px = lg.load()
W,H = lg.size
minx,miny,maxx,maxy = W,H,0,0
for y in range(H):
    for x in range(W):
        r,g,b,a = px[x,y]
        if a>40 and g>90 and g> r+25 and g> b+15:   # greenish
            if x<minx:minx=x
            if x>maxx:maxx=x
            if y<miny:miny=y
            if y>maxy:maxy=y
gw = maxx-minx
# the X = green right-half + a mirrored white left-half of equal width
x0 = max(0, minx-gw-6); x1 = min(W, maxx+6)
y0 = max(0, miny-6);    y1 = min(H, maxy+6)
mark = lg.crop((x0,y0,x1,y1))

# scale the mark to ~46% of the canvas (circle-safe), keep aspect
target = int(S*0.46)
r = target/mark.width
mark = mark.resize((target, int(mark.height*r)), Image.LANCZOS)

# centre it
mx = (S-mark.width)//2
my = (S-mark.height)//2
img.paste(mark, (mx,my), mark)

img.save(OUT)
print("wrote", OUT, img.size, "mark box", (x0,y0,x1,y1))
