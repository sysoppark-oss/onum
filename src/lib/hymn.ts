// 찬송가 반주: 저작권이 끝난 4부 곡조를 앱 안에서 피아노로 직접 연주한다.
// 악보는 hymnData.json(tools/hymns/build.py로 만듦), 피아노 소리는 Salamander Grand Piano(Alexander Holm, CC BY 3.0).
// 조·빠르기는 연주 중에도 바로 바뀐다. 화면이 꺼지면 예약이 늦어지므로 연주하는 동안 화면을 켜 둔다.

export interface Hymn {
  id: string; ko: string; cat: string; en: string; tune: string; by: string
  key: string; meter: [number, number]; bpm: number; len: number; fer: number[]; v: number[][]
}
interface Data { tpb: number; hymns: Hymn[] }

let data: Promise<Data> | null = null
export const loadHymns = () => (data ??= import('./hymnData.json').then((m) => m.default as unknown as Data))

export const HYMN_CATS = ['찬양', '교회', '성탄', '고난·부활', '은혜·신뢰'] as const

/** 조 이름: 반음만큼 옮긴 조 */
const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
export function keyName(key: string, semi = 0) {
  const m = /^([A-G])([#b]?)(m?)$/.exec(key)
  if (!m) return key
  const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + semi + 120) % 12
  return NAMES[pc] + (m[3] ? 'm' : '')
}

export interface HymnSet { semi: number; rate: number; verses: number; intro: boolean }
export const HYMN_DEFAULT: HymnSet = { semi: 0, rate: 1, verses: 4, intro: true }

// ── 피아노: 단3도마다 녹음한 소리를 가까운 음으로 높낮이만 옮겨 쓴다
const SAMPLES = ['A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6']
const LOW = 33 // A1
let ctx: AudioContext | null = null
let bufs: Promise<AudioBuffer[]> | null = null
function audio() {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'playback' })
  return ctx
}
export function loadPiano() {
  const c = audio()
  return (bufs ??= Promise.all(SAMPLES.map((n) =>
    fetch(`${import.meta.env.BASE_URL}piano/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)),
  )).catch((e) => { bufs = null; throw e }))
}

interface Ev { t: number; d: number; m: number; v: number } // 틱 단위
export interface HymnPos { part: 'intro' | 'verse' | 'end'; verse: number; frac: number }

/** 반주 계획: 전주(끝 네 마디) → 절마다 한 번씩, 절 사이 한 박 쉼. 늘임표는 그 음 길이의 반만큼 더 끈다. */
function plan(h: Hymn, tpb: number, s: HymnSet) {
  const bar = tpb * 4 * h.meter[0] / h.meter[1]
  const hold: [number, number][] = [] // (늘임표 음이 끝나는 틱, 더 끄는 틱)
  const mel = h.v[0]
  for (const f of h.fer) for (let i = 0; i < mel.length; i += 3) if (mel[i] === f) hold.push([mel[i] + mel[i + 1], Math.round(mel[i + 1] / 2)])
  const warp = (t: number) => { let x = t; for (const [e, add] of hold) if (e <= t) x += add; return x }
  const vlen = warp(h.len)
  const gap = tpb
  const evs: Ev[] = []
  const put = (from: number, to: number, at: number) => {
    h.v.forEach((vv, vi) => {
      for (let i = 0; i < vv.length; i += 3) {
        const st = vv[i], en = vv[i] + vv[i + 1]
        if (en <= from || st >= to) continue
        const a = warp(Math.max(st, from)) - warp(from), b = warp(Math.min(en, to)) - warp(from)
        evs.push({ t: at + a, d: b - a, m: vv[i + 2], v: vi === 0 ? 1 : 0.5 })
      }
    })
  }
  const parts: { part: 'intro' | 'verse'; verse: number; a: number; b: number }[] = []
  let at = 0
  if (s.intro) {
    const from = Math.max(0, h.len - bar * 4)
    put(from, h.len, 0)
    const il = vlen - warp(from)
    parts.push({ part: 'intro', verse: 0, a: 0, b: il })
    at = il + gap
  }
  for (let k = 0; k < s.verses; k++) {
    put(0, h.len, at)
    parts.push({ part: 'verse', verse: k + 1, a: at, b: at + vlen })
    at += vlen + gap
  }
  evs.sort((x, y) => x.t - y.t)
  return { evs, parts, end: at - gap }
}

/** 반주 하나를 연주한다. 한 번에 하나만. */
export class HymnPlayer {
  private h: Hymn; private tpb: number; private s: HymnSet
  private p: ReturnType<typeof plan>
  private out: GainNode | null = null
  private t0 = 0 // 틱 0이 울리는 AudioContext 시각
  private i = 0
  private timer = 0
  private live: AudioBufferSourceNode[] = []
  onEnd: (() => void) | null = null
  playing = false
  constructor(h: Hymn, tpb: number, s: HymnSet) { this.h = h; this.tpb = tpb; this.s = { ...s }; this.p = plan(h, tpb, this.s) }

  private spt() { return 60 / (this.h.bpm * this.s.rate) / this.tpb }
  /** 지금 몇 번째 틱인지 */
  private tick() { return this.playing && ctx ? (ctx.currentTime - this.t0) / this.spt() : 0 }

  async start() {
    const c = audio()
    if (c.state !== 'running') await c.resume()
    const b = await loadPiano()
    this.stopNow()
    this.out = c.createGain(); this.out.gain.value = 0.6; this.out.connect(c.destination)
    this.t0 = c.currentTime + 0.12; this.i = 0; this.playing = true
    const run = () => this.pump(b)
    run(); this.timer = window.setInterval(run, 40)
  }

  private pump(b: AudioBuffer[]) {
    const c = ctx!, out = this.out!, spt = this.spt(), until = c.currentTime + 0.3
    while (this.i < this.p.evs.length) {
      const e = this.p.evs[this.i]
      const at = this.t0 + e.t * spt
      if (at > until) break
      this.i++
      if (at < c.currentTime - 0.05) continue
      const m = e.m + this.s.semi
      const k = Math.min(SAMPLES.length - 1, Math.max(0, Math.round((m - LOW) / 3)))
      const src = c.createBufferSource(); src.buffer = b[k]; src.playbackRate.value = 2 ** ((m - (LOW + k * 3)) / 12)
      const g = c.createGain(); const vel = 0.32 * e.v * (m < 48 ? 0.85 : 1)
      const end = at + Math.max(0.08, e.d * spt - 0.02)
      g.gain.setValueAtTime(vel, at); g.gain.setValueAtTime(vel, end); g.gain.exponentialRampToValueAtTime(0.0008, end + 0.22)
      src.connect(g).connect(out)
      src.start(at, 0.02); src.stop(end + 0.25)
      this.live.push(src); src.onended = () => { const j = this.live.indexOf(src); if (j >= 0) this.live.splice(j, 1) }
    }
    if (this.i >= this.p.evs.length && c.currentTime > this.t0 + this.p.end * spt + 0.6) { this.stop(); this.onEnd?.() }
  }

  /** 조·빠르기·절 수·전주를 바꾼다. 빠르기는 지금 자리를 지키며 바꾼다. */
  set(n: Partial<HymnSet>) {
    const now = this.tick()
    if (n.rate !== undefined && this.playing && ctx) { this.s.rate = n.rate; this.t0 = ctx.currentTime - now * this.spt() }
    if (n.semi !== undefined) this.s.semi = n.semi
    if (n.verses !== undefined || n.intro !== undefined) {
      Object.assign(this.s, n); this.p = plan(this.h, this.tpb, this.s)
      this.i = this.p.evs.findIndex((e) => e.t >= now + 0.3 / this.spt()); if (this.i < 0) this.i = this.p.evs.length
    }
    Object.assign(this.s, n)
  }

  pos(): HymnPos {
    const t = this.tick()
    for (const q of this.p.parts) if (t < q.b + this.tpb) return { part: q.part, verse: q.verse, frac: Math.min(1, Math.max(0, (t - q.a) / (q.b - q.a))) }
    return { part: 'end', verse: this.s.verses, frac: 1 }
  }

  /** 1.5초에 걸쳐 줄이며 멈춘다(바로 멈춤은 now) */
  stop(fade = 0.25) {
    window.clearInterval(this.timer); this.timer = 0
    const out = this.out; this.out = null; this.playing = false
    if (out && ctx) {
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + fade)
      const srcs = this.live.splice(0)
      window.setTimeout(() => { srcs.forEach((s) => { try { s.stop() } catch { /* 이미 멈춤 */ } }); out.disconnect() }, fade * 1000 + 60)
    }
  }
  private stopNow() { if (this.playing) this.stop(0.02) }
}
