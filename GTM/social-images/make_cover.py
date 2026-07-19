#!/usr/bin/env python3
"""AXRIK Facebook cover generator (1640x624, retina; safe-zone centred).

Facebook crops covers: sides on mobile, a little top/bottom on desktop.
So all content is centred within a conservative safe zone. Brand: near-black
background with a soft green glow, white AXRIK logo, green (#2fbf85) accent,
Poppins (falls back to DejaVu). Matches the square social tiles.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "..", "website", "assets", "axrik-logo-transparent.png")
OUT  = os.path.join(HERE, "facebook-cover.png")

W, H = 1640, 624
BG=(10,10,11); WHITE=(248,248,248); MUT=(150,152,158); GREEN=(47,191,133)

def font(bold, sz):
    cands = ([
        "/usr/share/fonts/truetype/google-fonts/Poppins-SemiBold.ttf",
        "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ] if bold else [
        "/usr/share/fonts/truetype/google-fonts/Poppins-Light.ttf",
        "/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ])
    for c in cands:
        if os.path.exists(c): return ImageFont.truetype(c, sz)
    return ImageFont.load_default()

def tw(d,t,ft): b=d.textbbox((0,0),t,font=ft); return b[2]-b[0]
def th(ft): b=ft.getbbox("Ag"); return b[3]-b[1]
def ctext(d, cx, y, t, ft, fill):
    d.text((cx - tw(d,t,ft)/2, y), t, font=ft, fill=fill)
def fitfont(d, t, bold, start, floor, maxw):
    sz=start
    while sz>floor:
        if tw(d,t,font(bold,sz))<=maxw: return font(bold,sz)
        sz-=2
    return font(bold,floor)

# Mobile crops the SIDES hard and the profile picture overlaps the
# bottom-centre, so keep everything inside a narrow central column and
# lift it clear of the lower third.
SAFE_W = 660

img = Image.new("RGB",(W,H),BG)

# soft green glow, lower-right, like the site's shadows
glow = Image.new("RGB",(W,H),BG); gd=ImageDraw.Draw(glow)
gd.ellipse([W-760, H-360, W+240, H+360], fill=(16,60,44))
gd.ellipse([-260,-320, 420, 300], fill=(13,30,24))
glow = glow.filter(ImageFilter.GaussianBlur(190))
img = Image.blend(img, glow, 0.9)
d = ImageDraw.Draw(img)

cx = W//2

# hairline top+bottom brand rule (subtle)
d.rectangle([0,0,W,4], fill=(20,20,22))
d.rectangle([0,H-4,W,H], fill=(20,20,22))

# logo, centred, upper area
if os.path.exists(LOGO):
    lg=Image.open(LOGO).convert("RGBA")
    lw=300; r=lw/lg.width; lg=lg.resize((lw,int(lg.height*r)),Image.LANCZOS)
    img.paste(lg, (cx-lw//2, 96), lg)

# tagline on two lines so it fits the narrow mobile-safe column
tf=fitfont(d, "Custom web apps & websites", False, 46, 30, SAFE_W)
ctext(d, cx, 232, "Custom web apps & websites", tf, WHITE)
ctext(d, cx, 288, "with AI built in", tf, WHITE)

# green accent underline
d.rectangle([cx-52, 352, cx+52, 359], fill=GREEN)

# location + site — kept high, clear of the mobile profile picture
ff=fitfont(d, "UK & Republic of Ireland  ·  axrik.com", False, 28, 20, SAFE_W)
ctext(d, cx, 382, "UK & Republic of Ireland  ·  axrik.com", ff, MUT)

img.save(OUT)
print("wrote", OUT, img.size)
