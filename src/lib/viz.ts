// 소리 모양: 파형(곡 전체를 미리 그린 것) · 콘솔식 실시간(레벨 미터·스펙트럼·스테레오 위상) · 고요(줄만)
import { useSyncExternalStore } from 'react'
import { load, save } from './store'

export type Viz = 'shape' | 'meter' | 'spec' | 'phase' | 'calm'
export const VIZ: { id: Viz; name: string }[] = [
  { id: 'shape', name: '파형' }, { id: 'meter', name: '레벨 미터' }, { id: 'spec', name: '스펙트럼' },
  { id: 'phase', name: '스테레오 위상' }, { id: 'calm', name: '고요' },
]
/** 콘솔식(실시간)인지: 이때만 소리가 분석 길을 지난다 */
export const live = (v: Viz) => v === 'meter' || v === 'spec' || v === 'phase'

let cur: Viz = load<Viz>('viz', 'shape')
if (!VIZ.some((x) => x.id === cur)) cur = 'shape'
const subs = new Set<() => void>()
export const getViz = () => cur
export function setViz(v: Viz) { cur = v; save('viz', v); subs.forEach((f) => f()) }
export const useViz = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => cur)
