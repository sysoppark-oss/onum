// 말씀을 영어(KJV)로 함께 보기. 여러 화면이 같은 설정을 본다.
import { useSyncExternalStore } from 'react'
import { load, save } from './store'

let on = load<boolean>('kjv', false)
const subs = new Set<() => void>()
export function setKjv(v: boolean) { on = v; save('kjv', v); subs.forEach((f) => f()) }
export function useKjv(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => on)
}

/** 고른 역본으로 본문·장절·역본 이름 */
export function shown(v: { text: string; ref: string; en?: string; enRef?: string }, kjv: boolean) {
  return kjv && v.en ? { text: v.en, ref: v.enRef ?? v.ref, ver: 'KJV', lang: 'en' as const } : { text: v.text, ref: v.ref, ver: '개역한글', lang: 'ko' as const }
}
