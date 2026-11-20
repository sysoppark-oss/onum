// 말씀 역본: 개역한글(한국어)·KJV(영어)·口語訳(일본어). 여러 화면이 같은 설정을 본다.
// 처음에는 화면 언어를 따른다. 한국어 원문 장절을 열쇠로 다른 역본 본문을 찾는다.
import { useSyncExternalStore } from 'react'
import { load, save } from './store'
import { lang, tx } from './i18n'
import { JA } from './versesJa'
import { EN } from './versesEn'

export type Ver = 'krv' | 'kjv' | 'jkg'
export const VERS: { id: Ver; name: string }[] = [
  { id: 'krv', name: '개역한글' },
  { id: 'kjv', name: 'KJV' },
  { id: 'jkg', name: '口語訳' },
]
const old = load<boolean | null>('kjv', null) // 예전 설정(켜고 끄기)
let ver: Ver = load<Ver | null>('bibleVer', null) ?? (old ? 'kjv' : lang === 'ja' ? 'jkg' : lang === 'en' ? 'kjv' : 'krv')
const subs = new Set<() => void>()
export function setVer(v: Ver) { ver = v; save('bibleVer', v); subs.forEach((f) => f()) }
/** 예전 이름을 그대로 쓰는 곳을 위해 */
export const setKjv = (on: boolean) => setVer(on ? 'kjv' : 'krv')
export function useKjv(): Ver {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => ver)
}

/** 고른 역본으로 본문·장절·역본 이름. 그 역본에 없으면 개역한글 */
export function shown(v: { text: string; ref: string; en?: string; enRef?: string }, k: Ver | boolean) {
  const want: Ver = k === true ? 'kjv' : k === false ? 'krv' : k
  if (want === 'jkg') {
    const j = JA[v.ref]
    if (j) return { text: j[0], ref: j[1], ver: '口語訳', lang: 'ja' as const }
  }
  if (want === 'kjv') {
    if (v.en) return { text: v.en, ref: v.enRef ?? v.ref, ver: 'KJV', lang: 'en' as const }
    const e = EN[v.ref]
    if (e) return { text: e[0], ref: e[1], ver: 'KJV', lang: 'en' as const }
  }
  return { text: v.text, ref: lang === 'ko' ? v.ref : v.ref, ver: lang === 'ko' ? '개역한글' : tx('개역한글'), lang: 'ko' as const }
}
