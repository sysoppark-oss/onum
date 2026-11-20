// 감상 기록: 날마다 얼마나 들었는지, 어떤 곡을 들었는지. 이 휴대폰 안에만 저장한다.
// days['2026-11-20'] = { t: 초, s: { 곡 id: 초 } }
import { load, save } from './store'

export interface Day { t: number; s: Record<string, number> }
export type Days = Record<string, Day>

const KEY = 'listen'
const KEEP = 400 // 날 수

let cache: Days | null = null
let dirty = 0
const subs = new Set<() => void>()

export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function days(): Days {
  if (!cache) cache = load<Days>(KEY, {})
  return cache
}

/** 들은 시간을 더한다. 자주 불려도 저장은 몇 초에 한 번만 */
export function addListen(id: string, sec: number): void {
  if (!(sec > 0) || !id) return
  const all = days()
  const k = dayKey()
  const d = (all[k] ??= { t: 0, s: {} })
  d.t += sec
  d.s[id] = (d.s[id] ?? 0) + sec
  dirty += sec
  if (dirty >= 10) flush()
}

export function flush(): void {
  if (!cache || dirty === 0) return
  dirty = 0
  const ks = Object.keys(cache).sort()
  if (ks.length > KEEP) for (const k of ks.slice(0, ks.length - KEEP)) delete cache[k]
  save(KEY, cache)
  subs.forEach((f) => f())
}

export function onStats(f: () => void): () => void { subs.add(f); return () => { subs.delete(f) } }

/** 오늘을 끝으로 n일 */
export function lastDays(n: number, end = new Date()): { key: string; date: Date; t: number }[] {
  const all = days()
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const key = dayKey(d)
    out.push({ key, date: d, t: all[key]?.t ?? 0 })
  }
  return out
}

/** 여러 날 동안 곡별로 들은 시간, 많은 순 */
export function topSongs(keys: string[], n = 5): { id: string; sec: number }[] {
  const all = days()
  const m = new Map<string, number>()
  for (const k of keys) for (const [id, s] of Object.entries(all[k]?.s ?? {})) m.set(id, (m.get(id) ?? 0) + s)
  return [...m].map(([id, sec]) => ({ id, sec })).sort((a, b) => b.sec - a.sec).slice(0, n)
}

/** "3시간 20분", "45분", "1분 미만" */
export function hm(sec: number): string {
  const m = Math.floor(sec / 60)
  if (m < 1) return '1분 미만'
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
}
