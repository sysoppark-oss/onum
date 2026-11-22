"""공개 찬송 곡조(Open Hymnal ABC) → src/lib/hymnData.json
사용: python3 -I tools/hymns/build.py <openhymnal 폴더> """
import sys, json, os, re, glob
sys.path.insert(0, os.path.dirname(__file__))
from habc import parse
from fractions import Fraction as F
root = sys.argv[1]
LIST = json.load(open(os.path.join(os.path.dirname(__file__), 'list.json')))
TPB = 12  # 한 박(4분음표)을 12칸으로
out = []
for h in LIST:
    f = glob.glob(os.path.join(root, '**', h['file'] + '.abc'), recursive=True)[0]
    t = open(f, encoding='latin1').read()
    assert 'copyright: public domain' in t.lower(), f
    d = parse(t)
    vids = list(d['voices'].keys())
    total = max(x[0] + x[1] for x in d['voices'][vids[0]])
    vs = []
    for v in vids:
        flat = []
        for st, du, m in sorted(d['voices'][v]):
            a, b = st * TPB, du * TPB
            assert a.denominator == 1 and b.denominator == 1, (h['file'], st, du)
            flat += [int(a), int(b), m]
        vs.append(flat)
    # 늘임표: 멜로디 성부 기준
    fer = sorted({int(st * TPB) for st, du in d['ferm'].get(vids[0], [])})
    en = d['title']
    out.append({'id': h['id'], 'ko': h['ko'], 'cat': h['cat'], 'en': en, 'tune': h['tune'], 'by': h['by'],
                'key': d['key'], 'meter': list(d['meter']), 'bpm': d['tempo'], 'len': int(total * TPB), 'fer': fer, 'v': vs})
json.dump({'tpb': TPB, 'hymns': out}, open('src/lib/hymnData.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), os.path.getsize('src/lib/hymnData.json'))
