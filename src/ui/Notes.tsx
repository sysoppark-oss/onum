// 들을 때 파형 아래에서 고른 모양(음표·하트·별…)이 몽글몽글 떠오른다. 실제 음과는 상관없는 장식.
// 지금 자리의 소리 크기(미리 잰 소리 모양)가 클수록 자주, 크게 떠오른다.
import { useEffect, useRef, useState } from 'react'
import { BARS } from '../lib/shape'
import { GlyphIcon, NOTE_AMOUNTS, NOTE_COLORS, getNoteAmount, getNoteColor, getWords, shapeFor, useGlyph, wordFor } from '../lib/glyph'
import { tx } from '../lib/i18n'
import { cardName } from '../lib/church'

const TINTS = ['var(--tg-pink)', 'var(--tg-purple)', 'var(--now)', 'var(--tg-green)', 'var(--tg-orange)']
interface N { id: number; x: number; g: string; c: string; s: number; dx: number; r: number; d: number; t?: string; w?: string; big?: boolean; up?: number }

export function NoteFloat({ playing, ratio, bars }: { playing: boolean; ratio: number; bars: number[] | null }) {
  const glyph = useGlyph()
  const gRef = useRef(glyph)
  gRef.current = glyph
  const [notes, setNotes] = useState<N[]>([])
  const seq = useRef(0)
  const lastName = useRef(0)
  const lastBig = useRef(0)
  const box = useRef<HTMLSpanElement>(null)
  const live = useRef({ ratio, bars })
  live.current = { ratio, bars }
  useEffect(() => {
    if (!playing) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    // 화면 맨 위(상태 표시줄)까지의 거리: 거기까지 쭉 올라가 사라진다
    const rise = () => Math.max(60, (box.current?.getBoundingClientRect().bottom ?? 200))
    const h = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const { ratio: r, bars: b } = live.current
      const loud = b ? b[Math.min(BARS - 1, Math.max(0, Math.floor(r * BARS)))] : 0.5
      const am = NOTE_AMOUNTS.find((x) => x.id === getNoteAmount()) ?? NOTE_AMOUNTS[1]
      if (Math.random() > (0.18 + loud * 0.7) * am.k) return
      const id = ++seq.current
      // 아주 가끔, 곡에서 가장 큰 자리에서 카드 이름이 은은하게 떠오른다
      const name = cardName()
      if (name && loud > 0.82 && Date.now() - lastName.current > 45000 && Math.random() < 0.25) {
        lastName.current = Date.now()
        setNotes((old) => [...old.slice(-(am.max - 1)), { id, x: Math.min(70, Math.max(30, r * 100)), g: '', c: 'var(--brand)', s: 15, dx: 0, r: 0, d: 4200, t: name }])
        return
      }
      const col = getNoteColor() === 'mix' ? TINTS[Math.floor(Math.random() * TINTS.length)] : NOTE_COLORS.find((x) => x.id === getNoteColor())!.v
      const word = wordFor(id, tx) ?? undefined
      // 소리가 아주 세진 순간: 여러 개 대신 다섯 배쯤 큰 것 하나(몇 초에 한 번만)
      if (getWords().big && loud > 0.85 && Date.now() - lastBig.current > 6000) {
        lastBig.current = Date.now()
        setNotes((old) => [...old.slice(-(am.max - 1)), { id, x: Math.min(70, Math.max(30, r * 100)), g: shapeFor(gRef.current, id), c: col, s: (12 + loud * 8) * 3.3, dx: (Math.random() - 0.5) * 10, r: (Math.random() - 0.5) * 12, d: rise() / 80 * 1000, up: rise(), w: word, big: true }])
        return
      }
      const n: N = {
        id, x: Math.min(86, Math.max(14, r * 100 + (Math.random() - 0.5) * 6)), // 양 끝의 시간 글자와 겹치지 않게
        g: shapeFor(gRef.current, id), c: col, w: word,
        s: 12 + loud * 8 + Math.random() * 3, dx: (Math.random() - 0.5) * 22, r: (Math.random() - 0.5) * 34,
        d: rise() / (80 + Math.random() * 30) * 1000, up: rise(),
      }
      setNotes((old) => [...old.slice(-(am.max - 1)), n])
    }, 280)
    return () => window.clearInterval(h)
  }, [playing])
  const drop = (id: number) => setNotes((old) => old.filter((n) => n.id !== id))
  return (
    <span className="notes" aria-hidden="true" ref={box}>
      {notes.map((n) => (
        <i key={n.id} className={n.t ? 'nm' : n.big ? 'big' : undefined} onAnimationEnd={() => drop(n.id)}
          style={{ left: `${n.x}%`, color: n.c, fontSize: `${n.s}px`, animationDuration: `${n.d}ms`, ['--dx' as string]: `${n.dx}px`, ['--rise' as string]: `${Math.round(n.up ?? 200)}px`, ['--r' as string]: `${n.r}deg` }}>
          {n.t ? <b className="note-name">{n.t}</b> : n.w ? <b className="note-word" style={{ fontSize: `${Math.max(13, Math.round(n.s * (n.big ? 0.7 : 0.85)))}px` }}>{n.w}</b> : <GlyphIcon k={n.g} s={Math.round(n.s)} line />}
        </i>
      ))}
    </span>
  )
}
