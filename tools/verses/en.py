# 앱 안 글(무료인 이유 등)에 쓰는 장절의 KJV 본문. 두 원본(aruljohn, thiago)이 같을 때만 쓴다.
# 사용: python3 tools/verses/en.py > src/lib/versesEn.ts
import re, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS
B = '/tmp/bible'
import unicodedata
def norm(s): return re.sub(r'\s+', ' ', re.sub(r'[\{\}\[\]]', '', unicodedata.normalize('NFC', s or ''))).strip()
names = {}
for i, b in enumerate(BOOKS): names[b[0]] = i; names[b[1]] = i
en = [{}, {}]
for i, b in enumerate(BOOKS):
    d = json.load(open(f'{B}/aruljohn/{b[2]}.json', encoding='utf-8-sig'))
    for c in d['chapters']:
        for v in c['verses']: en[0][(i, int(c['chapter']), int(v['verse']))] = v['text']
t = json.load(open(f'{B}/thiago/json/en_kjv.json', encoding='utf-8-sig'))
for i, bk in enumerate(t):
    for ci, ch in enumerate(bk['chapters']):
        for vi, v in enumerate(ch): en[1][(i, ci + 1, vi + 1)] = v
src = open('src/ui/Rest.tsx').read()
refs = sorted(set(re.findall(r'r="([가-힣0-9]+ \d+:\d+(?:-\d+)?)"', src)))
out, bad = {}, []
for r in refs:
    m = re.match(r'(.+?) (\d+):(\d+)(?:-(\d+))?$', r)
    i, c, v1, v2 = names[m[1]], int(m[2]), int(m[3]), int(m[4] or m[3])
    parts = []
    for v in range(v1, v2 + 1):
        a, b2 = norm(en[0].get((i, c, v))), norm(en[1].get((i, c, v)))
        if not a or a != b2: bad.append((r, v, a, b2))
        parts.append(a)
    out[r] = [' '.join(parts), f'{BOOKS[i][3]} {c}:{v1}' + (f'-{v2}' if v2 != v1 else '')]
# 롬 10:18은 앞부분 인용("그 소리가…")만 쓰므로 KJV도 그 부분만
out['로마서 10:18'][0] = 'Their sound went into all the earth, and their words unto the ends of the world.'
print('// 만들어진 파일: tools/verses/en.py. KJV(두 원본 대조)\nexport const EN: Record<string, [string, string]> = ' + json.dumps(out, ensure_ascii=False, indent=0))
print(f'// {len(out)} bad {bad}', file=sys.stderr)
