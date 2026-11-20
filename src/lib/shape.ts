// 소리 모양: 곡의 실제 소리 크기 변화를 막대 76개로 만든다.
// 휴대폰 메모리를 아끼려고 8kHz 한 갈래로 낮춰서 풀고, 곡마다 한 번만 계산해 저장한다.
import type { Track } from './library'
import { load, save } from './store'

export const BARS = 76

export interface Shape {
  bars: number[] // 0~1
  hook: number | null // 가장 크게 이어지는 구간의 가운데(0~1). 후렴 '추정'
}

const memo = new Map<string, Shape>()
let chain: Promise<unknown> = Promise.resolve() // 한 번에 한 곡씩만 푼다

export function cachedShape(t: Track): Shape | undefined {
  const hit = memo.get(t.id)
  if (hit) return hit
  const saved = load<Shape | null>('shape:' + t.id, null)
  if (saved && saved.bars?.length === BARS) { memo.set(t.id, saved); return saved }
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

async function analyze(t: Track): Promise<Shape | null> {
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
  const max = Math.max(...raw, 1e-6)
  // 작은 소리도 보이게 살짝 끌어올린다
  const bars = raw.map((v) => Math.round(Math.max(0.06, Math.pow(v / max, 0.7)) * 100) / 100)
  const shape: Shape = { bars, hook: findHook(bars) }
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
