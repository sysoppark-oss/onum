// 들을 때 파형 아래에서 음표가 몽글몽글 떠오른다. 실제 음과는 상관없는 장식.
// 지금 자리의 소리 크기(미리 잰 소리 모양)가 클수록 자주, 크게 떠오른다.
import { useEffect, useRef, useState } from 'react'
import { BARS } from '../lib/shape'

const GLYPHS = ['♪', '♫', '♩', '♬']
const TINTS = ['var(--tg-pink)', 'var(--tg-purple)', 'var(--now)', 'var(--tg-green)', 'var(--tg-orange)']
interface N { id: number; x: number; g: string; c: string; s: number; dx: number; r: number; d: number }

export function NoteFloat({ playing, ratio, bars }: { playing: boolean; ratio: number; bars: number[] | null }) {
  const [notes, setNotes] = useState<N[]>([])
  const seq = useRef(0)
  const live = useRef({ ratio, bars })
  live.current = { ratio, bars }
  useEffect(() => {
    if (!playing) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const h = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const { ratio: r, bars: b } = live.current
      const loud = b ? b[Math.min(BARS - 1, Math.max(0, Math.floor(r * BARS)))] : 0.5
      if (Math.random() > 0.18 + loud * 0.7) return
      const id = ++seq.current
      const n: N = {
        id, x: Math.min(86, Math.max(14, r * 100 + (Math.random() - 0.5) * 6)), // 양 끝의 시간 글자와 겹치지 않게
        g: GLYPHS[id % GLYPHS.length], c: TINTS[Math.floor(Math.random() * TINTS.length)],
        s: 12 + loud * 8 + Math.random() * 3, dx: (Math.random() - 0.5) * 22, r: (Math.random() - 0.5) * 34,
        d: 1500 + Math.random() * 700,
      }
      setNotes((old) => [...old.slice(-9), n])
    }, 280)
    return () => window.clearInterval(h)
  }, [playing])
  const drop = (id: number) => setNotes((old) => old.filter((n) => n.id !== id))
  return (
    <span className="notes" aria-hidden="true">
      {notes.map((n) => (
        <i key={n.id} onAnimationEnd={() => drop(n.id)}
          style={{ left: `${n.x}%`, color: n.c, fontSize: `${n.s}px`, animationDuration: `${n.d}ms`, ['--dx' as string]: `${n.dx}px`, ['--r' as string]: `${n.r}deg` }}>
          {n.g + '︎'}
        </i>
      ))}
    </span>
  )
}
