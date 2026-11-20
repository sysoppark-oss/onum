// 「지금」 아래 탭 바로 위: 오늘의 말씀을 마디별로 제자리에서 천천히 바꿔 보여 준다.
// 글자는 움직이지 않고, 6초마다 다음 마디로 부드럽게 바뀐다. 곡이 바뀌면 처음부터.
// 바꾸기를 끄면(쉼 › 보기) 말씀 전체를 멈춘 채로 보여 준다. 누르면 크게 본다.
import { useEffect, useState } from 'react'
import { today } from '../lib/verses'

const STEP = 6000
const LAST = 8000 // 장절이 붙은 마지막 마디는 조금 더 오래

export function VerseStrip({ trackId, moving, onOpen }: { trackId?: string; moving: boolean; onOpen: () => void }) {
  const v = today()
  const parts = v.parts?.length ? v.parts : [v.text]
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false) // 누르고 있거나 초점이 있으면 멈춘다
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const run = moving && !reduce && parts.length > 1 && !held

  useEffect(() => { setI(0) }, [trackId, v.ref])
  useEffect(() => {
    if (!run) return
    const h = setTimeout(() => setI((x) => (x + 1) % parts.length), i === parts.length - 1 ? LAST : STEP)
    return () => clearTimeout(h)
  }, [i, run, parts.length])

  const last = i === parts.length - 1
  return (
    <button className="vstrip" onClick={onOpen}
      onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)} onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
      aria-label={`오늘의 말씀: ${v.text}, ${v.ref} 개역한글. 누르면 크게 봐요`}>
      {moving && !reduce && parts.length > 1 ? (
        <span key={i} className="vs-t" aria-hidden="true">
          {parts[i]}{last && <span className="vs-r"> · {v.ref}</span>}
        </span>
      ) : (
        <span className="vs-t still" aria-hidden="true">{v.text}<span className="vs-r"> · {v.ref}</span></span>
      )}
    </button>
  )
}
