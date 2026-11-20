// 가사: 붙여 넣기 → 박자 맞추기(줄이 시작될 때 누르기) → 노래방처럼 따라가기.
// 인터넷에서 가사를 가져오지 않는다. 이 휴대폰 안에만 저장한다.
import { useEffect, useRef, useState } from 'react'
import type { Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { lineAt, linesOf, setLyrics, synced, useLyrics, withText, type Lyrics } from '../lib/lyrics'
import { fmt } from '../lib/library'
import { Icon, info } from './common'
import { Page } from './Sheets'

type Mode = 'view' | 'edit' | 'sync'

export function LyricsPage({ t, player, onClose }: { t: Track; player: Player; onClose: () => void }) {
  const ly = useLyrics(t)
  const [mode, setMode] = useState<Mode>(ly ? 'view' : 'edit')
  const x = info(t)
  const isCur = !!player.current && (player.current.src ?? player.current.id) === (t.src ?? t.id)
  return (
    <Page label={`가사 · ${x.song}`} onClose={onClose}>
      {mode === 'edit' && <EditLyrics t={t} ly={ly} onDone={(next) => setMode(next)} />}
      {mode === 'sync' && ly && <SyncLyrics t={t} ly={ly} player={player} onDone={() => setMode('view')} />}
      {mode === 'view' && ly && <ViewLyrics t={t} ly={ly} player={player} isCur={isCur} onEdit={() => setMode('edit')} onSync={() => setMode('sync')} />}
    </Page>
  )
}

function EditLyrics({ t, ly, onDone }: { t: Track; ly: Lyrics | null; onDone: (m: Mode) => void }) {
  const [v, setV] = useState(ly?.text ?? '')
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { box.current?.focus() }, [])
  const n = linesOf(v).filter(Boolean).length
  const keep = (next: Mode) => { setLyrics(t, v.trim() ? withText(ly, v) : null); onDone(v.trim() ? next : 'edit') }
  return (
    <div className="ly-edit">
      <p className="say">가사를 <b>붙여 넣어</b> 주세요. 한 줄씩 나눠 있으면 좋아요.</p>
      <textarea ref={box} className="ly-ta" value={v} onChange={(e) => setV(e.target.value)} aria-label="가사" placeholder={'예)\n사랑이란 말은 너무 흔해\n하지만 오늘은 말할게'} spellCheck={false} />
      <p className="hint num">{n ? `${n}줄 · ` : ''}가사는 이 휴대폰 안에만 저장되고 어디로도 보내지 않아요.</p>
      <div className="nb">
        <button className="ghost" onClick={() => keep('view')} disabled={!v.trim()}>저장</button>
        <button className="go" onClick={() => keep('sync')} disabled={!v.trim()}>박자 맞추기</button>
      </div>
      {ly && <button className="textlink ly-del" onClick={() => { setLyrics(t, null); setV('') }}>이 곡 가사 지우기</button>}
    </div>
  )
}

/** 노래를 들으며 줄이 시작될 때 누른다 */
function SyncLyrics({ t, ly, player, onDone }: { t: Track; ly: Lyrics; player: Player; onDone: () => void }) {
  const lines = linesOf(ly.text)
  const real = lines.map((l, i) => (l ? i : -1)).filter((i) => i >= 0)
  const [k, setK] = useState(0) // real 안의 다음 줄
  const times = useRef<(number | null)[]>(lines.map(() => null))
  const isCur = !!player.current && (player.current.src ?? player.current.id) === (t.src ?? t.id)
  // 처음부터 들려준다
  useEffect(() => {
    if (!isCur) player.playFrom([t], t.id, 0, true)
    else { player.seek(t.clip?.s ?? 0); if (!player.playing) player.play() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const save = (done: boolean) => {
    const tt = lines.map((_, i) => times.current[i] ?? (done ? null : ly.t[i] ?? null))
    setLyrics(t, { ...ly, t: tt, off: 0 })
  }
  const tap = () => {
    const i = real[k]
    if (i == null) return
    times.current[i] = Math.max(0, player.time - 0.15) // 누르는 데 걸리는 짧은 시간만큼 앞당긴다
    if (k + 1 >= real.length) { save(true); onDone() } else setK(k + 1)
  }
  const back = () => {
    if (k === 0) return
    const i = real[k - 1]
    const at = times.current[i]
    times.current[i] = null
    setK(k - 1)
    player.seek(Math.max(0, (at ?? player.time) - 3))
  }
  const cur = real[k] != null ? lines[real[k]] : ''
  const prev = k > 0 ? lines[real[k - 1]] : ''
  const after = real[k + 1] != null ? lines[real[k + 1]] : ''
  return (
    <div className="ly-sync">
      <p className="hint num">{k + 1} / {real.length}줄 · <span>{fmt(player.time)}</span></p>
      <div className="ly-cards" aria-live="polite">
        <p className="ly-prev">{prev || ' '}</p>
        <p className="ly-cur">{cur}</p>
        <p className="ly-after">{after || ' '}</p>
      </div>
      <button className="ly-tap" onClick={tap}>이 줄이 시작될 때 누르기</button>
      <div className="nb">
        <button className="ghost" onClick={back} disabled={k === 0}>한 줄 되돌리기</button>
        <button className="ghost" onClick={() => { save(false); onDone() }}>여기까지 저장</button>
      </div>
      <p className="hint">노래를 들으며 줄이 시작되는 순간 큰 버튼을 누르세요. 틀리면 되돌리면 돼요.</p>
    </div>
  )
}

function ViewLyrics({ t, ly, player, isCur, onEdit, onSync }: { t: Track; ly: Lyrics; player: Player; isCur: boolean; onEdit: () => void; onSync: () => void }) {
  const lines = linesOf(ly.text)
  const on = isCur && synced(ly) ? lineAt(ly, player.time) : -1
  const list = useRef<HTMLOListElement>(null)
  const touched = useRef(0)
  useEffect(() => {
    if (on < 0 || Date.now() - touched.current < 4000) return
    const el = list.current?.children[on] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [on])
  const nudge = (d: number) => setLyrics(t, { ...ly, off: Math.round((ly.off + d) * 10) / 10 })
  return (
    <div className="ly-view" onTouchMove={() => { touched.current = Date.now() }} onWheel={() => { touched.current = Date.now() }}>
      {!synced(ly) && (
        <div className="ly-tip">
          <p>박자를 맞추면 노래방처럼 지금 부르는 줄을 따라가요.</p>
          <button className="pillbtn small" onClick={onSync}>박자 맞추기</button>
        </div>
      )}
      <ol className="ly-lines" ref={list}>
        {lines.map((l, i) => {
          const at = ly.t[i]
          const cls = 'ly-l' + (!l ? ' gap' : '') + (i === on ? ' on' : on >= 0 && i < on ? ' past' : '')
          return (
            <li key={i} className={cls} aria-current={i === on ? 'true' : undefined}>
              {at != null && isCur
                ? <button onClick={() => player.seek(Math.max(0, at - ly.off))} aria-label={`${l}, 여기부터 듣기`}>{l}</button>
                : <span>{l || ' '}</span>}
            </li>
          )
        })}
      </ol>
      <div className="ly-foot">
        {synced(ly) && (
          <div className="ly-off" role="group" aria-label="가사와 노래 맞추기">
            <button onClick={() => nudge(-0.3)}>가사가 빨라요</button>
            <span className="num" aria-live="polite">{ly.off === 0 ? '맞음' : `${ly.off > 0 ? '+' : '−'}${Math.abs(ly.off).toFixed(1)}초`}</span>
            <button onClick={() => nudge(0.3)}>가사가 늦어요</button>
          </div>
        )}
        <div className="ly-acts">
          {isCur && <button className="mini-play" onClick={player.toggle} aria-label={player.playing ? '일시 정지' : '재생'}><Icon n={player.playing ? 'pause' : 'play'} s={22} /></button>}
          <button className="textlink" onClick={onEdit}>가사 고치기</button>
          <button className="textlink" onClick={onSync}>{synced(ly) ? '박자 다시 맞추기' : '박자 맞추기'}</button>
        </div>
      </div>
    </div>
  )
}
