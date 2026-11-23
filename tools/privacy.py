# src/lib/privacy.ts(앱 화면 글)로 public/privacy.html(웹 페이지)을 다시 만든다.
# 개인정보 처리방침을 고친 뒤: python3 tools/privacy.py
import html, re
src = open('src/lib/privacy.ts', encoding='utf-8').read()
date = re.search(r'EFFECTIVE = tx\("(.+?)"\)', src).group(1)
body = src[src.index('export const PRIVACY'):]
parts, cur = [], None
for m in re.finditer(r'^( {4}| {6})tx\("((?:[^"\\]|\\.)*)"\)', body, re.M):
    text = m.group(2).replace('\\"', '"')
    if len(m.group(1)) == 4: cur = (text, []); parts.append(cur)
    else: cur[1].append(text)
page = open('public/privacy.html', encoding='utf-8').read()
head = page[:page.index('<h1>')]
tail = page[page.index('</main>'):]
out = [f'<h1>온음 개인정보 처리방침</h1><p class="d">시행일 {html.escape(date)}</p>']
for h, ps in parts:
    out.append(f'<h2>{html.escape(h)}</h2>' + ''.join(f'<p>{html.escape(p)}</p>' for p in ps))
open('public/privacy.html', 'w', encoding='utf-8').write(head + '\n'.join(out) + '\n' + tail)
print(len(parts), 'sections')
