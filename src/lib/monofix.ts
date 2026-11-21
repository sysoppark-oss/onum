// 재생기 소리 길: 필요한 곡만 Web Audio로 돌린다(보통 곡은 원래 길 그대로).
//  · 한쪽만 나오는 곡을 양쪽으로(모노 보정)
//  · 키 바꾸기(연습): SoundTouch 오디오워클릿으로 빠르기와 따로 음 높이만 옮긴다
//  · 소리 맞춤(EQ): 다섯 대역 + 넘치지 않게 미리 줄이기
// 한 번 Web Audio로 돌린 재생기는 되돌릴 수 없어서(브라우저 규칙), 효과가 없으면 곧은 길로만 잇는다.
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import processorUrl from '@soundtouchjs/audio-worklet/processor?url'

type Side = 0 | 1 | 2
export const EQ_BANDS = [60, 250, 1000, 3500, 10000] as const
export interface Fx { side: Side; semis: number; rate: number; eq: number[] | null; viz?: boolean }
interface Graph {
  src: MediaElementAudioSourceNode
  split: ChannelSplitterNode
  merge: ChannelMergerNode
  st: SoundTouchNode | null
  filters: BiquadFilterNode[]
  pre: GainNode
  meters: { an: AnalyserNode; lr: ChannelSplitterNode; l: AnalyserNode; r: AnalyserNode } | null // 소리 모양(실시간)
  fx: Fx
  key: string
}

let ctx: AudioContext | null = null
let stReady: Promise<boolean> | null = null
const graphs = new WeakMap<HTMLAudioElement, Graph>()
const flatEq = (eq: number[] | null) => !eq || eq.every((g) => Math.abs(g) < 0.1)
const NONE: Fx = { side: 0, semis: 0, rate: 1, eq: null, viz: false }

function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'playback' })
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function loadSoundTouch(c: AudioContext): Promise<boolean> {
  if (!stReady) stReady = SoundTouchNode.register(c, processorUrl).then(() => true).catch(() => { stReady = null; return false })
  return stReady
}

function wire(g: Graph, c: AudioContext) {
  const { fx } = g
  const key = `${fx.side}|${fx.semis ? 1 : 0}|${flatEq(fx.eq) ? 0 : 1}|${g.st ? 1 : 0}|${fx.viz ? 1 : 0}`
  // 값만 바뀌면 잇기는 그대로 두고 값만 고친다
  if (g.st) {
    g.st.pitchSemitones.value = fx.semis
    g.st.playbackRate.value = fx.rate
  }
  const eq = fx.eq ?? []
  g.filters.forEach((f, i) => { f.gain.value = eq[i] ?? 0 })
  // 키우는 대역이 있으면 그만큼 미리 줄여 소리가 깨지지 않게
  g.pre.gain.value = Math.pow(10, -Math.max(0, ...eq) / 20)
  if (key === g.key) return
  g.key = key
  for (const n of [g.src, g.split, g.merge, g.st, g.pre, ...g.filters, g.meters?.lr]) n?.disconnect()
  let head: AudioNode = g.src
  if (fx.side) {
    g.src.connect(g.split)
    g.split.connect(g.merge, fx.side - 1, 0)
    g.split.connect(g.merge, fx.side - 1, 1)
    head = g.merge
  }
  if (fx.semis && g.st) { head.connect(g.st); head = g.st }
  if (!flatEq(fx.eq)) {
    head.connect(g.pre); head = g.pre
    for (const f of g.filters) { head.connect(f); head = f }
  }
  head.connect(c.destination)
  // 소리 모양: 나가는 소리를 그대로 엿본다(소리에는 손대지 않는다)
  if (fx.viz) {
    if (!g.meters) {
      const an = c.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0.55; an.minDecibels = -90; an.maxDecibels = -12
      const l = c.createAnalyser(), r = c.createAnalyser(); l.fftSize = r.fftSize = 2048
      g.meters = { an, lr: c.createChannelSplitter(2), l, r }
    }
    head.connect(g.meters.an)
    head.connect(g.meters.lr)
    g.meters.lr.connect(g.meters.l, 0)
    g.meters.lr.connect(g.meters.r, 1)
  }
}

/** 이 재생기의 소리 길을 fx에 맞춘다. 효과가 하나도 없고 아직 돌린 적 없으면 아무것도 하지 않는다 */
export function setFx(a: HTMLAudioElement, fx: Partial<Fx>) {
  let g = graphs.get(a)
  const want: Fx = { ...(g?.fx ?? NONE), ...fx }
  const need = want.side || want.semis || !flatEq(want.eq) || want.viz
  // 키를 쓸 때는 브라우저의 음 높이 지키기를 끄고(SoundTouch가 맞춘다), 아니면 켠다
  ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = !(want.semis && g?.st)
  if (!need && !g) return
  try {
    const c = audioCtx()
    if (!g) {
      const filters = EQ_BANDS.map((hz, i) => {
        const f = c.createBiquadFilter()
        f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
        f.frequency.value = hz
        f.Q.value = 0.9
        return f
      })
      g = { src: c.createMediaElementSource(a), split: c.createChannelSplitter(2), merge: c.createChannelMerger(2), st: null, filters, pre: c.createGain(), meters: null, fx: NONE, key: '' }
      graphs.set(a, g)
    }
    g.fx = want
    if (want.semis && !g.st) {
      const gg = g
      loadSoundTouch(c).then((ok) => {
        if (!ok || gg.st) return
        try {
          gg.st = new SoundTouchNode({ context: c })
          ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = !gg.fx.semis
          wire(gg, c)
        } catch { /* 키 바꾸기를 못 해도 재생은 그대로 */ }
      })
    }
    wire(g, c)
  } catch { /* 고치지 못해도 재생은 그대로 */ }
}

/** 소리 모양을 그릴 분석기(소리 모양을 켠 재생기만) */
export function metersOf(a: HTMLAudioElement | null | undefined) {
  const g = a ? graphs.get(a) : undefined
  return g?.fx.viz && g.meters ? { ...g.meters, ctx } : null
}

/** 예전 이름: 모노 보정만 */
export function setMonoFix(a: HTMLAudioElement, side: Side) { setFx(a, { side }) }

/** 시험·점검용 */
export const monoFixed = (a: HTMLAudioElement) => graphs.get(a)?.fx.side ?? 0
export const fxOf = (a: HTMLAudioElement) => graphs.get(a)?.fx ?? null
export const pitchReady = (a: HTMLAudioElement) => !!graphs.get(a)?.st
