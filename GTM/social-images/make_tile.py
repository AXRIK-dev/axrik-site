#!/usr/bin/env python3
"""AXRIK on-brand social tile generator (1080x1080 square).

Usage:
  python3 make_tile.py --out FILE.png --headline "line one|line two" \
      [--label "EYEBROW TEXT"] [--sub "sub line 1|sub line 2"] \
      [--footer "axrik.com"] [--accent]

Lines are split on '|'. Keeps the AXRIK brand: near-black background, white
Poppins headline, green (#2fbf85) accents, logo top-left. Headline/sub fonts
auto-shrink so any text fits. Asset paths resolve relative to this file, so it
works in any session. Poppins falls back to Liberation/DejaVu if absent.
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "..", "website", "assets", "axrik-logo-transparent.png")
S, M = 1080, 96
BG=(10,10,11); WHITE=(248,248,248); MUT=(155,157,163); GREEN=(47,191,133)

def font(bold, sz):
    bold_c=["/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
    light_c=["/usr/share/fonts/truetype/google-fonts/Poppins-Light.ttf",
             "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    for c in (bold_c if bold else light_c):
        if os.path.exists(c): return ImageFont.truetype(c, sz)
    return ImageFont.load_default()

def th(ft): b=ft.getbbox("Ag"); return b[3]-b[1]
def tw(d,t,ft): b=d.textbbox((0,0),t,font=ft); return b[2]-b[0]

def fit(d, lines, bold, start, floor, maxw):
    sz=start
    while sz>floor:
        ft=font(bold,sz)
        if all(tw(d,l,ft)<=maxw for l in lines): return ft
        sz-=2
    return font(bold,floor)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--headline", required=True, help="lines split by |")
    ap.add_argument("--label", default="")
    ap.add_argument("--sub", default="")
    ap.add_argument("--footer", default="axrik.com")
    ap.add_argument("--accent", action="store_true")
    a=ap.parse_args()
    img=Image.new("RGB",(S,S),BG); d=ImageDraw.Draw(img)
    if os.path.exists(LOGO):
        lg=Image.open(LOGO).convert("RGBA"); w=210; r=w/lg.width
        lg=lg.resize((w,int(lg.height*r)),Image.LANCZOS); img.paste(lg,(M,M),lg)
    cw=S-2*M; y=300
    if a.label:
        lf=font(True,26); d.text((M,y),a.label.upper(),font=lf,fill=GREEN); y+=th(lf)+30
    head=a.headline.split("|")
    hf=fit(d,head,True,78,44,cw)
    for l in head: d.text((M,y),l,font=hf,fill=WHITE); y+=th(hf)+14
    if a.accent: d.rectangle([M,y+4,M+84,y+11],fill=GREEN); y+=46
    else: y+=14
    if a.sub:
        subs=a.sub.split("|"); sf=fit(d,subs,False,38,24,cw)
        for l in subs: d.text((M,y),l,font=sf,fill=MUT); y+=th(sf)+12
    if a.footer:
        ff=font(True,30); d.text((M,S-M-th(ff)),a.footer,font=ff,fill=WHITE)
    img.save(a.out); print("wrote", a.out)

if __name__=="__main__":
    main()
