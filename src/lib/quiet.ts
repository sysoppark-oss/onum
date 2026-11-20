// 강의 속 조용한 구간: 말과 말 사이 긴 쉼을 찾아 둔다. 재생기는 그 구간만 빠르게 지나간다(자르지 않음).
// 설치형 앱은 휴대폰이 처음부터 끝까지 흘려 재고(Quiet.java), PC는 8kHz로 낮춰 풀어 같은 셈을 한다.
import type { Track } from './library'
import { load, save } from './store'
import { isNative, nativeQuiet } from './native'

/** [시작, 끝] 초 */
export type Span = [number, number]
const memo = new Map<string, Span[]>()
let chain: Promise<unknown> = Promise.resolve()
const WEB_MAX_SECONDS = 90 * 60
const WEB_MAX_BYTES = 100 * 1024 * 1024

const keyOf = (t: Track) => 'quiet:' + (t.src ?? t.id)

export function cachedQuiet(t: Track): Span[] | undefined {
  const k = keyOf(t)
  const hit = memo.get(k)
  if (hit) return hit
  const saved = load<number[] | null>(k, null)
  if (saved) { const s = toSpans(saved); memo.set(k, s); return s }
  return undefined
}

function toSpans(cs: number[]): Span[] {
  const out: Span[] = []
  for (let i = 0; i + 1 < cs.length; i += 2) out.push([cs[i] / 100, cs[i + 1] / 100])
  return out
}

/** 창마다 dB → 조용한 구간(1/100초). Quiet.java와 같은 셈 */
export function findQuiet(lv: Float32Array | number[], winMs = 50): number[] {
  const n = lv.length
  if (n < 40) return []
  const s = Array.from(lv).sort((a, b) => a - b)
  const floor = s[Math.floor(n * 0.1)], speech = s[Math.floor(n * 0.7)]
  if (speech - floor < 10) return []
  const thr = Math.min(floor + 0.35 * (speech - floor), speech - 12)
  const minWins = Math.floor(700 / winMs), keep = Math.floor(150 / winMs)
  const out: number[] = []
  let i = 0
  while (i < n) {
    if (lv[i] >= thr) { i++; continue }
    let j = i
    while (j < n && lv[j] < thr) j++
    if (j - i >= minWins) {
      const a = i + keep, b = j - keep
      if (b - a >= 2) out.push(Math.floor((a * winMs) / 10), Math.floor((b * winMs) / 10))
    }
    i = j
  }
  return out
}

async function webLevels(t: Track): Promise<number[] | null> {
  if (t.duration > WEB_MAX_SECONDS) return null
  const res = await fetch(t.url)
  const buf = await res.arrayBuffer()
  if (buf.byteLength > WEB_MAX_BYTES) return null
  const Ctx = window.OfflineAudioContext
  if (!Ctx) return null
  const a = await new Ctx(1, 1, 8000).decodeAudioData(buf)
  const chs = Array.from({ length: a.numberOfChannels }, (_, i) => a.getChannelData(i))
  const win = 400 // 50ms @ 8kHz
  const n = Math.floor(chs[0].length / win)
  const lv = new Float32Array(n)
  for (let w = 0; w < n; w++) {
    let acc = 0
    for (let k = w * win; k < (w + 1) * win; k++) {
      let m = 0
      for (const c of chs) m += c[k]
      m /= chs.length
      acc += m * m
    }
    lv[w] = 10 * Math.log10(acc / win + 1e-12)
  }
  return findQuiet(lv)
}

/** 한 번에 한 강의씩 잰다. 결과는 저장해 두고 다시 재지 않는다 */
export function getQuiet(t: Track): Promise<Span[] | null> {
  const hit = cachedQuiet(t)
  if (hit) return Promise.resolve(hit)
  const job = chain.then(async () => {
    const cs = isNative && t.path ? await nativeQuiet(t.path) : isNative ? null : await webLevels(t).catch(() => null)
    if (!cs) return null
    save(keyOf(t), cs)
    const s = toSpans(cs)
    memo.set(keyOf(t), s)
    return s
  }).catch(() => null)
  chain = job
  return job
}

/** 구간 목록에서 t초가 들어 있는 구간(이진 탐색) */
export function spanAt(spans: Span[], t: number): Span | null {
  let lo = 0, hi = spans.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (spans[m][1] <= t) lo = m + 1
    else if (spans[m][0] > t) hi = m - 1
    else return spans[m]
  }
  return null
}
