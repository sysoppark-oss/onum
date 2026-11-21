// 소리 모양: 파형(곡 전체를 미리 그린 것) · 실시간(스펙트럼·레벨 미터·물결·고리) · 고요(줄만)
import { useSyncExternalStore } from 'react'
import { load, save } from './store'

export type Viz = 'shape' | 'spec' | 'meter' | 'wave' | 'ring' | 'calm'
export const VIZ: { id: Viz; name: string }[] = [
  { id: 'shape', name: '파형' }, { id: 'spec', name: '스펙트럼' }, { id: 'meter', name: '레벨 미터' },
  { id: 'wave', name: '물결' }, { id: 'ring', name: '고리' }, { id: 'calm', name: '고요' },
]
/** 소리를 실시간으로 나눠 보는 모양인지(이때만 소리가 분석 길을 지난다) */
export const live = (v: Viz) => v === 'spec' || v === 'meter' || v === 'wave' || v === 'ring'

let cur: Viz = load<Viz>('viz', 'shape')
if (!VIZ.some((x) => x.id === cur)) cur = 'shape'
const subs = new Set<() => void>()
export const getViz = () => cur
export function setViz(v: Viz) { cur = v; save('viz', v); subs.forEach((f) => f()) }
export const useViz = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => cur)
