# 번역할 글 모으기: tx("…")·rt("…") 원문과 마음 이름. 사용: python3 tools/i18n-keys.py > /tmp/keys.json
import re, glob, json
keys = set()
pat = re.compile(r'\b(?:tx|rt)\(\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')')
for f in glob.glob('src/**/*.ts*', recursive=True):
    s = open(f, encoding='utf-8').read()
    for m in pat.finditer(s):
        lit = m.group(1)
        if lit[0] == "'": lit = '"' + lit[1:-1].replace('\\\'', "'").replace('"', '\\"') + '"'
        k = json.loads(lit).strip()
        if re.search('[가-힣]', k): keys.add(k)
s = open('src/lib/verses365.ts', encoding='utf-8').read()
for m in re.finditer(r'name: "([^"]+)", g: "[^"]+", gName: "([^"]+)"', s): keys.update([m.group(1), m.group(2)])
print(json.dumps(sorted(keys), ensure_ascii=False, indent=0))
