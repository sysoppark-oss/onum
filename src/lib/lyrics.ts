// 가사: 사용자가 붙여 넣은 가사와 줄마다 시작 시각. 이 휴대폰 안에만 저장하고 어디로도 보내지 않는다.
import { useSyncExternalStore } from 'react'
import type { Track } from './library'
import { load, save } from './store'

export interface Lyrics { text: string; t: (number | null)[]; off: number } // t: 줄마다 시작(초), 빈 줄·아직 안 맞춘 줄은 null

const memo = new Map<string, Lyrics | null>()
let ver = 0
const subs = new Set<() => void>()
const keyOf = (t: Track) => 'lyr:' + (t.src ?? t.id)

export const linesOf = (text: string) => text.replace(/\r/g, '').split('\n').map((l) => l.trim())

export function getLyrics(t: Track): Lyrics | null {
  const k = keyOf(t)
  if (!memo.has(k)) memo.set(k, load<Lyrics | null>(k, null))
  return memo.get(k) ?? null
}

export function setLyrics(t: Track, v: Lyrics | null) {
  const k = keyOf(t)
  memo.set(k, v)
  try { if (v) save(k, v); else localStorage.removeItem('onum.' + k) } catch { /* 저장 못 해도 계속 */ }
  ver++
  subs.forEach((f) => f())
}

/** 가사 글을 바꾸면 줄이 같은 곳의 시각은 살린다 */
export function withText(old: Lyrics | null, text: string): Lyrics {
  const ls = linesOf(text)
  const prev = old ? linesOf(old.text) : []
  const t = ls.map((l, i) => (l && prev[i] === l ? old!.t[i] ?? null : null))
  return { text: text.replace(/\r/g, ''), t, off: old?.off ?? 0 }
}

export function useLyrics(t: Track | undefined): Lyrics | null {
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => ver)
  return t ? getLyrics(t) : null
}

/** 박자가 맞춰진 줄이 있는지 */
export const synced = (l: Lyrics | null) => !!l && l.t.some((x) => x != null)

/** 지금 시각에 부를 줄(없으면 -1) */
export function lineAt(l: Lyrics, time: number): number {
  let at = -1
  const now = time + l.off
  for (let i = 0; i < l.t.length; i++) {
    const s = l.t[i]
    if (s != null && s <= now) at = i
  }
  return at
}
