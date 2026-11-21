// 가사 자동 맞추기: 모델 받기·지우기와 곡마다 맞추는 일을 한곳에서 들고 있는다.
// 화면을 옮겨 다녀도 진행이 이어지도록 React 바깥에 둔다.
import { useSyncExternalStore } from 'react'
import { aiDownload, aiRemove, aiStatus, aiTranscribe, isNative, type AiStatus } from './native'
import { alignLines, guessLang } from './align'
import { getLyrics, linesOf, setLyrics } from './lyrics'
import { load, save } from './store'
import type { Track } from './library'

export const AI_MB = 160

interface State {
  st: AiStatus | null // null = 아직 모름 / 휴대폰 앱이 아님
  dl: number | null // 받는 중 0~1
  dlErr: string
  job: { id: string; stage: 'listen' | 'align'; f: number } | null
  jobErr: { id: string; msg: string } | null
  done: string | null // 방금 맞춘 곡 id
}
let s: State = { st: null, dl: null, dlErr: '', job: null, jobErr: null, done: null }
const subs = new Set<() => void>()
const set = (p: Partial<State>) => { s = { ...s, ...p }; subs.forEach((f) => f()) }
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export function useAi(): State { return useSyncExternalStore(sub, () => s) }

// 개발 서버에서 ?ai=1 (받지 않음) / ?ai=2 (받아 둠): 휴대폰 없이 화면을 시험한다
const mock = import.meta.env.DEV && typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('ai') || 0) : 0
export const aiOn = isNative || mock > 0
const tick = (fn: (f: number) => void, ms: number) => new Promise<void>((ok) => { let f = 0; const h = setInterval(() => { f += 0.1; fn(Math.min(1, f)); if (f >= 1) { clearInterval(h); ok() } }, ms / 10) })
if (mock) s = { ...s, st: { ok: true, ready: mock > 1, bytes: mock > 1 ? 160e6 : 0 } }

export async function refreshAi(): Promise<AiStatus | null> {
  if (mock) return s.st
  if (!isNative) return null
  const st = await aiStatus()
  set({ st })
  return st
}
if (isNative) refreshAi()

/** 처음 열 때 한 번만 묻는다 */
export const aiAsked = () => load('aiAsked', false)
export const setAiAsked = () => save('aiAsked', true)

export async function downloadAi(): Promise<boolean> {
  if (s.dl != null) return false
  if (mock) { set({ dl: 0 }); await tick((f) => set({ dl: f }), 4000); set({ dl: null, st: { ok: true, ready: true, bytes: 160e6 } }); return true }
  set({ dl: 0, dlErr: '' })
  try {
    await aiDownload((p) => { if (p.stage === 'download' && p.total > 0) set({ dl: Math.min(1, p.done / p.total) }) })
    set({ dl: null })
    await refreshAi()
    return true
  } catch (e) {
    set({ dl: null, dlErr: (e as Error)?.message || 'error' })
    return false
  }
}

export async function removeAi(): Promise<void> {
  if (mock) { set({ st: { ok: true, ready: false, bytes: 0 } }); return }
  await aiRemove()
  await refreshAi()
}

/** 가사와 노래를 맞춘다: 받아쓰기(휴대폰 안) → 글자로 짝짓기 → 줄마다 시각 */
export async function autoSync(t: Track): Promise<boolean> {
  const ly = getLyrics(t)
  if (!ly || !(t.path || mock) || s.job) return false
  set({ job: { id: t.id, stage: 'listen', f: 0 }, jobErr: null, done: null })
  if (mock) {
    await tick((f) => set({ job: { id: t.id, stage: 'listen', f } }), 5000)
    const lines = linesOf(ly.text), n = lines.length
    setLyrics(t, { ...ly, t: lines.map((l, i) => (l ? (i * (t.duration || 180)) / n : null)), off: 0 })
    set({ job: null, done: t.id })
    return true
  }
  try {
    const toks = await aiTranscribe(t.path!, guessLang(ly.text), (p) => {
      if (p.stage === 'listen' && p.total > 0) set({ job: { id: t.id, stage: 'listen', f: p.done / p.total } })
    })
    set({ job: { id: t.id, stage: 'align', f: 1 } })
    const lines = linesOf(ly.text)
    const { t: times, e: ends } = alignLines(lines, toks, t.duration || 0)
    const found = ends.filter((x) => x != null).length
    if (!found) throw new Error('nomatch')
    // 그 사이 사용자가 가사를 고쳤으면 고친 글 그대로, 시각만 새로
    const now = getLyrics(t) ?? ly
    if (now.text !== ly.text) throw new Error('changed')
    setLyrics(t, { ...now, t: times, e: ends, off: 0 })
    set({ job: null, done: t.id })
    return true
  } catch (e) {
    set({ job: null, jobErr: { id: t.id, msg: (e as Error)?.message || 'error' } })
    return false
  }
}
