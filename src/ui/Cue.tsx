// 진행 모드(큐 리스트): 예배·행사 진행자가 쓰는 화면.
// 곡이 저절로 넘어가지 않고, 다음 곡이 대기하다가 「다음」을 누를 때만 나온다.
// 곡마다: 끝나면 멈춤/다음 곡 이어서, 들어올 때 서서히(초), 끝에서 서서히(초). 「모두 멈춤」은 2초에 줄이고 멈춘다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from '../lib/library'
import { fmt } from '../lib/library'
import type { CueSet, Player } from '../lib/usePlayer'
import { load, save } from '../lib/store'
import { tx } from '../lib/i18n'
import { isNative } from '../lib/native'
import { Icon, Sheet, info } from './common'
import { Page } from './Sheets'

const FIN = [0, 2, 5]
const FOUT = [0, 3, 5, 10]

export function CuePage({ listId, name, items, player, onClose }: { listId: string; name: string; items: Track[]; player: Player; onClose: () => void }) {
  const key = 'cue:' + listId
  const [sets, setSets] = useState<Record<string, CueSet>>(() => load(key, {}))
  const [standby, setStandby] = useState(0)
  const [locked, setLocked] = useState(false)
  const [edit, setEdit] = useState<number | null>(null)
  const [tip, setTip] = useState(() => isNative && !load('cueTip', false))
  const cur = player.cueOn && player.current && items.some((t) => t.id === player.current!.id) ? player.current : null
  const curIdx = cur ? items.findIndex((t) => t.id === cur.id) : -1

  // 진행 모드를 켜고 끈다(닫으면 평소 플레이어로)
  useEffect(() => { player.setCue(sets); }, [sets]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => player.setCue(null), []) // eslint-disable-line react-hooks/exhaustive-deps
  // 저절로 다음 곡으로 넘어갔으면 대기를 그 다음으로
  const lastIdx = useRef(-1)
  useEffect(() => {
    if (curIdx >= 0 && curIdx !== lastIdx.current) { lastIdx.current = curIdx; setStandby(Math.min(items.length, curIdx + 1)) }
  }, [curIdx, items.length])
  // 진행 중 화면이 꺼지지 않게(되는 기기에서만)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    return () => { lock?.release().catch(() => {}) }
  }, [])

  const setOf = (t: Track): CueSet => sets[t.id] || {}
  const put = (t: Track, v: CueSet) => setSets((old) => { const n = { ...old, [t.id]: { ...old[t.id], ...v } }; save(key, n); return n })

  const next = standby < items.length ? items[standby] : null
  const goTimer = useRef(0)
  const go = useCallback(() => {
    if (!next) return
    window.clearTimeout(goTimer.current)
    const startIt = () => { player.cueStart(items, next.id, setOf(next).fin || 0); setStandby(standby + 1) }
    // 듣던 곡이 있으면 0.4초에 줄이고 바로 넘긴다
    if (player.playing) { player.cueStopAll(0.4); goTimer.current = window.setTimeout(startIt, 420) }
    else startIt()
  }, [next, standby, items, player, sets]) // eslint-disable-line react-hooks/exhaustive-deps
  const stopAll = useCallback(() => { window.clearTimeout(goTimer.current); player.cueStopAll(2) }, [player])

  // PC 키보드: 스페이스 = 다음, Esc = 모두 멈춤
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select') || document.querySelector('.sheet')) return
      if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); go() }
      else if (e.key === 'Escape' && player.playing) { e.preventDefault(); e.stopPropagation(); stopAll() }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [go, stopAll, player.playing])

  // 잠금 풀기는 길게 눌러서(진행 중 실수 막기)
  const holdT = useRef(0)
  const [holding, setHolding] = useState(false)
  const lockDown = () => {
    if (!locked) { setLocked(true); return }
    setHolding(true)
    holdT.current = window.setTimeout(() => { setLocked(false); setHolding(false) }, 900)
  }
  const lockUp = () => { window.clearTimeout(holdT.current); setHolding(false) }

  const after = (t: Track) => (setOf(t).after === 'next' ? tx("이어서") : tx("멈춤"))
  const chips = (t: Track) => {
    const s = setOf(t), out = [after(t)]
    if (s.fin) out.push(tx("들어올 때 {0}초", s.fin))
    if (s.fout) out.push(tx("끝에서 {0}초", s.fout))
    return out.join(' · ')
  }
  const left = cur ? Math.max(0, player.duration - player.time) : 0
  const ratio = cur && player.duration > 0 ? player.time / player.duration : 0

  return (
    <Page label={tx("진행 모드 · {0}", name)} onClose={onClose}
      actions={<button className={'cue-lock' + (locked ? ' on' : '') + (holding ? ' hold' : '')} aria-pressed={locked}
        aria-label={locked ? tx("잠금 풀기(길게 누르기)") : tx("잠그기")}
        onPointerDown={lockDown} onPointerUp={lockUp} onPointerLeave={lockUp} onPointerCancel={lockUp}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocked(!locked) } }}>
        <Icon n={locked ? 'lock' : 'unlock'} s={20} /><span>{locked ? tx("잠김") : tx("잠그기")}</span>
      </button>}>
      {tip && (
        <div className="cue-tip" role="note">
          <span>{tx("진행 중 전화·알림 소리가 나지 않게 휴대폰의 「방해 금지」를 켜 두세요.")}</span>
          <button className="textlink" onClick={() => { setTip(false); save('cueTip', true) }}>{tx("알겠어요")}</button>
        </div>
      )}
      <section className="cue-now" aria-live="polite">
        <span className="cue-tag">{cur ? (player.playing ? tx("지금 나오는 곡") : tx("멈춤")) : tx("나오는 곡 없음")}</span>
        {cur ? (
          <>
            <b className="cue-title"><span className="cue-no num">{curIdx + 1}</span>{info(cur).song}</b>
            <div className="cue-bar" aria-hidden="true"><i style={{ width: `${ratio * 100}%` }} /></div>
            <div className="cue-times num"><span>{fmt(player.time)}</span><b>−{fmt(left)}</b></div>
            <span className="cue-after">{tx("끝나면")} · {chips(cur)}</span>
          </>
        ) : <b className="cue-title cue-dim">{tx("「다음」을 누르면 시작해요")}</b>}
      </section>
      <section className="cue-next">
        <span className="cue-tag">{tx("다음")}</span>
        <b className="cue-title">{next ? <><span className="cue-no num">{standby + 1}</span>{info(next).song}</> : <span className="cue-dim">{tx("목록 끝")}</span>}</b>
      </section>
      <div className="cue-acts">
        <button className="cue-go" onClick={go} disabled={!next} aria-keyshortcuts="Space">
          <Icon n="play" s={26} /><span>{tx("다음")}</span><kbd>Space</kbd>
        </button>
        <button className="cue-stop" onClick={stopAll} disabled={!player.playing} aria-keyshortcuts="Escape">
          <Icon n="stop" s={22} /><span>{tx("모두 멈춤")}</span><kbd>Esc</kbd>
        </button>
      </div>
      {cur && <button className="cue-pause pillbtn" onClick={player.toggle} disabled={locked}><Icon n={player.playing ? 'pause' : 'play'} s={18} />{player.playing ? tx("잠깐 멈춤") : tx("이어서 틀기")}</button>}

      <h3 className="cue-h">{tx("진행 순서")}</h3>
      <p className="hint">{locked ? tx("잠겨 있어요. 「다음」과 「모두 멈춤」만 돼요.") : tx("곡을 누르면 다음 곡으로 정해요. ⋯로 곡마다 진행 방식을 바꿔요.")}</p>
      <ol className="cue-list">
        {items.map((t, i) => (
          <li key={t.id + i} className={(i === curIdx ? 'now ' : '') + (i === standby ? 'stand' : '')}>
            <button className="cue-row" disabled={locked} onClick={() => setStandby(i)} aria-label={tx("{0}번 {1}, 다음 곡으로 정하기", i + 1, info(t).song)}>
              <span className="cue-no num">{i + 1}</span>
              <span className="cue-x"><b>{info(t).song}</b><small>{fmt(t.duration)} · {chips(t)}</small></span>
              {i === curIdx ? <em>{tx("지금")}</em> : i === standby ? <em className="st">{tx("다음")}</em> : null}
            </button>
            <button className="cue-more" disabled={locked} onClick={() => setEdit(i)} aria-label={tx("{0} 진행 방식", info(t).song)}><Icon n="dots" s={22} /></button>
          </li>
        ))}
      </ol>
      {edit != null && items[edit] && <CueSetSheet t={items[edit]} v={setOf(items[edit])} onChange={(v) => put(items[edit], v)} onClose={() => setEdit(null)} />}
    </Page>
  )
}

function CueSetSheet({ t, v, onChange, onClose }: { t: Track; v: CueSet; onChange: (v: CueSet) => void; onClose: () => void }) {
  const row = (label: string, opts: number[], cur: number, set: (n: number) => void) => (
    <div className="cue-opt">
      <span className="cue-ol">{label}</span>
      <div className="chips" role="radiogroup" aria-label={label}>
        {opts.map((n) => <button key={n} role="radio" aria-checked={cur === n} className={cur === n ? 'on' : undefined} onClick={() => set(n)}>{n ? tx("{0}초", n) : tx("없음")}</button>)}
      </div>
    </div>
  )
  return (
    <Sheet label={tx("{0} 진행 방식", info(t).song)} onClose={onClose}>
      <div>
        <h2 className="q">{info(t).song}</h2>
        <p className="cue-note">{tx("이 목록의 진행 모드에서만 쓰여요.")}</p>
      </div>
      <div className="cue-opt">
        <span className="cue-ol">{tx("이 곡이 끝나면")}</span>
        <div className="chips" role="radiogroup" aria-label={tx("이 곡이 끝나면")}>
          <button role="radio" aria-checked={v.after !== 'next'} className={v.after !== 'next' ? 'on' : undefined} onClick={() => onChange({ after: 'stop' })}>{tx("멈추고 기다리기")}</button>
          <button role="radio" aria-checked={v.after === 'next'} className={v.after === 'next' ? 'on' : undefined} onClick={() => onChange({ after: 'next' })}>{tx("다음 곡 이어서")}</button>
        </div>
      </div>
      {row(tx("들어올 때 서서히 키우기"), FIN, v.fin || 0, (n) => onChange({ fin: n }))}
      {row(tx("끝에서 서서히 줄이기"), FOUT, v.fout || 0, (n) => onChange({ fout: n }))}
      <p className="cue-note">{tx("끝 지점은 곡의 「시작·끝 지점 정하기」를 따라요. 곡 중간에서 끝내려면 거기서 끝 지점을 정해 두세요.")}</p>
      <button className="go" onClick={onClose}>{tx("다 됐어요")}</button>
    </Sheet>
  )
}
