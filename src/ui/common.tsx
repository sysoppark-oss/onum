// 여러 화면이 함께 쓰는 것: 창 다루기, 긴 목록, 아이콘, 곡 정보, 그림, 음량, 소리 나가는 곳
import { load, save } from '../lib/store'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { parseTitle, type Parsed } from '../lib/title'
import { lang, locale, tx } from "../lib/i18n";
import { getOutput, getVolume, nativeArt, onOutput, onVolume, setVolume, type Output, type Volume } from '../lib/native'

export const nf = new Intl.NumberFormat(locale)

export function minutesText(m: number): string {
  const h = Math.floor(m / 60), r = Math.round(m % 60)
  return h ? (r ? tx("{0}시간 {1}분", h, r) : tx("{0}시간", h)) : tx("{0}분", r)
}

/** 12시간제 시각: 오전 5:10 */
export function clock(ms: number, withAmPm = true): string {
  const d = new Date(ms)
  const h = d.getHours(), m = d.getMinutes()
  const hh = h % 12 === 0 ? 12 : h % 12
  const hm = `${hh}:${String(m).padStart(2, '0')}`
  if (!withAmPm) return hm
  if (lang === 'en') return `${hm} ${h < 12 ? 'AM' : 'PM'}`
  if (lang === 'ru') return `${h}:${String(m).padStart(2, '0')}` // 러시아는 24시간제가 보통
  return `${h < 12 ? tx("오전") : tx("오후")}${lang === 'ja' || lang === 'zh' ? '' : ' '}${hm}`
}

/* ── 곡 정보: 제목 풀이는 곡마다 한 번만 ── */
const parsedMemo = new Map<string, Parsed>()
export function info(t: Track): Parsed {
  // 편집곡 구간: 편집곡 이름 + 몇째 구간·어느 곡에서
  if (t.edit) return { song: t.title, singer: tx("편집곡 {0}/{1} · {2}", t.edit.k + 1, t.edit.n, t.edit.from), original: '', program: '', episode: '' }
  let p = parsedMemo.get(t.id)
  if (!p) {
    p = parseTitle(t.title, t.artist)
    if (!p.song) p = { ...p, song: tx("제목 없는 곡") }
    parsedMemo.set(t.id, p)
  }
  return p
}

/** "김수아 · 원곡 윤상" */
export function whoLine(p: Parsed): string {
  return [p.singer, p.original && tx("원곡 {0}", p.original)].filter(Boolean).join(' · ')
}

/** "우리들의 발라드 · 4회" */
export function fromLine(p: Parsed, t: Track): string {
  if (p.program) return [p.program, p.episode].filter(Boolean).join(' · ')
  return t.album
}

/** "4분 20초" */
export function secText(sec: number): string {
  const s = Math.max(0, Math.round(sec)), m = Math.floor(s / 60), r = s % 60
  return m ? (r ? tx("{0}분 {1}초", m, r) : tx("{0}분", m)) : tx("{0}초", r)
}

/** 길게 누르기(0.55초). 목록 하나에 하나 만들고 줄마다 bind로 붙인다. 오른쪽 클릭·Shift+F10도 같다. */
export function useLongPress() {
  const timer = useRef(0)
  const fired = useRef(false)
  const at = useRef<[number, number]>([0, 0])
  const stop = () => window.clearTimeout(timer.current)
  return (onLong: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false
      at.current = [e.clientX, e.clientY]
      stop()
      timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(12); onLong() }, 550)
    },
    onPointerMove: (e: React.PointerEvent) => { if (Math.hypot(e.clientX - at.current[0], e.clientY - at.current[1]) > 10) stop() },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); stop(); if (!fired.current) { fired.current = true; onLong() } },
    onClickCapture: (e: React.MouseEvent) => { if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false } },
  })
}

/* ── 창: 초점 가두기, 뒤로 버튼·Esc로 닫기 ── */
export const closers: (() => void)[] = []
// 떠 있는 창들의 바깥 상자. 맨 위 창만 살아 있고 나머지(앱 본문, 아래 창)는 inert
const layers: HTMLElement[] = []
function syncInert() {
  const root = document.getElementById('root')
  if (root) root.inert = layers.length > 0
  layers.forEach((el, i) => { el.inert = i < layers.length - 1 })
}

/** 창은 body 바로 아래에 그린다(뒤 화면을 통째로 inert로 막을 수 있게) */
export function Layer({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current!
    layers.push(el)
    syncInert()
    return () => { const i = layers.indexOf(el); if (i >= 0) layers.splice(i, 1); el.inert = false; syncInert() }
  }, [])
  return createPortal(<div ref={ref} className="layer-host">{children}</div>, document.body)
}
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([type=hidden]), [tabindex]:not([tabindex="-1"])'

export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const box = useRef<T>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    closers.push(onClose)
    box.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (closers[closers.length - 1] !== onClose || !box.current) return
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      const at = document.activeElement
      if (!box.current.contains(at)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && (at === first || at === box.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      const i = closers.lastIndexOf(onClose)
      if (i >= 0) closers.splice(i, 1)
      before?.focus?.()
    }
  }, [onClose])
  return box
}

/** 손가락으로 아래로 끌어내리면 닫힌다(창 맨 위에 있을 때만). 빠르게 튕기면 짧게 끌어도 닫힌다. */
export function useSwipeClose(box: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const el = box.current
    if (!el) return
    let y0 = 0, t0 = 0, dy = 0, armed = false, on = false
    const start = (e: TouchEvent) => {
      armed = false
      if (e.touches.length !== 1) return
      const tg = e.target as HTMLElement
      // 재생 위치·음량 막대, 글자 칸에서는 끌지 않는다
      if (tg.closest('input, textarea, .shape, .track')) return
      const inner = tg.closest('.sheet-list') as HTMLElement | null
      if (el.scrollTop > 0 || (inner && inner.scrollTop > 0)) return
      armed = true; on = false; dy = 0
      y0 = e.touches[0].clientY; t0 = Date.now()
    }
    const move = (e: TouchEvent) => {
      if (!armed) return
      const d = e.touches[0].clientY - y0
      if (!on) {
        if (d < -4) { armed = false; return } // 위로 밀면 그냥 스크롤
        if (d < 10) return
        on = true; y0 += 10; t0 = Date.now()
        el.style.transition = 'none'
      }
      e.preventDefault()
      dy = Math.max(0, e.touches[0].clientY - y0)
      el.style.transform = `translateY(${dy}px)`
    }
    const end = () => {
      if (!on) { armed = false; return }
      on = armed = false
      const v = dy / Math.max(1, Date.now() - t0)
      el.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)'
      if (dy > Math.min(el.offsetHeight * 0.25, 160) || (v > 0.11 && dy > 48)) {
        el.style.transform = 'translateY(100%)'
        setTimeout(() => close.current(), 200)
      } else el.style.transform = ''
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [box])
}

/** 아래에서 올라오는 창 */
export function Sheet({ label, onClose, children, tall }: { label: string; onClose: () => void; children: React.ReactNode; tall?: boolean }) {
  const box = useDialog(onClose)
  useSwipeClose(box, onClose)
  return (
    <Layer>
      <div className="dim" onClick={onClose}>
        <div ref={box} tabIndex={-1} className={'sheet' + (tall ? ' tall' : '')} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
          <span className="grab" aria-hidden="true" />
          {children}
        </div>
      </div>
    </Layer>
  )
}

/** 긴 목록: 보이는 줄과 그 위아래 몇 줄만 그린다. rowRem: 한 줄 높이(rem) */
export function VirtualList<T>({ items, render, rowRem = 4, className = 'list' }: {
  items: T[]; render: (item: T, i: number) => React.ReactNode; rowRem?: number; className?: string
}) {
  const ref = useRef<HTMLUListElement>(null)
  const [range, setRange] = useState({ from: 0, to: 24, cols: 1 })
  useEffect(() => {
    let raf = 0
    const calc = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      // 가로 화면에서 두 줄로 나뉘면(--cols: 2) 한 칸 높이에 곡이 두 개씩
      const cols = Math.max(1, parseInt(getComputedStyle(el).getPropertyValue('--cols')) || 1)
      const rowH = parseFloat(getComputedStyle(document.documentElement).fontSize) * rowRem
      const top = el.getBoundingClientRect().top
      const from = Math.max(0, Math.floor(-top / rowH) - 8) * cols
      const to = Math.min(items.length, (Math.ceil((window.innerHeight - top) / rowH) + 8) * cols)
      setRange((r) => (r.from === from && r.to === to && r.cols === cols ? r : { from, to, cols }))
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(calc) }
    calc()
    window.addEventListener('scroll', on, { passive: true, capture: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on, true)
      window.removeEventListener('resize', on)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [items.length, rowRem])
  const c = range.cols
  const from = Math.min(range.from, items.length)
  const to = Math.min(Math.max(range.to, from), items.length)
  return (
    <ul ref={ref} className={className} style={{ paddingTop: `${(from / c) * rowRem}rem`, paddingBottom: `${(Math.ceil(items.length / c) - Math.ceil(to / c)) * rowRem}rem` }}>
      {items.slice(from, to).map((it, k) => render(it, from + k))}
    </ul>
  )
}

/* ── 아이콘: 선 굵기·끝 처리 통일 ── */
const STROKE: Record<string, React.ReactNode> = {
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>,
  gear: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
  expand: <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>,
  plus: <><line x1="5" y1="12" x2="19" y2="12" /><line x1="12" y1="5" x2="12" y2="19" /></>,
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  chev: <polyline points="9 6 15 12 9 18" />,
  back: <polyline points="15 18 9 12 15 6" />,
  down: <polyline points="6 9 12 15 18 9" />,
  up: <polyline points="6 15 12 9 18 15" />,
  x: <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>,
  check: <polyline points="5 12 10 17 19 7" />,
  search: <><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
  list: <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="13" y2="18" /></>,
  heart: <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />,
  shuffle: <><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></>,
  repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  repeat1: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /><path d="M11 10.5l1.4-1v5" /></>,
  speaker: <><polygon points="4 9 8 9 13 5 13 19 8 15 4 15" /><path d="M16.5 9a4 4 0 0 1 0 6" /></>,
  mute: <><polygon points="4 9 8 9 13 5 13 19 8 15 4 15" /><path d="M17 9.5l5 5M22 9.5l-5 5" /></>,
  speakerLoud: <><polygon points="4 9 8 9 13 5 13 19 8 15 4 15" /><path d="M16.5 9a4 4 0 0 1 0 6" /><path d="M19 6.5a8 8 0 0 1 0 11" /></>,
  warn: <><path d="M12 3 2 21h20z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="17.5" x2="12" y2="17.5" /></>,
  phone: <><rect x="6" y="3" width="12" height="18" rx="2" /><circle cx="12" cy="14" r="3" /></>,
  bt: <polyline points="6 7 18 17 12 22 12 2 18 7 6 17" />,
  headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>,
  code: <><polyline points="8 6 2 12 8 18" /><polyline points="16 6 22 12 16 18" /></>,
  text: <><line x1="5" y1="6" x2="19" y2="6" /><line x1="12" y1="6" x2="12" y2="19" /></>,
  rew: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><polyline points="4 3 4 8 9 8" /></>,
  fwd: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><polyline points="20 3 20 8 15 8" /></>,
  ab: <><line x1="5" y1="5" x2="5" y2="19" /><line x1="19" y1="5" x2="19" y2="19" /><path d="M8 12h8" /><polyline points="13 9 16 12 13 15" /></>,
  car: <><path d="M5 17h14v-5l-2-5H7l-2 5z" /><line x1="5" y1="12" x2="19" y2="12" /><circle cx="8" cy="17" r="1.6" /><circle cx="16" cy="17" r="1.6" /></>,
  move: <><path d="M4 12h14" /><polyline points="13 7 18 12 13 17" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><line x1="8.2" y1="10.8" x2="15.8" y2="7.2" /><line x1="8.2" y1="13.2" x2="15.8" y2="16.8" /></>,
  trim: <><polyline points="8 4 4 4 4 20 8 20" /><polyline points="16 4 20 4 20 20 16 20" /><line x1="9" y1="12" x2="15" y2="12" /></>,
  level: <><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="17" x2="20" y2="17" /><circle cx="9" cy="7" r="2.4" /><circle cx="15" cy="17" r="2.4" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  note: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
  lyric: <><line x1="4" y1="6" x2="14" y2="6" /><line x1="4" y1="11" x2="14" y2="11" /><line x1="4" y1="16" x2="10" y2="16" /><path d="M18 18V8l3-1" /><circle cx="16" cy="18" r="2" /></>,
  dots: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  cards: <><rect x="3" y="7" width="15" height="12" rx="2.5" /><path d="M7 4h11.5A2.5 2.5 0 0 1 21 6.5V15" /></>,
  cue: <><path d="M4 6h10M4 12h10M4 18h7" /><polygon points="17 13 22 16 17 19" fill="currentColor" stroke="none" /></>,
}
const FILLED: Record<string, React.ReactNode> = {
  play: <polygon points="7 4 20 12 7 20" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  prev: <><polygon points="19 5 9 12 19 19" /><rect x="5" y="5" width="2.6" height="14" rx="1" /></>,
  next: <><polygon points="5 5 15 12 5 19" /><rect x="16.4" y="5" width="2.6" height="14" rx="1" /></>,
  spark: <><path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" /><path d="M19 3v4M17 5h4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
}
export function Icon({ n, s = 24, w = 2.2 }: { n: string; s?: number; w?: number }) {
  if (FILLED[n]) return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{FILLED[n]}</svg>
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{STROKE[n]}</svg>
}

/* ── 앨범 그림: 있으면 쓰고, 없으면 그리지 않는다 ── */
export function useArt(t: Track | undefined): [string | undefined, (n: HTMLElement | null) => void] {
  const [src, setSrc] = useState(t?.art)
  const el = useRef<HTMLElement | null>(null)
  useEffect(() => {
    setSrc(t?.art)
    if (!t || t.art || t.nativeId == null || !el.current) return
    let alive = true
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      nativeArt(t).then((u) => { if (alive && u) setSrc(u) })
    }, { rootMargin: '200px' })
    io.observe(el.current)
    return () => { alive = false; io.disconnect() }
  }, [t])
  return [src, (n) => { el.current = n }]
}

/* ── 음량: 휴대폰은 미디어 음량, PC·브라우저는 앱 자체 음량 ── */
export const SAFE_VOLUME = 60 // 이어폰으로 들을 때 권장하는 최대 음량(%)

export function useVolume(player: Player) {
  const [sys, setSys] = useState<Volume | null>(null)
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    getVolume().then((v) => { if (v) setSys(v) })
    return onVolume((v) => { setSys(v); setFlash(Date.now()) })
  }, [])
  useEffect(() => {
    if (!flash) return
    const h = setTimeout(() => setFlash(0), 1600)
    return () => clearTimeout(h)
  }, [flash])
  const percent = sys ? Math.round((sys.value / sys.max) * 100) : Math.round(player.gain * 100)
  const set = (p: number) => {
    const q = Math.min(100, Math.max(0, p))
    if (sys) {
      const value = Math.round((q / 100) * sys.max)
      setSys({ ...sys, value })
      setVolume(value)
    } else player.setGain(q / 100)
  }
  const step = (d: 1 | -1) => (sys ? set(((sys.value + d) / sys.max) * 100) : set(percent + d * 5))
  // 스피커를 누르면 바로 소리 끄기, 다시 누르면 끄기 전 크기로
  const toggleMute = () => {
    if (percent > 0) { save('unmute', percent); set(0) } else set(load<number>('unmute', 50) || 50)
  }
  return { percent, set, step, toggleMute, flash: flash > 0, native: sys != null }
}
export type Vol = ReturnType<typeof useVolume>

/* ── 소리 나가는 곳 ── */
export function useOutput(player: Player): Output | null {
  const [out, setOut] = useState<Output | null>(null)
  const ref = useRef(player)
  ref.current = player
  const prev = useRef<Output | null>(null)
  useEffect(() => {
    const apply = (o: Output | null) => {
      if (!o) return
      // 이어폰·블루투스가 빠지면 스피커로 크게 나오지 않게 멈춘다
      if (prev.current && prev.current.kind !== 'speaker' && o.kind === 'speaker' && ref.current.playing) ref.current.pause()
      prev.current = o
      setOut(o)
    }
    getOutput().then(apply)
    return onOutput(apply)
  }, [])
  return out
}

export function outputLabel(o: Output): string {
  if (o.kind === 'bluetooth' && o.car) return o.name ? tx("차 · {0}", o.name) : tx("차 오디오")
  if (o.kind === 'bluetooth') return o.name ? tx("블루투스 · {0}", o.name) : tx("블루투스")
  if (o.kind === 'wired') return tx("이어폰")
  return tx("휴대폰 스피커")
}

export function outputIcon(o: Output): string {
  return o.kind === 'bluetooth' ? (o.car ? 'car' : 'bt') : o.kind === 'wired' ? 'headset' : 'phone'
}
