// 한쪽에서만 소리가 나는 곡을 양쪽으로 들려준다.
// 그런 곡을 처음 만난 재생기만 Web Audio로 돌린다(보통 곡은 원래 길 그대로).
type Side = 0 | 1 | 2
interface Graph { src: MediaElementAudioSourceNode; split: ChannelSplitterNode; merge: ChannelMergerNode; side: Side }

let ctx: AudioContext | null = null
const graphs = new WeakMap<HTMLAudioElement, Graph>()

export function setMonoFix(a: HTMLAudioElement, side: Side) {
  let g = graphs.get(a)
  if (!side && !g) return
  try {
    if (!ctx) ctx = new AudioContext()
    if (!g) {
      const src = ctx.createMediaElementSource(a)
      g = { src, split: ctx.createChannelSplitter(2), merge: ctx.createChannelMerger(2), side: 0 }
      g.merge.connect(ctx.destination)
      src.connect(ctx.destination)
      graphs.set(a, g)
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    if (g.side === side) return
    g.src.disconnect()
    g.split.disconnect()
    if (side) {
      g.src.connect(g.split)
      g.split.connect(g.merge, side - 1, 0)
      g.split.connect(g.merge, side - 1, 1)
    } else g.src.connect(ctx.destination)
    g.side = side
  } catch { /* 고치지 못해도 재생은 그대로 */ }
}

/** 시험·점검용: 이 재생기가 지금 양쪽으로 고쳐 들려주는 중인지 */
export const monoFixed = (a: HTMLAudioElement) => graphs.get(a)?.side ?? 0
