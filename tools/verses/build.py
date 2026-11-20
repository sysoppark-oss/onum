import json, re, os, sys, unicodedata
sys.path.insert(0,'/tmp/v365')
from books import BOOKS
from pick import PICK
B='/tmp/bible'
ab={b[1]:i for i,b in enumerate(BOOKS)}
def norm(s):
    s=unicodedata.normalize('NFC',s).replace('　',' ')
    s=re.sub(r'[\{\}\[\]]','',s)
    return re.sub(r'\s+',' ',s).strip()
# 개역한글 네 벌
ko=[{} ,{},{},{}]
for i,b in enumerate(BOOKS):
    d=json.load(open(f'{B}/yuhwan_Bible-krv/{b[0]}.json',encoding='utf-8-sig'))
    for c in d['chapters']:
        for v in c['verses']: ko[0][(i,int(c['chapter']),int(v['verse']))]=v['text']
    d=json.load(open(f'{B}/bluesaurel_Korean-Bible-1961-KRV/data/{b[2]}.json',encoding='utf-8-sig'))
    for c in d['chapters']:
        for v in c['verses']: ko[1][(i,int(c['chapter']),int(v['verse']))]=v['text']
for l in open(f'{B}/scj-peter_HolyBibleKRV/개역한글_KRV_국문.sql',encoding='utf-8'):
    m=re.match(r"INSERT INTO \w+ VALUES\('(\d+)', '(\d+)', '(\d+)', '(.*)'\);",l.strip())
    if m: ko[2][(int(m[1])-1,int(m[2]),int(m[3]))]=m[4].replace("''","'")
t=json.load(open(f'{B}/thiago/json/ko_krv.json',encoding='utf-8-sig'))
for i,bk in enumerate(t):
    for ci,ch in enumerate(bk['chapters']):
        for vi,v in enumerate(ch): ko[3][(i,ci+1,vi+1)]=v
en=[{},{}]
for i,b in enumerate(BOOKS):
    d=json.load(open(f'{B}/aruljohn/{b[2]}.json',encoding='utf-8-sig'))
    for c in d['chapters']:
        for v in c['verses']: en[0][(i,int(c['chapter']),int(v['verse']))]=v['text']
t=json.load(open(f'{B}/thiago/json/en_kjv.json',encoding='utf-8-sig'))
for i,bk in enumerate(t):
    for ci,ch in enumerate(bk['chapters']):
        for vi,v in enumerate(ch): en[1][(i,ci+1,vi+1)]=v
out=[]; issues=[]; seen={}
for g,gname,cats in PICK:
    for cid,cname,refs in cats:
        for r in refs.split():
            m=re.match(r'([가-힣]+)(\d+):(\d+)$',r); key=(ab[m[1]],int(m[2]),int(m[3]))
            if key in seen: issues.append(f'겹침 {r} ({seen[key]}, {cname})')
            seen[key]=cname
            ks=[norm(k.get(key,'')) for k in ko]; es=[norm(e.get(key,'')) for e in en]
            kv=set(x for x in ks if x); evs=set(x for x in es if x)
            if len(kv)!=1 or '' in ks: issues.append(f'개역한글 불일치 {r}: '+' | '.join(ks))
            if len(evs)!=1 or '' in es: issues.append(f'KJV 불일치 {r}: '+' | '.join(es))
            b=BOOKS[key[0]]
            out.append(dict(g=g,cat=cid,catName=cname,ref=f'{b[0]} {key[1]}:{key[2]}',text=ks[0],en=es[0],enRef=f'{b[3]} {key[1]}:{key[2]}'))
print(len(out),'구절'); print('\n'.join(issues) or '불일치 없음')
json.dump(out,open('/tmp/v365/out.json','w'),ensure_ascii=False,indent=1)
