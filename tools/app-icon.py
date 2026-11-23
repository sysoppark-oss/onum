"""public/icon-512.png(온음 아이콘)로 안드로이드 앱 아이콘·시작 화면을 만든다.
사용: python3 tools/app-icon.py"""
from PIL import Image, ImageDraw
import glob, os
R = 'android/app/src/main/res'
BG = (16, 18, 19)
src = Image.open('public/icon-512.png').convert('RGB')
# 바탕을 투명하게 뺀 모양(앞 그림)
fg = src.convert('RGBA')
px = fg.load()
for y in range(fg.height):
    for x in range(fg.width):
        r, g, b, _ = px[x, y]
        d = max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2]))
        a = min(255, d * 255 // 120)
        px[x, y] = (143, 209, 168, a) if a else (0, 0, 0, 0)
dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in dens.items():
    # 적응형 아이콘: 108dp 중 가운데 72dp가 보인다 → 512 그림을 72dp에 맞춘다
    full = int(108 * k); vis = int(72 * k)
    lay = Image.new('RGBA', (full, full), (0, 0, 0, 0))
    f = fg.resize((vis, vis), Image.LANCZOS)
    lay.alpha_composite(f, ((full - vis) // 2, (full - vis) // 2))
    lay.save(f'{R}/mipmap-{d}/ic_launcher_foreground.png')
    # 옛 휴대폰용 아이콘(네모·둥근)
    s = int(48 * k)
    sq = src.resize((s, s), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (s * 4, s * 4), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, s * 4 - 1, s * 4 - 1], radius=s * 4 * 0.18, fill=255)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0)); out.paste(sq, (0, 0), m.resize((s, s), Image.LANCZOS)); out.save(f'{R}/mipmap-{d}/ic_launcher.png')
    m = Image.new('L', (s * 4, s * 4), 0); ImageDraw.Draw(m).ellipse([0, 0, s * 4 - 1, s * 4 - 1], fill=255)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0)); out.paste(sq, (0, 0), m.resize((s, s), Image.LANCZOS)); out.save(f'{R}/mipmap-{d}/ic_launcher_round.png')
# 시작 화면: 어두운 바탕 가운데 아이콘 모양
for p in glob.glob(f'{R}/drawable*/splash.png'):
    w, h = Image.open(p).size
    sp = Image.new('RGB', (w, h), BG)
    n = int(min(w, h) * 0.42)
    sp.paste(fg.resize((n, n), Image.LANCZOS), ((w - n) // 2, (h - n) // 2), fg.resize((n, n), Image.LANCZOS))
    sp.save(p)
open(f'{R}/values/ic_launcher_background.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#101213</color>\n</resources>\n')
print('ok')
