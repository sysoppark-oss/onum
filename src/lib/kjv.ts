// 말씀 역본: 개역한글(한국어)·KJV(영어)·口語訳(일본어)·시노달(러시아어). 모두 저작권이 끝난 역본. 여러 화면이 같은 설정을 본다.
// 처음에는 화면 언어를 따른다. 한국어 원문 장절을 열쇠로 다른 역본 본문을 찾는다.
import { useSyncExternalStore } from 'react'
import { load, save } from './store'
import { lang, tx } from './i18n'
import { JA } from './versesJa'
import { EN } from './versesEn'
import { RU } from './versesRu'

export type Ver = 'krv' | 'kjv' | 'jkg' | 'syn'
export const VERS: { id: Ver; name: string; lang: string }[] = [
  { id: 'krv', name: '개역한글', lang: 'ko' },
  { id: 'kjv', name: 'KJV', lang: 'en' },
  { id: 'jkg', name: '口語訳', lang: 'ja' },
  { id: 'syn', name: 'Синодальный', lang: 'ru' },
]
const old = load<boolean | null>('kjv', null) // 예전 설정(켜고 끄기)
// 중국어·힌디어는 아직 저작권이 끝난 깨끗한 본문을 못 구해 KJV로 시작한다
let ver: Ver = load<Ver | null>('bibleVer', null) ?? (old ? 'kjv' : lang === 'ja' ? 'jkg' : lang === 'ru' ? 'syn' : lang === 'ko' ? 'krv' : 'kjv')
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
  if (want === 'syn') {
    const r = RU[v.ref]
    if (r) return { text: r[0], ref: r[1], ver: 'Синодальный', lang: 'ru' as const }
  }
  if (want === 'jkg') {
    const j = JA[v.ref]
    if (j) return { text: j[0], ref: j[1], ver: '口語訳', lang: 'ja' as const }
  }
  // 고른 역본에 없는 구절: 한국어 화면이 아니면 KJV로 먼저
  if (want === 'kjv' || (want !== 'krv' && lang !== 'ko')) {
    if (v.en) return { text: v.en, ref: v.enRef ?? v.ref, ver: 'KJV', lang: 'en' as const }
    const e = EN[v.ref]
    if (e) return { text: e[0], ref: e[1], ver: 'KJV', lang: 'en' as const }
  }
  return { text: v.text, ref: lang === 'ko' ? v.ref : v.ref, ver: lang === 'ko' ? '개역한글' : tx('개역한글'), lang: 'ko' as const }
}
