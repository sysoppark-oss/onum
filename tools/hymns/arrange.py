"""찬송 편곡 미리듣기: hymnData.json의 4부 악보 → 악기별 연주(사람 손처럼) → 오디오.
앱에 넣기 전에 소리를 고르려고 만든 시험 도구. 같은 규칙을 나중에 앱(TS)으로 옮긴다.
사용: python3 -I arrange.py <곡 id> <짜임> <out.wav>
짜임: piano | organ | guitar | worship | folk"""
import json, sys, random, math, wave
import numpy as np
import fluidsynth

SF = '/usr/share/sounds/sf3/MuseScore_General_Full.sf3'
D = json.load(open('/home/claude/onum/app/src/lib/hymnData.json'))
TPB = D['tpb']
random.seed(7)

# ── 화음 찾기: 박마다 울리는 음을 모아 가장 맞는 화음
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], 'dim': [0, 3, 6], '7': [0, 4, 7, 10]}
def chords(h):
    bar = TPB * 4 * h['meter'][0] // h['meter'][1]
    step = TPB  # 한 박마다
    out = []
    bass = h['v'][-1]
    for t0 in range(0, h['len'], step):
        w = [0.0] * 12; low = None
        for vi, vv in enumerate(h['v']):
            for i in range(0, len(vv), 3):
                s, e, m = vv[i], vv[i] + vv[i + 1], vv[i + 2]
                ov = min(e, t0 + step) - max(s, t0)
                if ov > 0:
                    w[m % 12] += ov * (1.3 if s <= t0 else 1.0)
                    if vi == len(h['v']) - 1 and (low is None or m < low[0]): low = (m, s <= t0)
        best = None
        for r in range(12):
            for q, iv in QUAL.items():
                pcs = {(r + x) % 12 for x in iv}
                sc = sum(w[p] for p in pcs) - 0.6 * sum(w[p] for p in range(12) if p not in pcs)
                if low and low[0] % 12 == r: sc += 0.35 * step
                if q == '7': sc -= 0.25 * step
                if q == 'dim': sc -= 0.3 * step
                if best is None or sc > best[0]: best = (sc, r, q)
        out.append([t0, best[1], best[2], best[0]])
    # 지나가는 음 때문에 바뀌는 것 줄이기: 앞 화음으로도 거의 맞으면 그대로
    for k in range(1, len(out)):
        t0, r, q, sc = out[k]; pr, pq = out[k - 1][1], out[k - 1][2]
        if (r, q) != (pr, pq) and (t0 % bar) != 0:
            pcs = {(pr + x) % 12 for x in QUAL[pq]}
            # 다시 점수
            out[k][1], out[k][2] = (pr, pq) if True and keepable(h, t0, pcs) else (r, q)
    return [(t, r, q) for t, r, q, _ in out]

def keepable(h, t0, pcs):
    w_in = w_all = 0
    for vv in h['v']:
        for i in range(0, len(vv), 3):
            s, e, m = vv[i], vv[i] + vv[i + 1], vv[i + 2]
            ov = min(e, t0 + TPB) - max(s, t0)
            if ov > 0:
                w_all += ov; w_in += ov if m % 12 in pcs else 0
    return w_all == 0 or w_in / w_all >= 0.8

# ── 시간: 절 끝 마디에서 조금씩 늦추기(사람처럼)
def timemap(h, bpm):
    bar = TPB * 4 * h['meter'][0] // h['meter'][1]
    spt = 60 / bpm / TPB
    L = h['len']; rs = max(0, L - bar)
    def sec(t):  # 한 절 안의 틱 → 초
        if t <= rs: return t * spt
        # rs~L 동안 속도가 1 → 0.78로 줄어듦(늦어짐)
        x = (t - rs) / (L - rs) if L > rs else 0
        # ∫ 1/(1-0.22x) dx
        k = 0.22
        return rs * spt + (L - rs) * spt * (-math.log(1 - k * x) / k)
    return sec, sec(L)

class Track:
    def __init__(self, ch, prog, vol=100, rev=60, pan=64):
        self.ch, self.prog, self.vol, self.rev, self.pan = ch, prog, vol, rev, pan; self.ev = []
    def note(self, t, d, m, v):
        v = max(1, min(127, int(v)))
        self.ev.append((t, 1, self.ch, m, v)); self.ev.append((t + max(0.05, d), 0, self.ch, m, 0))

def jit(x): return random.uniform(-x, x)

def render(tracks, length, out, sr=44100):
    fs = fluidsynth.Synth(samplerate=sr, gain=0.5)
    sid = fs.sfload(SF)
    fs.set_reverb(0.78, 0.35, 0.9, 0.55)
    fs.set_chorus(0, 0, 0, 0, 0)
    for tr in tracks:
        fs.program_select(tr.ch, sid, 0, tr.prog)
        fs.cc(tr.ch, 7, tr.vol); fs.cc(tr.ch, 91, tr.rev); fs.cc(tr.ch, 93, 0); fs.cc(tr.ch, 10, tr.pan)
    ev = sorted(e for tr in tracks for e in tr.ev)
    buf = []; now = 0.0
    for t, on, ch, m, v in ev:
        n = int((t - now) * sr)
        if n > 0: buf.append(fs.get_samples(n)); now += n / sr
        if on: fs.noteon(ch, m, v)
        else: fs.noteoff(ch, m)
    buf.append(fs.get_samples(int(sr * 3.5)))
    a = np.concatenate(buf).astype(np.float32)
    a *= 0.89 * 32767 / max(1, np.abs(a).max())
    w = wave.open(out, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(a.astype(np.int16).tobytes()); w.close()

def build(h, style, verses=2):
    bar = TPB * 4 * h['meter'][0] // h['meter'][1]
    beats = h['meter'][0] if h['meter'][1] == 4 else h['meter'][0] // 2 if h['meter'][1] == 8 else h['meter'][0] * 2
    ch = chords(h)
    chg = [ch[0]] + [c for k, c in enumerate(ch[1:], 1) if (c[1], c[2]) != (ch[k - 1][1], ch[k - 1][2])]
    sec, vlen = timemap(h, h['bpm'])
    gap = 60 / h['bpm']
    # 마디 단위 부분(전주=끝 네 마디) + 절
    segs = []
    fr = max(0, h['len'] - bar * 4); at = 0.0
    segs.append((fr, h['len'], at)); at += sec(h['len']) - sec(fr) + gap
    for _ in range(verses): segs.append((0, h['len'], at)); at += vlen + gap
    T = lambda t, s0, fr_: s0 + sec(t) - sec(fr_)
    tr = {}
    def get(name, *a, **k):
        if name not in tr: tr[name] = Track(len(tr), *a, **k)
        return tr[name]
    def chord_at(t):
        c = ch[0]
        for x in ch:
            if x[0] <= t: c = x
        return c
    def next_change(t):
        for x in chg:
            if x[0] > t: return x[0]
        return h['len']

    for fr_, to, s0 in segs:
        phrase = lambda t: 1 + 0.12 * math.sin(math.pi * ((t % (bar * 4)) / (bar * 4)))  # 네 마디마다 부풀었다 가라앉기
        nv = len(h['v'])
        # 피아노(사람 손 + 페달) / 오르간(이어서) — 4부 그대로
        if style in ('piano', 'worship', 'organ'):
            for vi, vv in enumerate(h['v']):
                for i in range(0, len(vv), 3):
                    s, e, m = vv[i], vv[i] + vv[i + 1], vv[i + 2]
                    if e <= fr_ or s >= to: continue
                    s2, e2 = max(s, fr_), min(e, to)
                    if style == 'organ':
                        o = get('organ', 19, 92, 70)
                        cut = 0.06 if any(vv[j] == e and vv[j + 2] == m for j in range(0, len(vv), 3)) else -0.01
                        o.note(T(s2, s0, fr_), T(e2, s0, fr_) - T(s2, s0, fr_) - cut, m, 70 if vi == 0 else 58)
                        if vi == nv - 1: get('pedal', 19, 60, 70).note(T(s2, s0, fr_), T(e2, s0, fr_) - T(s2, s0, fr_) - cut, m - 12, 50)
                        continue
                    p = get('piano', 0, 112 if style == 'piano' else 96, 55)
                    vel = (86 if vi == 0 else 66 if vi == nv - 1 else 52) * phrase(s2) + jit(5)
                    t1 = T(s2, s0, fr_) + (0 if vi == 0 else jit(0.008)) - (0.006 if vi == nv - 1 else 0)
                    # 페달: 화음이 바뀌기 전까지 소리 잇기
                    nc = min(next_change(s2), to)
                    end_t = max(e2, nc) if (m % 12) in {(chord_at(s2)[1] + x) % 12 for x in QUAL[chord_at(s2)[2]]} else e2
                    end_t = min(end_t, e2 + 2 * TPB)
                    p.note(t1, T(end_t, s0, fr_) - t1 + 0.04, m, vel)
            if style == 'worship':
                for k, (t, r, q) in enumerate(chg):
                    if t >= to or (next_change(t) <= fr_): continue
                    a, b = max(t, fr_), min(next_change(t), to)
                    pad = get('pad', 19, 52, 80)
                    for x in QUAL[q][:3]: pad.note(T(a, s0, fr_), T(b, s0, fr_) - T(a, s0, fr_) + 0.05, 55 + (r + x - 55) % 12, 50)
        # 기타(코드 리듬) / 베이스 / 멜로디
        if style in ('guitar', 'folk'):
            g = get('guitar', 25, 110, 45, 58)
            for t in range(fr_ - fr_ % TPB, to, TPB):
                if t < fr_: continue
                bi = (t % bar) // TPB
                _, r, q = chord_at(t)
                root = 40 + (r - 40) % 12
                iv = [0, 7, 12, 16 if q in ('', '7') else 15, 19]
                if q == '7': iv = [0, 7, 10, 16, 19]
                if q == 'dim': iv = [0, 6, 12, 15, 18]
                notes = [root + x for x in iv]
                st = T(t, s0, fr_); ln = T(min(t + TPB, to), s0, fr_) - st
                accent = 1.0 if bi == 0 else 0.85
                if bi == 0 or (beats == 4 and bi == 2):  # 베이스 한 음 뜯기
                    bn = root if bi == 0 else root + 7 - (12 if root + 7 > 52 else 0)
                    g.note(st + jit(0.005), ln * 1.6, bn, 92 + jit(5))
                    if beats == 3 or beats == 4: pass
                else:  # 아래로 긁기 + 반 박 위로
                    for k, m in enumerate(notes[1:]):
                        g.note(st + k * 0.011 + jit(0.003), ln * 0.95, m, 72 * accent + jit(6))
                    half = st + ln / 2
                    for k, m in enumerate(reversed(notes[2:])):
                        g.note(half + k * 0.009 + jit(0.003), ln * 0.45, m, 50 + jit(5))
        if style in ('worship', 'folk'):
            bs = get('bass', 32 if style == 'worship' else 33, 105, 30)
            for t in range(fr_ - fr_ % TPB, to, TPB):
                if t < fr_: continue
                bi = (t % bar) // TPB
                if bi == 0 or (beats == 4 and bi == 2):
                    _, r, q = chord_at(t)
                    m = 28 + (r - 28) % 12 + (7 if bi == 2 else 0)
                    if m > 43: m -= 12
                    nxt = t + (TPB * 2 if beats == 4 else bar)
                    bs.note(T(t, s0, fr_) - 0.004, T(min(nxt, to), s0, fr_) - T(t, s0, fr_) - 0.03, m, 92 * phrase(t) + jit(5))
        if style == 'folk':
            mel = get('melody', 0, 88, 60, 70)
            vv = h['v'][0]
            for i in range(0, len(vv), 3):
                s, e, m = vv[i], vv[i] + vv[i + 1], vv[i + 2]
                if e <= fr_ or s >= to: continue
                s2, e2 = max(s, fr_), min(e, to)
                mel.note(T(s2, s0, fr_), T(e2, s0, fr_) - T(s2, s0, fr_) + 0.08, m + 12, 70 * phrase(s2) + jit(4))
    return list(tr.values()), at

if __name__ == '__main__':
    hid, style, out = sys.argv[1:4]
    h = [x for x in D['hymns'] if x['id'] == hid][0]
    tracks, L = build(h, style)
    render(tracks, L, out)
    print(style, round(L, 1), 's', [(t.prog, len(t.ev) // 2) for t in tracks])
