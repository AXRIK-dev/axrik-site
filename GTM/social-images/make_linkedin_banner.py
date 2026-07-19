#!/usr/bin/env python3
"""AXRIK LinkedIn Company Page banner (2256x382 = 1128x191 @2x).

LinkedIn's company cover is a wide, short strip and the page logo overlaps the
BOTTOM-LEFT corner, so all copy is left-aligned starting well to the right of
that corner and vertically centred. Brand: near-black + green glow, Poppins.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, "linkedin-banner.png")
W, H = 2256, 382
BG=(10,10,11); WHITE=(248,248,248); MUT=(150,152,158); GREEN=(47,191,133)

def font(bold, sz):
    cands = ([
        "/usr/share/fonts/truetype/google-fonts/Poppins-SemiBold.ttf",
        "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ] if bold else [
        "/usr/share/fonts/truetype/google-fonts/Poppins-Light.ttf",
        "/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ])
    for c in cands:
        if os.path.exists(c): return ImageFont.truetype(c, sz)
    return ImageFont.load_default()

def tw(d,t,ft): b=d.textbbox((0,0),t,font=ft); return b[2]-b[0]
def th(ft): b=ft.getbbox("Ag"); return b[3]-b[1]
def fitfont(d,t,bold,start,floor,maxw):
    sz=start
    while sz>floor:
        if tw(d,t,font(bold,sz))<=maxw: return font(bold,sz)
        sz-=2
    return font(bold,floor)

img = Image.new("RGB",(W,H),BG)
glow=Image.new("RGB",(W,H),BG); gd=ImageDraw.Draw(glow)
gd.ellipse([W-900,H-500,W+260,H+500], fill=(16,58,43))
glow=glow.filter(ImageFilter.GaussianBlur(200))
img=Image.blend(img,glow,0.85)
d=ImageDraw.Draw(img)

# left edge of copy — clears the bottom-left logo overlap
X = 760
MAXW = W - X - 140

# green accent bar
d.rectangle([X, 150, X+10, 232], fill=GREEN)
tx = X + 46

l1 = "Custom web apps & websites — with AI built in."
l2 = "United Kingdom & Republic of Ireland  ·  axrik.com"
f1 = fitfont(d, l1, False, 74, 40, MAXW)
f2 = fitfont(d, l2, False, 42, 26, MAXW)

d.text((tx, 150), l1, font=f1, fill=WHITE)
d.text((tx, 150+th(f1)+26), l2, font=f2, fill=MUT)

img.save(OUT)
print("wrote", OUT, img.size)
