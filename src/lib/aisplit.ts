// 노래방 AI 반주: 곡에서 가수 목소리를 AI(HTDemucs, Meta, MIT)로 떼어 낸 반주를 만든다.
// 휴대폰 앱은 안드로이드 쪽(ONNX Runtime)에서, PC 웹 앱은 브라우저(onnxruntime-web)에서 계산한다.
// 어느 쪽도 소리를 기기 밖으로 보내지 않는다. 만든 반주는 기기에 두고 다음부터 바로 쓴다.
import type { Track } from './library'
import { isNative, nativeAi } from './native'
import { toWav } from './exporter'

const SR = 44100, N = 343980, OV = N / 4, STRIDE = N - OV, VOCALS = 3
/** 단계별로 남길 가수 목소리 크기(안드로이드 Splitter.KEEP과 같게): 0 다 지우기, 1 조금, 2 많이 */
export const KEEP = [0, 0.015, 0.4]
const BASE = import.meta.env.BASE_URL

/** urls[k]: 목소리 남기기 단계 k의 반주 주소(아직 없으면 undefined) */
export interface AiInfo { model: boolean; urls: (string | undefined)[] }

/** 이 기기에서 AI 반주를 만들 수 있는지, 이 곡의 반주가 이미 있는지 */
export async function aiInfo(t: Track): Promise<AiInfo> {
  if (isNative) {
    try {
      const r = await nativeAi.info(t.id)
      const v = Date.now()
      return { model: r.model && !!t.path, urls: KEEP.map((_, k) => r.files?.[k] ? nativeAi.src(r.files[k]) + '?v=' + v : undefined) }
    } catch { return { model: false, urls: [] } }
  }
  const model = await webModel()
  const c = model ? await cache() : null
  const urls = await Promise.all(KEEP.map(async (_, k) => {
    const hit = await c?.match(key(t, k))
    return hit ? URL.createObjectURL(await hit.blob()) : undefined
  }))
  return { model, urls }
}

let cancelled = false
export function aiCancel() { cancelled = true; if (isNative) void nativeAi.cancel().catch(() => {}) }

/** 반주 만들기(목소리 남기기 단계마다 하나씩). onProgress(0~1). 돌려주는 값: 단계별 반주 주소 */
export async function aiSplit(t: Track, onProgress: (f: number) => void): Promise<string[]> {
  cancelled = false
  if (isNative) {
    const h = await nativeAi.onProgress((p) => { if (p.id === t.id) onProgress(p.f) })
    try {
      const r = await nativeAi.split(t.path!, t.id, t.duration || 0)
      const v = Date.now()
      return r.files.map((f) => nativeAi.src(f) + '?v=' + v)
    } finally { void h.remove() }
  }
  return webSplit(t, onProgress)
}

export async function aiRemove(t: Track) {
  if (isNative) { await nativeAi.remove(t.id).catch(() => {}); return }
  const c = await cache()
  await Promise.all(KEEP.map((_, k) => c?.delete(key(t, k))))
}

/* ───────── PC 웹 앱 ───────── */
const key = (t: Track, k: number) => `${location.origin}/onum-kara-ai/${encodeURIComponent(t.id)}${k ? '?k=' + Math.round(KEEP[k] * 1000) : ''}`
const cache = async () => { try { return await caches.open('onum-kara-ai') } catch { return null } }

let modelOk: Promise<boolean> | null = null
function webModel(): Promise<boolean> {
  modelOk ??= fetch(`${BASE}models/model.json`, { cache: 'no-cache' }).then((r) => r.ok).catch(() => false)
  return modelOk
}

type Ort = typeof import('onnxruntime-web')
let ortP: Promise<Ort> | null = null
function loadOrt(): Promise<Ort> {
  // 웹 앱에만 따로 올려 둔 파일을 쓴다(휴대폰 앱 꾸러미에는 넣지 않는다)
  ortP ??= new Promise<Ort>((ok, no) => {
    const s = document.createElement('script')
    s.src = `${BASE}ort/ort.min.js`
    s.onload = () => {
      const ort = (window as unknown as { ort: Ort }).ort
      ort.env.wasm.wasmPaths = new URL(`${BASE}ort/`, location.href).href
      ort.env.wasm.proxy = true // 계산을 따로 된 일꾼(worker)에서: 화면이 멈추지 않게
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
      ok(ort)
    }
    s.onerror = () => { ortP = null; no(new Error('ort')) }
    document.head.appendChild(s)
  })
  return ortP
}

async function webSplit(t: Track, onProgress: (f: number) => void): Promise<string[]> {
  const ort = await loadOrt()
  onProgress(0.01)
  const raw = await (await fetch(t.url)).arrayBuffer()
  const song = await new OfflineAudioContext(2, 1, SR).decodeAudioData(raw)
  const L = song.getChannelData(0), R = song.numberOfChannels > 1 ? song.getChannelData(1) : L
  const frames = L.length
  onProgress(0.03)
  const model = await (await fetch(`${BASE}models/htdemucs.onnx`)).arrayBuffer()
  if (cancelled) throw new Error('cancelled')
  const opts = { graphOptimizationLevel: 'disabled' as const, enableCpuMemArena: false }
  let sess: import('onnxruntime-web').InferenceSession
  const gpu = 'gpu' in navigator
  try { sess = await ort.InferenceSession.create(model, { ...opts, executionProviders: gpu ? ['webgpu', 'wasm'] : ['wasm'] }) }
  catch { sess = await ort.InferenceSession.create(model, { ...opts, executionProviders: ['wasm'] }) }
  onProgress(0.05)
  const win = new Float32Array(N).fill(1)
  for (let i = 0; i < OV; i++) { const v = i / (OV - 1); win[i] = v; win[N - 1 - i] = v }
  const oL = new Float32Array(frames), oR = new Float32Array(frames), w = new Float32Array(frames)
  const vL = new Float32Array(frames), vR = new Float32Array(frames)
  const chunks = Math.max(1, Math.ceil(frames / STRIDE))
  try {
    for (let c = 0; c < chunks; c++) {
      if (cancelled) throw new Error('cancelled')
      const start = c * STRIDE
      const len = Math.min(N, frames - start)
      if (len <= 0) break
      const last = c === chunks - 1 || start + len >= frames
      const inp = new Float32Array(2 * N) // 일꾼에게 넘기면 버퍼가 옮겨 가므로 덩어리마다 새로
      inp.set(L.subarray(start, start + len), 0)
      inp.set(R.subarray(start, start + len), N)
      const r = await sess.run({ mix: new ort.Tensor('float32', inp, [1, 2, N]) })
      const o = r.stems.data as Float32Array
      for (let i = 0; i < len; i++) {
        let l = 0, rr = 0
        for (let s = 0; s < 4; s++) { if (s === VOCALS) continue; l += o[(s * 2) * N + i]; rr += o[(s * 2 + 1) * N + i] }
        const ww = (c === 0 && i < OV) || (last && len === N && i >= N - OV) ? 1 : win[i]
        oL[start + i] += l * ww; oR[start + i] += rr * ww; w[start + i] += ww
        vL[start + i] += o[(VOCALS * 2) * N + i] * ww; vR[start + i] += o[(VOCALS * 2 + 1) * N + i] * ww
      }
      r.stems.dispose?.()
      onProgress(0.05 + 0.93 * (c + 1) / chunks)
      if (last) break
    }
  } finally { await sess.release().catch(() => {}) }
  for (let i = 0; i < frames; i++) { const ww = Math.max(w[i], 1e-4); oL[i] /= ww; oR[i] /= ww; vL[i] /= ww; vR[i] /= ww }
  const c = await cache()
  const urls: string[] = []
  const xL = new Float32Array(frames), xR = new Float32Array(frames)
  for (let k = 0; k < KEEP.length; k++) {
    const g = KEEP[k]
    for (let i = 0; i < frames; i++) { xL[i] = oL[i] + g * vL[i]; xR[i] = oR[i] + g * vR[i] }
    const blob = new Blob([toWav(xL, xR)], { type: 'audio/wav' })
    await c?.put(key(t, k), new Response(blob))
    urls.push(URL.createObjectURL(blob))
  }
  onProgress(1)
  return urls
}
