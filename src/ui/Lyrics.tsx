// 가사: 음악 파일 속 가사·곡 옆 .lrc 찾기, 붙여 넣기, 가사 파일 가져오기·보내기. 시각이 붙은 LRC면 노래방처럼 따라간다.
// 인터넷에서 가사를 가져오지 않는다. 이 휴대폰 안에만 저장한다.
import { rt } from './rich'
import { useEffect, useRef, useState } from 'react'
import type { Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { findLyrics, fromPasted, linesOf, stateAt, type LyState, setLyrics, synced, toLrc, useLyrics, type Lyrics } from '../lib/lyrics'
import { isNative } from '../lib/native'
import { Share } from '@capacitor/share'
import { tx } from "../lib/i18n";
import { Icon, info } from './common'
import { Page } from './Sheets'

type Mode = 'view' | 'edit' | 'find'

export function LyricsPage({ t, player, onClose, start }: { t: Track; player: Player; onClose: () => void; start?: 'edit' }) {
  const ly = useLyrics(t)
  const [mode, setMode] = useState<Mode>(start === 'edit' ? 'edit' : ly ? 'view' : 'find')
  const [found, setFound] = useState(false)
  const x = info(t)
  // 처음 열 때 음악 파일 속 가사(또는 곡 옆 .lrc)를 먼저 찾아본다
  useEffect(() => {
    if (mode !== 'find') return
    let alive = true
    findLyrics(t).then((l) => {
      if (!alive) return
      if (l) { setLyrics(t, l); setFound(true); setMode('view') } else setMode('edit')
    })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const isCur = !!player.current && (player.current.src ?? player.current.id) === (t.src ?? t.id)
  return (
    <Page label={tx("가사 · {0}", x.song)} onClose={onClose}>
      {mode === 'find' && <p className="ly-finding" role="status">{tx("음악 파일에 든 가사를 찾고 있어요…")}</p>}
      {mode === 'edit' && <EditLyrics t={t} ly={ly} onDone={(next) => setMode(next)} />}
      {mode === 'view' && ly && <ViewLyrics t={t} ly={ly} player={player} isCur={isCur} found={found} onEdit={() => setMode('edit')} />}
    </Page>
  )
}

function EditLyrics({ t, ly, onDone }: { t: Track; ly: Lyrics | null; onDone: (m: Mode) => void }) {
  const [v, setV] = useState(ly?.text ?? '')
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { box.current?.focus() }, [])
  const n = linesOf(v).filter(Boolean).length
  const keep = (next: Mode) => {
    if (!v.trim()) return
    const l = fromPasted(ly, v)
    setLyrics(t, l)
    onDone(next)
  }
  const fromFile = async (f: File | undefined) => {
    if (!f) return
    const s = await f.text()
    if (!s.trim()) return
    setLyrics(t, fromPasted(ly, s))
    onDone('view')
  }
  return (
    <div className="ly-edit">
      <p className="say">{rt("가사를 **붙여 넣어** 주세요. 시각이 붙은 LRC 가사를 넣으면 노래를 따라 줄이 바뀌어요.")}</p>
      <textarea ref={box} className="ly-ta" value={v} onChange={(e) => setV(e.target.value)} aria-label={tx("가사")} placeholder={tx("예)\n사랑이란 말은 너무 흔해\n하지만 오늘은 말할게")} spellCheck={false} />
      <p className="hint num">{n ? tx("{0}줄 · ", n) : ''}{tx("가사는 이 휴대폰 안에만 저장되고 어디로도 보내지 않아요.")}</p>
      <button className="go" onClick={() => keep('view')} disabled={!v.trim()}>{tx("저장")}</button>
      <label className="ly-file">
        <input type="file" className="sr" accept=".lrc,.txt,text/plain" onChange={(e) => fromFile(e.target.files?.[0])} />
        <Icon n="folder" s={18} /><span>{tx("가사 파일(.lrc) 가져오기")}</span>
      </label>
      {ly && <button className="textlink ly-del" onClick={() => { setLyrics(t, null); setV('') }}>{tx("이 곡 가사 지우기")}</button>}
    </div>
  )
}

function ViewLyrics({ t, ly, player, isCur, found, onEdit }: { t: Track; ly: Lyrics; player: Player; isCur: boolean; found: boolean; onEdit: () => void }) {
  const lines = linesOf(ly.text)
  const st: LyState = isCur && synced(ly) ? stateAt(ly, player.time) : { on: -1, next: -1, gap: null, len: 0 }
  const on = st.gap != null ? -1 : st.on
  const focus = st.gap != null ? st.next : st.on // 간주 중에는 다음에 부를 줄을 가운데로
  const list = useRef<HTMLOListElement>(null)
  const touched = useRef(0)
  useEffect(() => {
    if (focus < 0 || Date.now() - touched.current < 4000) return
    const el = list.current?.querySelector(`[data-i="${focus}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [focus])
  const exportLrc = () => {
    const x = info(t)
    const text = toLrc(ly, x.song, x.singer || t.artist)
    if (isNative) { Share.share({ title: tx("{0} 가사", x.song), text }).catch(() => {}); return }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    a.download = `${x.song}.lrc`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const nudge = (d: number) => setLyrics(t, { ...ly, off: Math.round((ly.off + d) * 10) / 10 })
  return (
    <div className="ly-view" onTouchMove={() => { touched.current = Date.now() }} onWheel={() => { touched.current = Date.now() }}>
      {found && <p className="ly-note">{tx("음악 파일에 함께 들어 있던 가사를 가져왔어요.")}</p>}
      <ol className="ly-lines" ref={list}>
        {lines.flatMap((l, i) => {
          const at = ly.t[i]
          const done = st.gap != null ? st.on >= 0 && i <= st.on : on >= 0 && i < on
          const cls = 'ly-l' + (!l ? ' gap' : '') + (i === on ? ' on' : i === st.next && st.gap != null ? ' up' : done ? ' past' : '')
          const row = (
            <li key={i} data-i={i} className={cls} aria-current={i === on ? 'true' : undefined}>
              {at != null && isCur
                ? <button onClick={() => player.seek(Math.max(0, at - ly.off))} aria-label={tx("{0}, 여기부터 듣기", l)}>{l}</button>
                : <span>{l || ' '}</span>}
            </li>
          )
          return st.gap != null && i === st.next ? [<GapRow key="gap" st={st} />, row] : [row]
        })}
      </ol>
      <div className="ly-foot">
        {synced(ly) && (
          <div className="ly-off" role="group" aria-label={tx("가사와 노래 맞추기")}>
            <button onClick={() => nudge(-0.3)}>{tx("가사가 빨라요")}</button>
            <span className="num" aria-live="polite">{ly.off === 0 ? tx("맞음") : tx("{0}{1}초", ly.off > 0 ? '+' : '−', Math.abs(ly.off).toFixed(1))}</span>
            <button onClick={() => nudge(0.3)}>{tx("가사가 늦어요")}</button>
          </div>
        )}
        <div className="ly-acts">
          {isCur && <button className="mini-play" onClick={player.toggle} aria-label={player.playing ? tx("일시 정지") : tx("재생")}><Icon n={player.playing ? 'pause' : 'play'} s={22} /></button>}
          <div className="pz-tools">
            <button onClick={onEdit}><Icon n="edit" s={22} /><span>{tx("고치기")}</span></button>
            <button onClick={exportLrc}><Icon n="share" s={22} /><span>{isNative ? tx("보내기") : tx("파일로 저장")}</span></button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 「지금」 화면 안 가사 칸: 박자가 맞으면 지금 줄 둘레를, 없으면 넣는 길을 바로 보여 준다 */
export function LyricsInline({ t, player, onOpen }: { t: Track; player: Player; onOpen: (m?: 'edit') => void }) {
  const ly = useLyrics(t)
  const [looking, setLooking] = useState(!ly)
  useEffect(() => {
    if (ly) { setLooking(false); return }
    let alive = true
    setLooking(true)
    findLyrics(t).then((l) => { if (!alive) return; if (l) setLyrics(t, l); setLooking(false) })
    return () => { alive = false }
  }, [t.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const fromFile = async (f: File | undefined) => {
    if (!f) return
    const s = await f.text()
    if (s.trim()) setLyrics(t, fromPasted(ly, s))
  }
  if (!ly) {
    return (
      <div className="lyi-empty">
        {looking ? <p role="status">{tx("음악 파일에 든 가사를 찾고 있어요…")}</p> : <>
          <p>{tx("이 곡 가사를 넣어 두면 노래방처럼 지금 부르는 줄을 따라가요.")}</p>
          <div className="lyi-acts">
            <button className="pillbtn" onClick={() => onOpen('edit')}><Icon n="edit" s={18} />{tx("붙여 넣기")}</button>
            <label className="pillbtn">
              <input type="file" className="sr" accept=".lrc,.txt,text/plain" onChange={(e) => fromFile(e.target.files?.[0])} />
              <Icon n="folder" s={18} />{tx("파일 가져오기")}
            </label>
          </div>
        </>}
      </div>
    )
  }
  const lines = linesOf(ly.text)
  const sync = synced(ly)
  const st: LyState = sync ? stateAt(ly, player.time) : { on: -1, next: -1, gap: null, len: 0 }
  const on = st.gap != null ? -1 : st.on
  // 지금 줄(간주 중이면 다음 줄)을 가운데 두고 앞 1줄, 뒤 3줄(빈 줄은 건너뜀)
  const focus = st.gap != null ? st.next : st.on
  const idx = lines.map((l, i) => (l ? i : -1)).filter((i) => i >= 0)
  const at = Math.max(0, idx.findIndex((i) => i >= Math.max(focus, 0)))
  const from = Math.max(0, at - 1)
  const show = idx.slice(from, from + (st.gap != null ? 4 : 5))
  return (
    <div className="lyi">
      <ol className="lyi-lines">
        {show.flatMap((i) => {
          const done = st.gap != null ? st.on >= 0 && i <= st.on : on >= 0 && i < on
          const row = (
            <li key={i} className={i === on ? 'on' : i === st.next && st.gap != null ? 'up' : done ? 'past' : undefined} aria-current={i === on ? 'true' : undefined}>
              {sync && ly.t[i] != null
                ? <button onClick={() => player.seek(Math.max(0, ly.t[i]! - ly.off))}>{lines[i]}</button>
                : <span>{lines[i]}</span>}
            </li>
          )
          return st.gap != null && i === st.next ? [<GapRow key="gap" st={st} />, row] : [row]
        })}
      </ol>
      <div className="lyi-foot">
        <button className="more" onClick={() => onOpen()}>{tx("가사 전체 보기")}<Icon n="chev" s={16} /></button>
      </div>
    </div>
  )
}

/** 간주(전주) 줄: 다음 줄까지 남은 시간과 줄어드는 막대 — 간주가 끝나면 어디서 다시 부르는지 보여 준다 */
function GapRow({ st }: { st: LyState }) {
  const left = st.gap ?? 0
  const f = st.len > 0 ? Math.max(0, Math.min(1, left / st.len)) : 0
  return (
    <li className="lygap">
      <span className="lygap-t"><Icon n="note" s={16} />{st.on < 0 ? tx("전주") : tx("간주")}<span className="num">{tx("다음 줄까지 {0}초", Math.ceil(left))}</span></span>
      <span className="lygap-bar" aria-hidden="true"><i style={{ transform: `scaleX(${f})` }} /></span>
    </li>
  )
}
