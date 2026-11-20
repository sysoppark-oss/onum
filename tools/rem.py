# flow.px.css → index.css : 3px 이상은 rem으로 (휴대폰 글자 크기를 따라가게). @media 줄은 그대로.
import re, sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text()
out = []
for line in src.splitlines():
    if '@media' in line:
        out.append(line); continue
    def f(m):
        v = float(m.group(1))
        if v < 3: return m.group(0)
        r = round(v / 16, 4)
        return f"{r:g}rem"
    out.append(re.sub(r'(?<![\w.#])(\d+(?:\.\d+)?)px', f, line))
pathlib.Path(sys.argv[2]).write_text('/* 만들어진 파일: src/flow.px.css를 고치고 `python3 tools/rem.py src/flow.px.css src/index.css` */\n' + '\n'.join(out) + '\n')
