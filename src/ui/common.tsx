// 여러 화면이 함께 쓰는 것: 창 다루기, 긴 목록, 아이콘, 곡 정보, 그림, 음량, 소리 나가는 곳
import { useEffect, useRef, useState } from 'react'
import type { Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { parseTitle, type Parsed } from '../lib/title'
import { getOutput, getVolume, nativeArt, onOutput, onVolume, setVolume, type Output, type Volume } from '../lib/native'

export const nf = new Intl.NumberFormat('ko-KR')

export function minutesText(m: number): string {
  const h = Math.floor(m / 60), r = Math.round(m % 60)
  return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`
}

/** 12시간제 시각: 오전 5:10 */
export function clock(ms: number, withAmPm = true): string {
  const d = new Date(ms)
  const h = d.getHours(), m = d.getMinutes()
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${withAmPm ? (h < 12 ? '오전 ' : '오후 ') : ''}${hh}:${String(m).padStart(2, '0')}`
}

/* ── 곡 정보: 제목 풀이는 곡마다 한 번만 ── */
const parsedMemo = new Map<string, Parsed>()
export function info(t: Track): Parsed {
  let p = parsedMemo.get(t.id)
  if (!p) {
    p = parseTitle(t.title, t.artist)
    if (!p.song) p = { ...p, song: '제목 없는 곡' }
    parsedMemo.set(t.id, p)
  }
  return p
}

/** "김수아 · 원곡 윤상" */
export function whoLine(p: Parsed): string {
  return [p.singer, p.original && `원곡 ${p.original}`].filter(Boolean).join(' · ')
}

/** "우리들의 발라드 · 4회" */
export function fromLine(p: Parsed, t: Track): string {
  if (p.program) return [p.program, p.episode].filter(Boolean).join(' · ')
  return t.album
}

/* ── 창: 초점 가두기, 뒤로 버튼·Esc로 닫기 ── */
export const closers: (() => void)[] = []
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
    <div className="dim" onClick={onClose}>
      <div ref={box} tabIndex={-1} className={'sheet' + (tall ? ' tall' : '')} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <span className="grab" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}

/** 긴 목록: 보이는 줄과 그 위아래 몇 줄만 그린다. rowRem: 한 줄 높이(rem) */
export function VirtualList<T>({ items, render, rowRem = 4, className = 'list' }: {
  items: T[]; render: (item: T, i: number) => React.ReactNode; rowRem?: number; className?: string
}) {
  const ref = useRef<HTMLUListElement>(null)
  const [range, setRange] = useState({ from: 0, to: 24 })
  useEffect(() => {
    let raf = 0
    const calc = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const rowH = parseFloat(getComputedStyle(document.documentElement).fontSize) * rowRem
      const top = el.getBoundingClientRect().top
      const from = Math.max(0, Math.floor(-top / rowH) - 8)
      const to = Math.min(items.length, Math.ceil((window.innerHeight - top) / rowH) + 8)
      setRange((r) => (r.from === from && r.to === to ? r : { from, to }))
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
  const from = Math.min(range.from, items.length)
  const to = Math.min(Math.max(range.to, from), items.length)
  return (
    <ul ref={ref} className={className} style={{ paddingTop: `${from * rowRem}rem`, paddingBottom: `${(items.length - to) * rowRem}rem` }}>
      {items.slice(from, to).map((it, k) => render(it, from + k))}
    </ul>
  )
}

/* ── 아이콘: 선 굵기·끝 처리 통일 ── */
const STROKE: Record<string, React.ReactNode> = {
  plus: <><line x1="5" y1="12" x2="19" y2="12" /><line x1="12" y1="5" x2="12" y2="19" /></>,
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
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
  speakerLoud: <><polygon points="4 9 8 9 13 5 13 19 8 15 4 15" /><path d="M16.5 9a4 4 0 0 1 0 6" /><path d="M19 6.5a8 8 0 0 1 0 11" /></>,
  warn: <><path d="M12 3 2 21h20z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="17.5" x2="12" y2="17.5" /></>,
  phone: <><rect x="6" y="3" width="12" height="18" rx="2" /><circle cx="12" cy="14" r="3" /></>,
  bt: <polyline points="6 7 18 17 12 22 12 2 18 7 6 17" />,
  headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>,
  code: <><polyline points="8 6 2 12 8 18" /><polyline points="16 6 22 12 16 18" /></>,
  text: <><line x1="5" y1="6" x2="19" y2="6" /><line x1="12" y1="6" x2="12" y2="19" /></>,
}
const FILLED: Record<string, React.ReactNode> = {
  play: <polygon points="7 4 20 12 7 20" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  prev: <><polygon points="19 5 9 12 19 19" /><rect x="5" y="5" width="2.6" height="14" rx="1" /></>,
  next: <><polygon points="5 5 15 12 5 19" /><rect x="16.4" y="5" width="2.6" height="14" rx="1" /></>,
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
  return { percent, set, step, flash: flash > 0, native: sys != null }
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
  if (o.kind === 'bluetooth') return o.name ? `블루투스 · ${o.name}` : '블루투스'
  if (o.kind === 'wired') return '이어폰'
  return '휴대폰 스피커'
}

export function outputIcon(o: Output): string {
  return o.kind === 'bluetooth' ? 'bt' : o.kind === 'wired' ? 'headset' : 'phone'
}
