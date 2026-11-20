// 소리 맞춤(EQ): 음악과 강의를 따로 기억한다. 다섯 대역(낮은음 → 높은음), dB.
import { useSyncExternalStore } from 'react'
import { tx } from "./i18n";
import { load, save } from './store'

export interface Preset { id: string; name: string; sub: string; g: number[] }
export const PRESETS: Preset[] = [
  { id: 'flat', name: tx("그대로"), sub: tx("녹음된 소리 그대로"), g: [0, 0, 0, 0, 0] },
  { id: 'voice', name: tx("목소리 또렷하게"), sub: tx("말소리가 앞으로 나와요"), g: [-5, -2, 1, 5, 1] },
  { id: 'bass', name: tx("저음 강화"), sub: tx("북·베이스가 든든해요"), g: [6, 3, 0, 0, 1] },
  { id: 'bright', name: tx("맑고 밝게"), sub: tx("높은 소리가 살아나요"), g: [0, -1, 0, 3, 5] },
  { id: 'soft', name: tx("부드럽게"), sub: tx("오래 들어도 귀가 편해요"), g: [1, 1, 0, -3, -5] },
  { id: 'small', name: tx("작은 스피커"), sub: tx("휴대폰 스피커로 들을 때"), g: [-4, 3, 1, 2, 0] },
]
export const BAND_NAMES = [tx("깊은 저음"), tx("저음"), tx("가운데"), tx("고음"), tx("높은 고음")]
export interface EqSet { id: string; g: number[] } // id 'custom'이면 g가 사용자 값
export type EqFor = 'music' | 'talk'
const DEF: Record<EqFor, EqSet> = { music: { id: 'flat', g: [0, 0, 0, 0, 0] }, talk: { id: 'flat', g: [0, 0, 0, 0, 0] } }

let cur: Record<EqFor, EqSet> = { music: load('eq:music', DEF.music), talk: load('eq:talk', DEF.talk) }
const subs = new Set<() => void>()

export function gainsOf(s: EqSet): number[] {
  return s.id === 'custom' ? s.g : PRESETS.find((p) => p.id === s.id)?.g ?? DEF.music.g
}
export function getEq(k: EqFor): EqSet { return cur[k] }
export function setEq(k: EqFor, s: EqSet) {
  cur = { ...cur, [k]: s }
  save('eq:' + k, s)
  subs.forEach((f) => f())
}
export function onEq(f: () => void) { subs.add(f); return () => { subs.delete(f) } }
export function useEq(): Record<EqFor, EqSet> {
  return useSyncExternalStore(onEq, () => cur)
}
