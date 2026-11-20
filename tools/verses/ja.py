# 일본어 口語訳(1954/1955, 저작권 2005년 말 만료) 본문으로 장절 → 본문 표를 만든다.
# 원문: nehemiaharchives/bbl resources/bbltexts/jc/jc.<책>.<장>.txt ("절 본문" 줄)
# 사용: python3 tools/verses/ja.py > src/lib/versesJa.ts
import re, sys, os, json, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS
JA = "創世記 出エジプト記 レビ記 民数記 申命記 ヨシュア記 士師記 ルツ記 サムエル記上 サムエル記下 列王紀上 列王紀下 歴代志上 歴代志下 エズラ記 ネヘミヤ記 エステル記 ヨブ記 詩篇 箴言 伝道の書 雅歌 イザヤ書 エレミヤ書 哀歌 エゼキエル書 ダニエル書 ホセア書 ヨエル書 アモス書 オバデヤ書 ヨナ書 ミカ書 ナホム書 ハバクク書 ゼパニヤ書 ハガイ書 ゼカリヤ書 マラキ書 マタイによる福音書 マルコによる福音書 ルカによる福音書 ヨハネによる福音書 使徒行伝 ローマ人への手紙 コリント人への第一の手紙 コリント人への第二の手紙 ガラテヤ人への手紙 エペソ人への手紙 ピリピ人への手紙 コロサイ人への手紙 テサロニケ人への第一の手紙 テサロニケ人への第二の手紙 テモテへの第一の手紙 テモテへの第二の手紙 テトスへの手紙 ピレモンへの手紙 ヘブル人への手紙 ヤコブの手紙 ペテロの第一の手紙 ペテロの第二の手紙 ヨハネの第一の手紙 ヨハネの第二の手紙 ヨハネの第三の手紙 ユダの手紙 ヨハネの黙示録".split()
assert len(JA) == 66
names = {}
for i, b in enumerate(BOOKS):
    names[b[0]] = i + 1; names[b[1]] = i + 1
names['시편'] = names['시']
src = ''.join(open(f).read() for f in ['src/lib/verses365.ts', 'src/lib/verses.ts', 'src/lib/version.ts', 'src/ui/Rest.tsx'])
refs = sorted(set(re.findall(r'["\']([가-힣0-9]+ \d+:\d+(?:-\d+)?)["\']', src)))
cache = {}
def chap(b, c):
    k = (b, c)
    if k not in cache:
        p = f'/tmp/jc/{b}.{c}.txt'
        if not os.path.exists(p):
            subprocess.run(['curl', '-sS', '-o', p, f'https://raw.githubusercontent.com/nehemiaharchives/bbl/master/resources/bbltexts/jc/jc.{b}.{c}.txt'], check=True)
        d = {}
        for line in open(p, encoding='utf-8'):
            m = re.match(r'(\d+)\s+(.*)', line.strip())
            if m: d[int(m.group(1))] = m.group(2).strip()
        cache[k] = d
    return cache[k]
out = {}
miss = []
for r in refs:
    m = re.match(r'(.+?) (\d+):(\d+)(?:-(\d+))?$', r)
    book, c, v1, v2 = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4) or m.group(3))
    if book not in names: miss.append(r); continue
    b = names[book]
    d = chap(b, c)
    parts = [d.get(v) for v in range(v1, v2 + 1)]
    if not all(parts): miss.append(r); continue
    txt = ''.join(parts)
    out[r] = [txt, f'{JA[b-1]} {c}:{v1}' + (f'-{v2}' if v2 != v1 else '')]
# 롬 10:18은 인용 부분(「…」)만
m = re.search(r'「(.+?)」', out['로마서 10:18'][0]); out['로마서 10:18'][0] = m.group(1) + '。'
print(f'// 만들어진 파일: tools/verses/ja.py로 다시 만든다. 손으로 고치지 않는다.\n// 일본어 口語訳「聖書」(1954/1955년판, 일본 저작권 2005년 말 만료)\nexport const JA: Record<string, [string, string]> = ' + json.dumps(out, ensure_ascii=False, indent=0))
print(f'// refs {len(refs)} ok {len(out)} miss {miss}', file=sys.stderr)
