"""Open Hymnal ABC(4성부, [V:] 줄 단위) → 성부별 음표 목록.
음표: (시작 박, 길이 박, MIDI 번호). 박 단위 = 4분음표(L 기준 환산).
지원: 조표, 임시표(마디 안 유지), 옥타브 , ', 길이(2, /, //, 3/2, 3), 붙임줄 -, 쉼표 z, 점 >/<(간단), 장식 !..! 무시,
!sintro!/!eintro! 전주 구간 표시, 반복 |: :| (한 번 되풀이)."""
import re, sys
from fractions import Fraction as F

KEYS = {'C':0,'G':1,'D':2,'A':3,'E':4,'B':5,'F#':6,'C#':7,'F':-1,'Bb':-2,'Eb':-3,'Ab':-4,'Db':-5,'Gb':-6,'Cb':-7,
        'Am':0,'Em':1,'Bm':2,'F#m':3,'C#m':4,'G#m':5,'Dm':-1,'Gm':-2,'Cm':-3,'Fm':-4,'Bbm':-5,'Ebm':-6}
SHARPS='FCGDAEB'; FLATS='BEADGCF'
BASE={'C':60,'D':62,'E':64,'F':65,'G':67,'A':69,'B':71}

def keysig(k):
    k=k.strip().split()[0] if k.strip() else 'C'
    k=re.sub(r'maj(or)?$','',k,flags=re.I)
    k=re.sub(r'min(or)?$','m',k,flags=re.I)
    n=KEYS.get(k)
    if n is None: raise ValueError('key '+k)
    acc={}
    if n>0:
        for c in SHARPS[:n]: acc[c]=1
    else:
        for c in FLATS[:-n]: acc[c]=-1
    return acc, k

tok=re.compile(r"""(?P<deco>![^!]*!|"[^"]*"|\+[^+]*\+)|(?P<inl>\[[A-Za-z]:[^\]]*\])|(?P<bar>:\|\]?|\|:|\|\]|\|\||\[\|\]?|\|[12]?|:)|
 (?P<note>(?P<acc>\^\^|\^|__|_|=)?(?P<p>[A-Ga-gzxZ])(?P<oct>[,']*)(?P<len>\d*/*\d*))(?P<tie>-?)|
 (?P<chord>\[(?:[\^_=]*[A-Ga-g][,']*\d*/*\d*)+\](?P<clen>\d*/*\d*))(?P<ctie>-?)|(?P<brk>[<>]+)|(?P<other>.)""",re.X)

def flen(s,L):
    if not s: return L
    m=re.fullmatch(r'(\d*)(/*)(\d*)',s)
    num=int(m.group(1)) if m.group(1) else 1
    sl=len(m.group(2))
    if sl==0: return L*num
    den=int(m.group(3)) if m.group(3) else 2**sl
    return L*F(num,den)

def parse(text):
    head={}; L=F(1,8); meter='4/4'; key=None; tempo=None
    voices={}; order=[]; cur=None; title=''
    lines=text.splitlines()
    body=False
    for raw in lines:
        line=raw.split('%')[0].rstrip() if not raw.startswith('%%') else ''
        if not line: continue
        m=re.match(r'^([A-Za-z]):\s*(.*)$',line)
        if m and not line.startswith('['):
            f,v=m.groups()
            if f=='T' and not title: title=v.strip()
            elif f=='L': n,d=v.strip().split('/'); L=F(int(n),int(d))
            elif f=='M': meter=v.strip()
            elif f=='Q': tempo=v.strip()
            elif f=='K': key=v; body=True
            elif f=='V':
                vid=v.split()[0]
                if vid not in voices: voices[vid]=[]; order.append(vid)
                cur=vid
            continue
        if not body: continue
        voices.setdefault(cur or '1',[]); 
        if (cur or '1') not in order: order.append(cur or '1')
        voices[cur or '1'].append(line)
    acc0,kname=keysig(key or 'C')
    # Q in line?
    out={}; intro=None; tmp=None
    for vid in order:
        t=F(0); notes=[]; meas={}; pend={}  # tie pending: midi -> index
        body=' '.join(voices[vid])
        # 인라인 [V: x] 로 다른 성부로 넘어가는 경우 처리
        segs=re.split(r'\[V:\s*([^\]\s]+)[^\]]*\]',body)
        out.setdefault(vid,[])
    # 다시: 모든 줄을 합쳐서 [V:] 기준으로 성부 분배
    streams={}
    allbody=[]
    for vid in order:
        for ln in voices[vid]: allbody.append((vid,ln))
    cur=None
    for vid,ln in allbody:
        cur=cur or vid
        parts=re.split(r'(\[V:\s*[^\]\s]+[^\]]*\])',ln)
        for p in parts:
            mm=re.match(r'\[V:\s*([^\]\s]+)',p)
            if mm: cur=mm.group(1); continue
            if not p.strip(): continue
            streams.setdefault(cur,[]).append(p)
    res={}; marks={}
    hdr=[v for v in order if v in streams]+[v for v in streams if v not in order]
    for vid,segs in ((v,streams[v]) for v in hdr):
        s=' '.join(segs)
        t=F(0); notes=[]; meas={}; ties={}; brk=None; fer=False; ferms=[]
        rep_start=0; rep_start_t=F(0); 
        seq=[]  # (t,dur,midi)
        m_all=list(tok.finditer(s))
        i=0; repeat_from=None; done_rep=set()
        pos=0
        while pos<len(m_all):
            m=m_all[pos]; pos+=1
            g=m.lastgroup
            if m.group('deco'):
                d=m.group('deco')
                if d=='!sintro!': marks.setdefault(vid,{})['si']=t
                if d=='!eintro!': marks.setdefault(vid,{})['ei']=t
                if d in ('!fermata!','!ferm!','!invertedfermata!','!H!'): fer=True
                continue
            if m.group('inl'):
                q=re.match(r'\[Q:\s*(?:\d+/\d+=)?(\d+)',m.group('inl'))
                if q and tmp is None: tmp=int(q.group(1))
                k=re.match(r'\[K:\s*([^\]]*)',m.group('inl'))
                if k: acc0,_=keysig(k.group(1))
                continue
            if m.group('bar') is not None:
                b=m.group('bar'); meas={}
                if b=='|:' : repeat_from=pos; rep_t=t
                elif b.startswith(':|') and pos not in done_rep:
                    done_rep.add(pos); pos=repeat_from if repeat_from is not None else 0
                continue
            if m.group('brk'):
                brk=m.group('brk'); continue
            if m.group('note'):
                p=m.group('p'); d=flen(m.group('len'),L)*4
                if brk and seq:
                    # 앞 음표와 점음 나누기
                    pt,pd,pm=seq[-1]; tot=pd+d
                    a=F(3,4)*tot if brk=='>' else F(1,4)*tot
                    seq[-1]=(pt,a,pm); t=pt+a; d=tot-a; brk=None
                if p in 'zxZ': t+=d; continue
                up=p.upper(); midi=BASE[up]+(12 if p.islower() else 0)
                o=m.group('oct'); midi+=12*o.count("'")-12*o.count(',')
                a=m.group('acc')
                key_=(up,midi//12)
                if a: meas[key_]={'^':1,'^^':2,'_':-1,'__':-2,'=':0}[a]
                midi+=meas.get(key_,acc0.get(up,0))
                if midi in ties and ties[midi][0]+ties[midi][1]==t:
                    st,du,_=ties.pop(midi); idx=[j for j,x in enumerate(seq) if x[0]==st and x[2]==midi][-1]
                    seq[idx]=(st,du+d,midi)
                    if m.group('tie'): ties[midi]=(st,du+d,midi)
                else:
                    seq.append((t,d,midi))
                    if m.group('tie'): ties[midi]=(t,d,midi)
                if fer: ferms.append((t,d)); fer=False
                t+=d; continue
            if m.group('chord'):
                c=m.group('chord'); inner=re.findall(r"([\^_=]*)([A-Ga-g])([,']*)(\d*/*\d*)",c[1:c.rindex(']')])
                d=None
                for a,p,o,ln in inner:
                    up=p.upper(); midi=BASE[up]+(12 if p.islower() else 0)+12*o.count("'")-12*o.count(',')
                    key_=(up,midi//12)
                    if a: meas[key_]={'^':1,'^^':2,'_':-1,'__':-2,'=':0}[a]
                    midi+=meas.get(key_,acc0.get(up,0))
                    dd=flen(m.group('clen') or ln,L)*4
                    d=dd if d is None else d
                    seq.append((t,dd,midi))
                t+=d; continue
        res[vid]=seq; marks.setdefault(vid,{})['ferm']=ferms
    m0=re.match(r'(\d+)/(\d+)',meter); 
    meter=(int(m0.group(1)),int(m0.group(2))) if m0 else (4,4)
    mk=next(iter(marks.values()),{})
    return {'ferm':{v:m.get('ferm',[]) for v,m in marks.items()},'title':title,'key':kname,'meter':meter,'tempo':tmp or 90,'voices':res,'intro':(mk.get('si'),mk.get('ei'))}

if __name__=='__main__':
    d=parse(open(sys.argv[1],encoding='latin1').read())
    for v,s in d['voices'].items(): print(v,len(s),sum(x[1] for x in s), max(x[0]+x[1] for x in s))
    print(d['key'],d['meter'],d['tempo'],d['intro'])
