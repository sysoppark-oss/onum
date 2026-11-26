// 노래방: 목소리 줄이기·키·빠르기로 반주를 만들고, 마이크로 내 노래를 녹음해 점수를 매기고 섞어 저장한다.
// 녹음은 이 휴대폰 안에만 두고 어디로도 보내지 않는다.
import { useSyncExternalStore } from 'react'
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import processorUrl from '@soundtouchjs/audio-worklet/processor?url'
// no-inline: 파일로 따로 둔다(data: 주소로 묻히면 PC 웹 앱의 CSP가 막는다)
import micUrl from './micWorklet.js?url&no-inline'
import { audioCtx, makeVox, tuneVox, type Vox } from './monofix'
import { load, save } from './store'
import { toWav } from './exporter'
import { isNative, nativeSavePcm } from './native'
import type { Lyrics } from './lyrics'
import { lineEnd } from './lyrics'

// ── 설정: 노래방 쓰기(기본 켬)
let on = load<boolean>('karaoke', true)
const subs = new Set<() => void>()
export function setKaraokeOn(v: boolean) { on = v; save('karaoke', v); subs.forEach((f) => f()) }
export function useKaraokeOn() { return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => on) }

// ── 곡마다 노래방 설정
export interface KaraSet { vox: Vox; semi: number; rate: number; ai?: boolean; keep?: number }
export const karaSet = (id: string): KaraSet => ({ vox: load<Vox>('karaVox', 2), semi: 0, rate: 1, ...load<Partial<KaraSet>>('kara:' + id, {}) })
export function saveKaraSet(id: string, s: KaraSet) { save('kara:' + id, { semi: s.semi, rate: s.rate, vox: s.vox, ai: s.ai, keep: s.keep }); if (s.vox) save('karaVox', s.vox) }

/** 「내가 부른 노래」: 노래방에서 저장한 곡이 들어가는 폴더 */
export const SUNG = /(^|\/)온음\/노래방(\/|$)/

// ── 마이크 녹음
export interface Take {
  pcm: Int16Array; sr: number
  /** 녹음 첫 소리가 반주(나가는 소리) 시간으로 몇 초에 해당하는지 */
  at: number
  /** 반주를 어디까지 불렀는지(곡 안 시각, 초) */
  end: number
  set: KaraSet
  score: Score
  back?: string // AI 반주로 불렀으면 그 반주 주소
}

let micReady: Promise<void> | null = null

export class MicRecorder {
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private src: MediaStreamAudioSourceNode | null = null
  private sink: GainNode | null = null
  private g: GainNode | null = null
  private chunks: Int16Array[] = []
  private t0 = -1
  sr = 48000
  an: AnalyserNode | null = null

  /** 마이크를 연다. 실패하면 이유를 담은 오류 */
  async open() {
    const c = audioCtx()
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no_mic')
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    micReady ??= c.audioWorklet.addModule(micUrl).catch((e) => { micReady = null; throw e })
    await micReady
    this.src = c.createMediaStreamSource(this.stream)
    // 마이크 크기: 녹음과 음량 표시 모두 이 크기를 거친다
    this.g = c.createGain(); this.g.gain.value = this.gain
    this.an = c.createAnalyser(); this.an.fftSize = 2048
    this.src.connect(this.g); this.g.connect(this.an)
  }

  private gain = 1
  /** 마이크 크기(1이 그대로) */
  setGain(v: number) { this.gain = v; if (this.g) this.g.gain.setTargetAtTime(v, audioCtx().currentTime, 0.02) }

  start() {
    const c = audioCtx()
    if (!this.g) throw new Error('not_open')
    this.chunks = []; this.t0 = -1
    this.node = new AudioWorkletNode(c, 'onum-mic', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' })
    this.node.port.onmessage = (e) => {
      const d = e.data
      if (d.t0 != null) { this.t0 = d.t0; this.sr = d.sr }
      if (d.pcm) this.chunks.push(d.pcm)
    }
    // 처리가 멈추지 않게 소리 없는 길로 내보낸다
    this.sink = c.createGain(); this.sink.gain.value = 0
    this.g.connect(this.node); this.node.connect(this.sink); this.sink.connect(c.destination)
  }

  /** 녹음을 끝내고 모은 소리와 시작 시각(AudioContext 시각)을 돌려준다 */
  stop(): Promise<{ pcm: Int16Array; sr: number; t0: number }> {
    const node = this.node
    return new Promise((res) => {
      const done = () => {
        const n = this.chunks.reduce((a, c) => a + c.length, 0)
        const pcm = new Int16Array(n)
        let o = 0
        for (const c of this.chunks) { pcm.set(c, o); o += c.length }
        this.chunks = []
        try { node?.disconnect(); this.sink?.disconnect() } catch { /* 이미 끊김 */ }
        this.node = null
        res({ pcm, sr: this.sr, t0: this.t0 })
      }
      if (!node) { done(); return }
      const t = window.setTimeout(done, 800)
      node.port.onmessage = (e) => {
        if (e.data.pcm) this.chunks.push(e.data.pcm)
        if (e.data.done) { window.clearTimeout(t); done() }
      }
      node.port.postMessage('stop')
    })
  }

  close() {
    try { this.src?.disconnect(); this.g?.disconnect(); this.an?.disconnect() } catch { /* 이미 끊김 */ }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null; this.src = null; this.g = null; this.an = null
  }
}

/** 소리가 휴대폰에서 나와 귀에 들리기까지·마이크로 들어오기까지 걸리는 시간 어림(초) */
export function latency(): number {
  const c = audioCtx() as AudioContext & { outputLatency?: number }
  return (c.outputLatency || c.baseLatency || 0.02) + 0.03
}

// ── 음 높이 찾기(자기상관). 목소리가 없으면 0
export function pitchOf(buf: Float32Array, sr: number): { hz: number; rms: number } {
  let rms = 0
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / buf.length)
  if (rms < 0.01) return { hz: 0, rms }
  const minLag = Math.floor(sr / 1000), maxLag = Math.min(Math.floor(sr / 75), buf.length >> 1)
  let best = 0, bestLag = 0
  const n = buf.length - maxLag
  let e0 = 0
  for (let i = 0; i < n; i++) e0 += buf[i] * buf[i]
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0
    for (let i = 0; i < n; i++) { s += buf[i] * buf[i + lag]; e1 += buf[i + lag] * buf[i + lag] }
    const r = s / Math.sqrt(e0 * e1 + 1e-12)
    if (r > best) { best = r; bestLag = lag }
  }
  if (best < 0.82 || !bestLag) return { hz: 0, rms }
  return { hz: sr / bestLag, rms }
}

// ── 재미 점수
export interface Frame { t: number; hz: number; rms: number } // t: 곡 안 시각(초)
export interface Score { total: number; sing: number; steady: number; flow: number; note: string }

export function scoreOf(frames: Frame[], ly: Lyrics | null, from: number, to: number): Score {
  const voiced = frames.filter((f) => f.hz > 0)
  // 1) 부를 때 불렀나: 박자 맞춘 가사가 있으면 가사 줄이 나오는 동안만 본다
  let want = frames
  if (ly && ly.t.some((x) => x != null)) {
    const spans: [number, number][] = []
    ly.t.forEach((s, i) => { if (s != null) { const e = lineEnd(ly, i); spans.push([s - ly.off, (e ?? s + 4) - ly.off]) } })
    want = frames.filter((f) => spans.some(([a, b]) => f.t >= a && f.t <= b))
  } else {
    // 가사가 없으면 앞뒤 10%(전주·후주)는 빼고 본다
    const a = from + (to - from) * 0.1, b = to - (to - from) * 0.1
    want = frames.filter((f) => f.t >= a && f.t <= b)
  }
  const singRaw = want.length ? want.filter((f) => f.hz > 0).length / want.length : 0
  const sing = Math.min(1, singRaw / 0.6)
  // 2) 음이 반듯했나: 반음 한가운데서 얼마나 벗어났나(센트)
  let dev = 0
  for (const f of voiced) { const m = 12 * Math.log2(f.hz / 440); dev += Math.abs(m - Math.round(m)) * 100 }
  const avg = voiced.length ? dev / voiced.length : 50
  const steady = Math.max(0, Math.min(1, (40 - avg) / 25))
  // 3) 끊기지 않고 이어 불렀나: 0.3초 넘게 이어진 소리의 비율
  let runs = 0, long = 0, run = 0
  for (const f of frames) {
    if (f.hz > 0) run++
    else { if (run) { runs++; if (run >= 6) long++ } run = 0 }
  }
  if (run) { runs++; if (run >= 6) long++ }
  const flow = runs ? long / runs : 0
  const raw = 0.5 * sing + 0.3 * steady + 0.2 * flow
  const total = Math.round(Math.max(40, Math.min(100, 52 + 48 * raw)))
  const worst = Math.min(sing, steady, flow)
  const note = total >= 95 ? '완벽해요! 가수 같아요'
    : worst === sing && sing < 0.7 ? '쉬는 곳이 많았어요. 가사 줄마다 따라 불러 보세요'
    : worst === steady && steady < 0.6 ? '음이 조금 흔들렸어요. 키를 내려 보면 편해요'
    : worst === flow && flow < 0.6 ? '소리가 자주 끊겼어요. 숨을 길게 이어 보세요'
    : total >= 85 ? '아주 잘 불렀어요' : '좋아요. 한 번 더 불러 볼까요?'
  return { total, sing, steady, flow, note }
}

// ── 섞어서 저장: 원곡을 같은 설정(목소리 줄이기·키·빠르기)으로 다시 만들고 녹음을 얹는다
const OUT_SR = 44100

export async function renderTake(url: string, take: Take, micGain: number, backGain: number, shift: number, onProgress: (f: number) => void): Promise<AudioBuffer> {
  const { set } = take
  const dec = await (await fetch(url)).arrayBuffer()
  const song = await new OfflineAudioContext(2, 1, OUT_SR).decodeAudioData(dec)
  onProgress(0.15)
  const outLen = Math.ceil((take.end / set.rate + 1) * OUT_SR)
  const c = new OfflineAudioContext(2, outLen, OUT_SR)
  const bs = c.createBufferSource(); bs.buffer = song; bs.playbackRate.value = set.rate
  let head: AudioNode = bs
  if (set.vox) { const v = makeVox(c); tuneVox(v, set.vox); head.connect(v.inp); head = v.merge }
  if (set.semi || set.rate !== 1) {
    await SoundTouchNode.register(c as unknown as AudioContext, processorUrl)
    const st = new SoundTouchNode({ context: c as unknown as AudioContext })
    st.pitchSemitones.value = set.semi
    st.playbackRate.value = set.rate
    head.connect(st); head = st
  }
  const bg = c.createGain(); bg.gain.value = backGain
  head.connect(bg); bg.connect(c.destination)
  bs.start(0, 0, take.end)
  // 내 목소리: 살짝 눌러(컴프레서) 크기를 고르게
  const mb = c.createBuffer(1, take.pcm.length, take.sr)
  const ch = mb.getChannelData(0)
  for (let i = 0; i < ch.length; i++) ch[i] = take.pcm[i] / 32768
  const ms = c.createBufferSource(); ms.buffer = mb
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2
  const mg = c.createGain(); mg.gain.value = micGain
  ms.connect(comp); comp.connect(mg); mg.connect(c.destination)
  const at = take.at + shift
  if (at >= 0) ms.start(at); else ms.start(0, -at)
  const t = window.setInterval(() => onProgress(0.15 + 0.6 * Math.min(1, c.currentTime / (outLen / OUT_SR))), 300)
  try { return await c.startRendering() } finally { window.clearInterval(t) }
}

/** 섞은 소리를 저장. 설치형 앱은 「음악/온음/노래방」에 .m4a, PC는 WAV로 내려받기 */
export async function saveTake(buf: AudioBuffer, name: string, onProgress: (f: number) => void): Promise<{ where: string; url?: string; file?: string }> {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L
  // 넘치지 않게 전체 크기 맞추기
  let peak = 0
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  const g = peak > 0.98 ? 0.98 / peak : 1
  const safe = name.replace(/[\\/:*?"<>|]/g, ' ').trim()
  if (isNative) {
    const pcm = new Int16Array(L.length * 2)
    for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.round(L[i] * g * 32767); pcm[2 * i + 1] = Math.round(R[i] * g * 32767) }
    const where = await nativeSavePcm(pcm, safe, (f) => onProgress(0.75 + 0.25 * f))
    return { where }
  }
  const l2 = new Float32Array(L.length), r2 = new Float32Array(L.length)
  for (let i = 0; i < L.length; i++) { l2[i] = L[i] * g; r2[i] = R[i] * g }
  const url = URL.createObjectURL(new Blob([toWav(l2, r2)], { type: 'audio/wav' }))
  onProgress(1)
  return { where: `${safe}.wav`, url, file: `${safe}.wav` }
}
