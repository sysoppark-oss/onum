"""public/icon-512.png(온음 아이콘)로 안드로이드 앱 아이콘·시작 화면을 만든다.
시험판(src/debug)에는 아래쪽에 청동색 「시험」 띠를 얹은 아이콘을 따로 만든다.
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

# 시험판 아이콘: 보이는 원 안 아래쪽에 청동색 「시험」 띠
from PIL import ImageFont
import glob as _g
FONT = (_g.glob('/tmp/pf/package/dist/public/static/Pretendard-ExtraBold.otf') + _g.glob('/usr/share/fonts/**/*Bold*.ttf', recursive=True))[0]
def badge(img, vis, off):
    # img: RGBA, 보이는 영역 vis(정사각형 한 변), off: 보이는 영역의 왼쪽 위
    d = ImageDraw.Draw(img)
    w, h = int(vis * 0.54), int(vis * 0.18)
    x0 = off + (vis - w) // 2; y0 = off + int(vis * 0.71)
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=h // 2, fill=(226, 176, 106, 255))
    f = ImageFont.truetype(FONT, int(h * 0.66))
    l, t, r, b = d.textbbox((0, 0), '시험', font=f)
    d.text((x0 + (w - (r - l)) / 2 - l, y0 + (h - (b - t)) / 2 - t), '시험', font=f, fill=(16, 18, 19, 255))
D = 'android/app/src/debug/res'
for d_, k in dens.items():
    os.makedirs(f'{D}/mipmap-{d_}', exist_ok=True)
    full = int(108 * k); vis = int(72 * k)
    lay = Image.open(f'{R}/mipmap-{d_}/ic_launcher_foreground.png').convert('RGBA')
    badge(lay, vis, (full - vis) // 2)
    lay.save(f'{D}/mipmap-{d_}/ic_launcher_foreground.png')
    for name in ('ic_launcher', 'ic_launcher_round'):
        im = Image.open(f'{R}/mipmap-{d_}/{name}.png').convert('RGBA')
        s_ = im.width
        badge(im, s_, 0)
        im.save(f'{D}/mipmap-{d_}/{name}.png')
print('ok')
