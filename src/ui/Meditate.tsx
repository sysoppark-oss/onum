// 묵상: 듣는 음악은 그대로 흐르고, 말씀이 천천히 하나씩 바뀐다. 묵상하는 동안 화면이 꺼지지 않게 붙잡는다.
import { useEffect, useMemo, useState } from 'react'
import type { Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { MOODS, YEAR } from '../lib/verses365'
import { dayIndex } from '../lib/verses'
import { shown, useKjv } from '../lib/kjv'
import { load, save } from '../lib/store'
import { Icon, Layer, info, useDialog, useSwipeClose } from './common'

const GAPS = [20, 40, 60] // 초
type WL = { release: () => Promise<void> }

/** 화면 꺼짐 막기(되는 휴대폰에서만) */
function useWakeLock() {
  useEffect(() => {
    let lock: WL | null = null
    let alive = true
    const get = () => {
      const n = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WL> } }
      n.wakeLock?.request('screen').then((l) => { if (alive) lock = l; else l.release() }).catch(() => {})
    }
    get()
    const vis = () => { if (document.visibilityState === 'visible') get() }
    document.addEventListener('visibilitychange', vis)
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => {}) }
  }, [])
}

export function MeditatePage({ player, music, onClose }: { player: Player; music: Track[]; onClose: () => void }) {
  const box = useDialog(onClose)
  useSwipeClose(box, onClose)
  useWakeLock()
  const kjv = useKjv()
  const [mood, setMood] = useState<string>(() => load('medMood', ''))
  const [gap, setGap] = useState<number>(() => load('medGap', 40))
  const [picking, setPicking] = useState(false)
  const list = useMemo(() => {
    if (!mood) { const d = dayIndex(); return [...YEAR.slice(d), ...YEAR.slice(0, d)] }
    return YEAR.filter((v) => v.m === mood)
  }, [mood])
  const [i, setI] = useState(0)
  const [left, setLeft] = useState(gap)
  const [hold, setHold] = useState(false)
  useEffect(() => { setI(0); setLeft(gap) }, [mood, gap])
  useEffect(() => {
    if (hold) return
    const h = setInterval(() => setLeft((l) => {
      if (l > 1) return l - 1
      setI((x) => (x + 1) % list.length)
      return gap
    }), 1000)
    return () => clearInterval(h)
  }, [hold, gap, list.length])
  const go = (d: number) => { setI((x) => (x + d + list.length) % list.length); setLeft(gap) }
  const v = shown(list[i % list.length], kjv)
  const cur = player.current
  const p = cur ? info(cur) : null
  const startMusic = () => {
    if (!music.length) return
    if (!player.shuffle) player.toggleShuffle()
    player.playFrom(music, music[Math.floor(Math.random() * music.length)].id)
  }
  const moodLabel = mood ? MOODS.find((m) => m.id === mood)?.name ?? '' : '오늘부터 차례로'
  const nextGap = () => { const n = GAPS[(GAPS.indexOf(gap) + 1) % GAPS.length]; setGap(n); save('medGap', n) }

  return (
    <Layer>
      <div ref={box} tabIndex={-1} className="layer med" role="dialog" aria-modal="true" aria-label="묵상">
        <div className="med-top">
          <button className="back" onClick={onClose} aria-label="묵상 마치기"><Icon n="back" s={26} /></button>
          <button className="med-chip" onClick={() => setPicking(true)} aria-haspopup="dialog">{moodLabel}</button>
          <button className="med-chip num" onClick={nextGap} aria-label={`${gap}초마다 바뀌어요. 눌러서 바꾸기`}>{gap}초마다</button>
        </div>

        <figure className="med-v" key={`${mood}-${i}`} lang={v.lang}
          onPointerDown={() => setHold(true)} onPointerUp={() => setHold(false)} onPointerCancel={() => setHold(false)} onPointerLeave={() => setHold(false)}>
          <blockquote><p className="med-w" aria-live="polite">{v.text}</p></blockquote>
          <figcaption className="med-r">{v.ref} · {v.ver}</figcaption>
        </figure>
        <div className="med-bar" aria-hidden="true"><i style={{ transform: `scaleX(${(gap - left) / gap})` }} /></div>
        <p className="med-hint">{hold ? '손을 떼면 다시 흘러요' : '누르고 있으면 이 말씀에 머물러요'}</p>

        <div className="med-nav">
          <button className="ghost" onClick={() => go(-1)}>앞 말씀</button>
          <button className="ghost" onClick={() => go(1)}>다음 말씀</button>
        </div>

        <div className="med-music">
          {cur && p ? (
            <>
              <span className="x"><span className="x1">{p.song}</span><span className="x2">{player.playing ? '함께 흐르는 음악' : '멈춘 음악'}</span></span>
              <button className="mini-play" onClick={player.toggle} aria-label={player.playing ? '음악 일시 정지' : '음악 재생'}><Icon n={player.playing ? 'pause' : 'play'} s={22} /></button>
            </>
          ) : (
            <>
              <span className="x"><span className="x1">음악 없이 묵상하는 중</span><span className="x2">음악을 틀면 함께 흘러요</span></span>
              <button className="pillbtn small" onClick={startMusic} disabled={!music.length}>섞어 듣기</button>
            </>
          )}
        </div>

        {picking && <div className="med-dim" onClick={() => setPicking(false)} aria-hidden="true" />}
        {picking && (
          <div className="med-pick" role="dialog" aria-modal="true" aria-label="어떤 말씀으로 묵상할까요">
            <h3>어떤 말씀으로 묵상할까요</h3>
            <div className="mchips">
              <button className={!mood ? 'on' : undefined} aria-pressed={!mood} onClick={() => { setMood(''); save('medMood', ''); setPicking(false) }}>오늘부터 차례로</button>
              {MOODS.map((m) => (
                <button key={m.id} className={mood === m.id ? 'on' : undefined} aria-pressed={mood === m.id} onClick={() => { setMood(m.id); save('medMood', m.id); setPicking(false) }}>{m.name}</button>
              ))}
            </div>
            <button className="go" onClick={() => setPicking(false)}>닫기</button>
          </div>
        )}
      </div>
    </Layer>
  )
}
