// 「지금」 아래 탭 바로 위: 오늘의 말씀이 끊기지 않고 오른쪽에서 왼쪽으로 천천히 흘러간다.
// 같은 글을 두 번 이어 붙여 한 바퀴가 이음매 없이 돌아간다. 누르고 있으면 멈추고, 누르면 크게 본다.
// 흘려 보내기를 끄거나(쉼 › 보기) 휴대폰의 움직임 줄이기가 켜져 있으면 멈춘 채 전체를 보여 준다.
import { tx } from "../lib/i18n";
import { useEffect, useRef, useState } from 'react'
import { today } from '../lib/verses'
import { shown, useKjv } from '../lib/kjv'

const SPEED = 36 // 1초에 움직이는 거리(px). 어르신이 따라 읽을 수 있는 빠르기

export function VerseStrip({ moving, onOpen }: { moving: boolean; onOpen: () => void }) {
  const v = shown(today(), useKjv())
  const one = useRef<HTMLSpanElement>(null)
  const [dur, setDur] = useState(30)
  const [held, setHeld] = useState(false)
  const downAt = useRef(0) // 길게 눌러 멈춰 읽은 뒤 손을 떼면 크게 보기를 열지 않는다(키보드는 detail 0)
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const run = moving && !reduce

  // 글 한 벌의 길이에 맞춰 한 바퀴 시간을 정한다(글자 크기가 바뀌어도 같은 빠르기)
  useEffect(() => {
    if (!run || !one.current) return
    const measure = () => { if (one.current) setDur(Math.max(8, one.current.offsetWidth / SPEED)) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(one.current)
    return () => ro.disconnect()
  }, [run, v.ref])

  const piece = (
    <>
      {v.text}<span className="vs-r"> · {v.ref}</span><span className="vs-gap" aria-hidden="true">✦</span>
    </>
  )
  return (
    <button className={'vstrip' + (run ? ' run' : '')}
      onClick={(e) => { if (e.detail === 0 || Date.now() - downAt.current < 450) onOpen() }}
      onPointerDown={() => { downAt.current = Date.now(); setHeld(true) }} onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)} onPointerLeave={() => setHeld(false)}
      onFocus={() => { downAt.current = 0; setHeld(true) }} onBlur={() => setHeld(false)}
      aria-label={tx("오늘의 말씀: {0}, {1} {2}. 누르면 크게 봐요", v.text, v.ref, v.ver)}>
      {run ? (
        <span className="vs-track" aria-hidden="true" style={{ animationDuration: `${dur}s`, animationPlayState: held ? 'paused' : 'running' }}>
          <span ref={one} className="vs-one" lang={v.lang}>{piece}</span>
          <span className="vs-one" lang={v.lang}>{piece}</span>
        </span>
      ) : (
        <span className="vs-t still" aria-hidden="true">{v.text}<span className="vs-r"> · {v.ref}</span></span>
      )}
    </button>
  )
}
