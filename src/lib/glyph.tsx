// 떠오르는 모양: 소리에 맞춰 떠오르는 작은 그림(음표·하트·별…). 글꼴이 아니라 그림(SVG 길)으로 그려 어느 폰에서나 같다.
import { useSyncExternalStore } from 'react'
import { load, save } from './store'

export type Glyph = 'note' | 'heart' | 'star' | 'spark' | 'petal' | 'drop' | 'cross' | 'mix'
export const GLYPHS: { id: Glyph; name: string }[] = [
  { id: 'note', name: '음표' }, { id: 'heart', name: '하트' }, { id: 'star', name: '별' }, { id: 'spark', name: '반짝이' },
  { id: 'petal', name: '꽃잎' }, { id: 'drop', name: '물방울' }, { id: 'cross', name: '십자가' }, { id: 'mix', name: '섞어서' },
]

/** 24×24 칸 안의 길. 가운데가 (12,12) */
export const PATH: Record<string, string> = {
  note: 'M10 3h2.2c.6 2.6 2.6 3.7 4.6 4.8 1.6.9 2.4 2.5 1.8 4.4-.6-1.6-2-2.7-4.2-3.2l-2.2-.5v9a3.6 3 0 1 1-2.2-2.8z',
  notes: 'M8 5.5l12-3.3v12.3a3.2 2.7 0 1 1-2-2.5V6.6l-8 2.2v8.9a3.2 2.7 0 1 1-2-2.5z',
  heart: 'M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2.2 0 3.7 1.3 5.4 3.3C13.7 6.3 15.2 5 17.4 5 21 5 23 8.6 21.6 11.8 19.5 16.4 12 21 12 21z',
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z',
  spark: 'M12 2c.8 5.2 4.8 9.2 10 10-5.2.8-9.2 4.8-10 10-.8-5.2-4.8-9.2-10-10 5.2-.8 9.2-4.8 10-10z',
  petal: 'M12 2c4.5 4 6 8.3 4.6 13.2-1 3.4-2.7 5.8-4.6 6.8-1.9-1-3.6-3.4-4.6-6.8C6 10.3 7.5 6 12 2z',
  drop: 'M12 2.5c3.5 5 7 8.5 7 12.5a7 7 0 0 1-14 0c0-4 3.5-7.5 7-12.5z',
  cross: 'M10.2 2h3.6v6h5.7v3.6h-5.7V22h-3.6V11.6H4.5V8h5.7z',
}
const MIX = ['note', 'heart', 'star', 'spark', 'petal', 'drop', 'notes']
/** 고른 모양에서 이번에 띄울 그림 하나 */
export function shapeFor(g: Glyph, i: number): string {
  if (g === 'mix') return MIX[i % MIX.length]
  if (g === 'note') return i % 3 === 2 ? 'notes' : 'note'
  return g
}

let cur: Glyph = load<Glyph>('glyph', 'note')
if (!GLYPHS.some((x) => x.id === cur)) cur = 'note'
const subs = new Set<() => void>()
export const getGlyph = () => cur
export function setGlyph(g: Glyph) { cur = g; save('glyph', g); subs.forEach((f) => f()) }
export const useGlyph = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => cur)

/** 설정 칩·파형 음표에 쓰는 작은 그림 */
export function GlyphIcon({ k, s = 18 }: { k: string; s?: number }) {
  return <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" focusable="false"><path d={PATH[k]} fill="currentColor" /></svg>
}
