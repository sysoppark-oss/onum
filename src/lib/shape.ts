// 소리 모양: 곡의 실제 소리 크기 변화를 막대 76개로 만든다.
// 휴대폰 메모리를 아끼려고 8kHz 한 갈래로 낮춰서 풀고, 곡마다 한 번만 계산해 저장한다.
import type { Track } from './library'
import { load, save } from './store'
import { isNative, nativeAnalyze } from './native'

export const BARS = 76

export interface Shape {
  bars: number[] // 0~1
  hook: number | null // 가장 크게 이어지는 구간의 가운데(0~1). 후렴 '추정'
  lufs?: number | null // 곡 전체 소리 크기(ITU-R BS.1770 방식, 8kHz로 낮춰 잰 값)
  head?: number // 앞쪽 무음(초)
  tail?: number // 뒤쪽 무음(초)
  side?: 0 | 1 | 2 // 한쪽에서만 소리가 나는 곡: 1 왼쪽만, 2 오른쪽만, 0 양쪽
}

/** 두 갈래의 에너지로 한쪽만 나오는 곡인지 본다(작은 쪽이 큰 쪽보다 40dB 넘게 작으면) */
export function sideOf(eL: number, eR: number): 0 | 1 | 2 {
  const hi = Math.max(eL, eR), lo = Math.min(eL, eR)
  if (hi <= 1e-9 || lo > hi * 1e-4) return 0
  return eL > eR ? 1 : 2
}

const memo = new Map<string, Shape>()
let chain: Promise<unknown> = Promise.resolve() // 한 번에 한 곡씩만 푼다

export function cachedShape(t: Track): Shape | undefined {
  const hit = memo.get(t.id)
  if (hit) return hit
  const saved = load<Shape | null>('shape:' + t.id, null)
  if (saved && saved.bars?.length === BARS && saved.lufs !== undefined && saved.head !== undefined && saved.side !== undefined) { memo.set(t.id, saved); return saved }
  return undefined
}

export function getShape(t: Track): Promise<Shape | null> {
  const hit = cachedShape(t)
  if (hit) return Promise.resolve(hit)
  const job = chain.then(() => analyze(t)).catch(() => null)
  chain = job
  return job
}

// 20분이 넘거나 40MB가 넘는 파일(예배 실황, 1시간 모음)은 풀지 않는다: 휴대폰 메모리를 지킨다
const MAX_SECONDS = 20 * 60
const MAX_BYTES = 40 * 1024 * 1024

/** rms 76개 → 막대 높이 */
function toBars(raw: number[]): number[] {
  const max = Math.max(...raw, 1e-6)
  // 작은 소리도 보이게 살짝 끌어올린다
  return raw.map((v) => Math.round(Math.max(0.06, Math.pow(v / max, 0.7)) * 100) / 100)
}

async function analyze(t: Track): Promise<Shape | null> {
  // 설치형 앱은 휴대폰이 직접 잰다: 긴 강의도 구간마다 1초씩만 풀어서 빠르다
  if (isNative && t.path) {
    const r = await nativeAnalyze(t.path, BARS)
    if (!r || r.rms.length !== BARS) return null
    const bars = toBars(r.rms)
    const shape: Shape = { bars, hook: findHook(bars), lufs: r.lufs ?? null, head: r.head ?? 0, tail: r.tail ?? 0, side: r.side ?? 0 }
    memo.set(t.id, shape)
    save('shape:' + t.id, shape)
    return shape
  }
  if (t.duration > MAX_SECONDS) return null
  const res = await fetch(t.url)
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) return null
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return null
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Ctx) return null
  const audio = await new Ctx(1, 1, 8000).decodeAudioData(buf)
  const chs = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  const n = chs[0].length
  if (!n) return null
  const raw: number[] = []
  for (let b = 0; b < BARS; b++) {
    const from = Math.floor((b / BARS) * n), to = Math.floor(((b + 1) / BARS) * n)
    let sum = 0, cnt = 0
    for (let i = from; i < to; i += 4) {
      let v = 0
      for (const c of chs) v += c[i]
      v /= chs.length
      sum += v * v
      cnt++
    }
    raw.push(Math.sqrt(sum / Math.max(cnt, 1)))
  }
  const bars = toBars(raw)
  const { head, tail } = silence(chs, audio.sampleRate)
  let side: 0 | 1 | 2 = 0
  if (chs.length >= 2) {
    let eL = 0, eR = 0
    for (let i = 0; i < n; i += 8) { eL += chs[0][i] * chs[0][i]; eR += chs[1][i] * chs[1][i] }
    side = sideOf(eL, eR)
  }
  const shape: Shape = { bars, hook: findHook(bars), lufs: loudness(chs, audio.sampleRate), head, tail, side }
  memo.set(t.id, shape)
  save('shape:' + t.id, shape)
  return shape
}

/** 곡의 앞 20%를 빼고, 곡 길이 12% 너비 창의 평균이 가장 큰 곳. 뚜렷하지 않으면 표시하지 않는다. */
function findHook(bars: number[]): number | null {
  const w = Math.max(4, Math.round(BARS * 0.12))
  const start = Math.round(BARS * 0.2)
  const mean = bars.reduce((a, b) => a + b, 0) / bars.length
  let best = -1, at = -1
  for (let i = start; i + w <= bars.length; i++) {
    let s = 0
    for (let j = i; j < i + w; j++) s += bars[j]
    if (s > best) { best = s; at = i }
  }
  if (at < 0 || best / w < mean * 1.15) return null
  return (at + w / 2) / BARS
}

/** 2차 필터 계수 (RBJ). BS.1770의 K-가중: 고음 올림(1.5kHz, +4dB) + 저음 자름(38Hz) */
function biquad(kind: 'shelf' | 'hp', fc: number, fs: number, q: number, gainDb = 0) {
  const A = Math.pow(10, gainDb / 40), w = (2 * Math.PI * fc) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q)
  let b0, b1, b2, a0, a1, a2
  if (kind === 'shelf') {
    const r = 2 * Math.sqrt(A) * al
    b0 = A * ((A + 1) + (A - 1) * c + r); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - r)
    a0 = (A + 1) - (A - 1) * c + r; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - r
  } else {
    b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

function filter(x: Float32Array, k: number[]): Float32Array {
  const [b0, b1, b2, a1, a2] = k
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v
  }
  return y
}

/** 통합 소리 크기(LUFS): 400ms 조각(75% 겹침), 절대 -70 LUFS·상대 -10 LU 문턱 */
export function loudness(chs: Float32Array[], fs: number): number | null {
  const shelf = biquad('shelf', 1500, fs, 1 / Math.SQRT2, 4)
  const hp = biquad('hp', 38, fs, 0.5)
  const ks = chs.slice(0, 2).map((c) => filter(filter(c, shelf), hp))
  const n = ks[0].length, block = Math.round(fs * 0.4), step = Math.round(block / 4)
  const z: number[] = []
  for (let i = 0; i + block <= n; i += step) {
    let sum = 0
    for (const k of ks) { let e = 0; for (let j = i; j < i + block; j++) e += k[j] * k[j]; sum += e / block }
    z.push(sum)
  }
  const lk = (e: number) => -0.691 + 10 * Math.log10(e)
  const abs = z.filter((e) => e > 0 && lk(e) > -70)
  if (!abs.length) return null
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10
  const gated = abs.filter((e) => lk(e) > rel)
  if (!gated.length) return null
  return Math.round(lk(gated.reduce((a, b) => a + b, 0) / gated.length) * 10) / 10
}

export const TARGET_LUFS = -16
/** 큰 곡만 줄인다(재생기는 소리를 키울 수 없다). 최대 -12dB */
export function normGain(lufs: number | null | undefined): number {
  if (lufs == null) return 1
  return Math.max(Math.pow(10, -12 / 20), Math.min(1, Math.pow(10, (TARGET_LUFS - lufs) / 20)))
}

const QUIET = Math.pow(10, -55 / 20) // -55 dBFS보다 작으면 "조용함"

/** 앞뒤 무음(초): 50ms 창마다 크기를 재서 처음·마지막으로 소리가 나는 창. 앞은 15초, 뒤는 20초까지만 */
export function silence(chs: Float32Array[], fs: number): { head: number; tail: number } {
  const win = Math.max(1, Math.round(fs / 20)), n = Math.floor(chs[0].length / win)
  const loud = (w: number) => {
    let s = 0
    for (const c of chs) for (let i = w * win; i < (w + 1) * win; i++) s += c[i] * c[i]
    return Math.sqrt(s / (win * chs.length)) > QUIET
  }
  let h = 0
  while (h < n && h < 300 && !loud(h)) h++
  let t = 0
  while (t < n && t < 400 && !loud(n - 1 - t)) t++
  return { head: h >= n ? 0 : h * 0.05, tail: t >= n ? 0 : t * 0.05 }
}
