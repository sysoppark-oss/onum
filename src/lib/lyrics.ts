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

/* ───────── 가사 파일(.lrc)과 음악 파일 속 가사 ───────── */
const TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g

/** LRC 글이면 줄과 시각으로, 아니면 null */
export function parseLrc(src: string): Lyrics | null {
  const rows = src.replace(/\r/g, '').split('\n')
  if (!rows.some((r) => /\[\d{1,3}:\d{1,2}/.test(r))) return null
  let off = 0
  const items: { t: number | null; s: string }[] = []
  for (const r of rows) {
    const meta = r.match(/^\s*\[(\w+):([^\]]*)\]\s*$/)
    if (meta && !/^\d+$/.test(meta[1])) {
      if (meta[1].toLowerCase() === 'offset') off = (Number(meta[2]) || 0) / 1000
      continue
    }
    const times: number[] = []
    const text = r.replace(TAG, (_, m: string, s: string) => { times.push(Number(m) * 60 + Number(s.replace(':', '.'))); return '' }).trim()
    if (!times.length) { items.push({ t: null, s: text }); continue }
    for (const tm of times) items.push({ t: tm, s: text })
  }
  // 한 줄에 시각이 여럿이면(후렴 되풀이) 시각 순으로 펼친다
  const timed = items.filter((x) => x.t != null).sort((a, b) => a.t! - b.t!)
  const out = timed.length === items.filter((x) => x.s || x.t != null).length ? timed : items
  return { text: out.map((x) => x.s).join('\n'), t: out.map((x) => (x.s ? x.t : null)), off }
}

/** 붙여 넣은 글: LRC면 시각까지, 아니면 글만 */
export function fromPasted(old: Lyrics | null, src: string): Lyrics {
  return parseLrc(src) ?? withText(old, src)
}

const two = (n: number) => String(Math.floor(n)).padStart(2, '0')
/** 내보내기용 LRC */
export function toLrc(l: Lyrics, title: string, artist: string): string {
  const head = [`[ti:${title}]`, artist ? `[ar:${artist}]` : '', '[re:온음]'].filter(Boolean)
  const body = linesOf(l.text).map((s, i) => {
    const t = l.t[i]
    if (t == null) return s
    const x = Math.max(0, t - l.off)
    return `[${two(x / 60)}:${two(x % 60)}.${two((x % 1) * 100)}]${s}`
  })
  return [...head, '', ...body].join('\n')
}

/** 음악 파일 속 가사(ID3 USLT·SYLT, FLAC·OGG LYRICS, M4A ©lyr), PC에서는 곡 옆 .lrc 파일 */
export async function findLyrics(t: Track): Promise<Lyrics | null> {
  try {
    if (t.lrcUrl) {
      const s = await (await fetch(t.lrcUrl)).text()
      const l = parseLrc(s) ?? (s.trim() ? withText(null, s) : null)
      if (l) return l
    }
    const blob = await (await fetch(t.url)).blob()
    const { parseBlob } = await import('music-metadata')
    const meta = await parseBlob(blob, { duration: false, skipCovers: true })
    for (const tag of meta.common.lyrics ?? []) {
      const sync = (tag.syncText ?? []).filter((x) => x.text?.trim())
      if (sync.length && sync.some((x) => x.timestamp != null)) {
        const ms = tag.timeStampFormat === 2 // 2 = 1/1000초
        return { text: sync.map((x) => x.text.trim()).join('\n'), t: sync.map((x) => (x.timestamp == null ? null : ms ? x.timestamp / 1000 : null)), off: 0 }
      }
      const s = tag.text?.trim()
      if (s) return parseLrc(s) ?? withText(null, s)
    }
  } catch { /* 못 찾으면 없는 것으로 */ }
  return null
}
