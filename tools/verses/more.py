# 러시아어 시노달(1876, 저작권 없음)·힌디어 IRV(2019, CC BY-SA 4.0) 본문 표를 만든다.
# 원문: thiagobodruk/bible json/ru_synod.json, json/hi_irvhin.json  (KJV와 장 길이를 대조한다)
# 사용: python3 tools/verses/more.py ru > src/lib/versesRu.ts ; python3 tools/verses/more.py hi > src/lib/versesHi.ts
import re, sys, os, json, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS
L = sys.argv[1]
SRC = {'ru': 'ru_synod', 'hi': 'hi_irvhin'}[L]
os.makedirs('/tmp/bib', exist_ok=True)
def get(n):
    p = f'/tmp/bib/{n}.json'
    if not os.path.exists(p):
        subprocess.run(['curl', '-sS', '-o', p, f'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/{n}.json'], check=True)
    return json.load(open(p, encoding='utf-8-sig'))
kjv = get('en_kjv')
src = get(SRC)
RU = "Бытие|Исход|Левит|Числа|Второзаконие|Иисус Навин|Судьи|Руфь|1 Царств|2 Царств|3 Царств|4 Царств|1 Паралипоменон|2 Паралипоменон|Ездра|Неемия|Есфирь|Иов|Псалом|Притчи|Екклесиаст|Песнь песней|Исаия|Иеремия|Плач Иеремии|Иезекииль|Даниил|Осия|Иоиль|Амос|Авдий|Иона|Михей|Наум|Аввакум|Софония|Аггей|Захария|Малахия|Матфея|Марка|Луки|Иоанна|Деяния|Римлянам|1 Коринфянам|2 Коринфянам|Галатам|Ефесянам|Филиппийцам|Колоссянам|1 Фессалоникийцам|2 Фессалоникийцам|1 Тимофею|2 Тимофею|Титу|Филимону|Евреям|Иакова|1 Петра|2 Петра|1 Иоанна|2 Иоанна|3 Иоанна|Иуды|Откровение".split('|')
assert len(RU) == 66
if L == 'ru':
    # 시노달에는 에스더·다니엘이 빠져 있다(그 두 권은 KJV로)
    missing = {16, 26}
    books = {}
    j = 0
    for i in range(66):
        if i in missing: continue
        books[i] = src[j]; j += 1
    NAME = RU
else:
    books = {i: src[i] for i in range(66)}
    NAME = [b['name'] for b in src]
names = {}
for i, b in enumerate(BOOKS): names[b[0]] = i; names[b[1]] = i
names['시편'] = names['시']

def ps_map(c, v):
    """KJV 시편 장절 → 시노달 장절(70인역 장 번호, 표제를 절로 셈)"""
    if c <= 8: sc = c
    elif c in (9, 10): sc = 9
    elif c <= 113: sc = c - 1
    elif c in (114, 115): sc = 113
    elif c == 116: sc = 114 if v <= 9 else 115
    elif c <= 146: sc = c - 1
    elif c == 147: sc = 146 if v <= 11 else 147
    else: sc = c
    return sc, None

def verse(i, c, v):
    k = kjv[i]['chapters']
    if i not in books: return None, None
    ch = books[i]['chapters']
    if L == 'ru' and i == 18:
        sc, _ = ps_map(c, v)
        # 표제를 절로 세는 만큼 밀린다: 장 길이 차이로 잰다(합쳐진 장은 쓰지 않는다)
        if c in (9, 10, 114, 115, 116, 147): return None, None
        if sc - 1 >= len(ch): return None, None
        d = len(ch[sc - 1]) - len(k[c - 1])
        if d not in (0, 1, 2): return None, None
        sv = v + d
        return (ch[sc - 1][sv - 1] if sv - 1 < len(ch[sc - 1]) else None), (sc, sv)
    if c - 1 >= len(ch) or len(ch[c - 1]) != len(k[c - 1]): return None, None
    return ch[c - 1][v - 1], (c, v)

def clean(t):
    t = re.sub(r'\s*\([^()]*\d+:\d+[^()]*\)', '', t)  # IRV의 (사 40:11) 같은 참조
    # IRV 원본에 섞여 든 풀이 글: "구절 구절: 풀이। , 나머지" → "구절, 나머지"
    for _ in range(4):
        t2 = re.sub(r'(\S[^:]{2,}?) \1: [^:]*?[।.]\s*(?=[,।;!?"]|\s|$)', r'\1', t)
        if t2 == t: break
        t = t2
    t = re.sub(r'\s+([,।;!?])', r'\1', t)
    t = re.sub(r'([,।])\1+', r'\1', t)
    t = re.sub(r'[\[\]{}]', '', t)
    return re.sub(r'\s+', ' ', t).strip()

text = ''.join(open(f).read() for f in ['src/lib/verses365.ts', 'src/lib/verses.ts', 'src/lib/version.ts', 'src/ui/Rest.tsx'])
refs = sorted(set(re.findall(r'["\']([가-힣0-9]+ \d+:\d+(?:-\d+)?)["\']', text)))
out, miss = {}, []
for r in refs:
    m = re.match(r'(.+?) (\d+):(\d+)(?:-(\d+))?$', r)
    if m[1] not in names: miss.append(r); continue
    i, c, v1, v2 = names[m[1]], int(m[2]), int(m[3]), int(m[4] or m[3])
    parts, pos = [], []
    for v in range(v1, v2 + 1):
        t, p = verse(i, c, v)
        if not t: break
        parts.append(clean(t)); pos.append(p)
    if len(parts) != v2 - v1 + 1: miss.append(r); continue
    (sc, sv1), (_, sv2) = pos[0], pos[-1]
    out[r] = [' '.join(parts), f'{NAME[i]} {sc}:{sv1}' + (f'-{sv2}' if sv2 != sv1 else '')]
VER = {'ru': 'Синодальный перевод (1876)', 'hi': 'IRV हिंदी (2019, CC BY-SA 4.0, Bridge Connectivity Solutions)'}[L]
print(f'// 만들어진 파일: tools/verses/more.py {L}. 손으로 고치지 않는다.\n// {VER}\nexport const {L.upper()}: Record<string, [string, string]> = ' + json.dumps(out, ensure_ascii=False, indent=0))
print(f'// refs {len(refs)} ok {len(out)} miss {len(miss)} {miss[:40]}', file=sys.stderr)
