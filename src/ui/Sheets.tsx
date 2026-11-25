// 반복 · 잠들기 · 밤 인사 · 재생 목록 · 곡 추가 · 목록 이름 · 목록 고르기
import { rt } from './rich'
import { setFlag } from '../lib/flag'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '../lib/library'
import { LEVELS, PRACTICE_RATES, RATES, TIMES, XFADES, type Goodnight, type Player, type Repeat } from '../lib/usePlayer'
import { fmt } from '../lib/library'
import { ShapeBar } from './Now'
import { TAGS, tagName, type Playlists, type Tag } from '../lib/playlists'
import { matches } from '../lib/hangul'
import { josa, parseTitle } from '../lib/title'
import { load, save } from '../lib/store'
import { canRescan, rescan } from '../lib/rescan'
import { getShape } from '../lib/shape'
import { NIGHT } from '../lib/verses'
import { shown, useKjv } from '../lib/kjv'
import { tx } from "../lib/i18n";
import { Icon, Layer, Sheet, VirtualList, useLongPress, useSwipeClose, clock, info, minutesText, nf, useDialog, whoLine } from './common'

const PRESETS = [15, 30, 60, 120]
const MAX_MIN = 720

/** 1~720분으로 맞춘다 */
const clampMin = (m: number) => Math.min(MAX_MIN, Math.max(1, Math.round(m) || 1))

/** 시간 칩: 15분·30분·1시간·2시간·직접 */
function Chips({ value, custom, onPick, onCustom, label }: { value: number; custom: boolean; onPick: (m: number) => void; onCustom: () => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {PRESETS.map((m) => (
        <button key={m} className={!custom && value === m ? 'on' : undefined} aria-pressed={!custom && value === m} onClick={() => onPick(m)}>{minutesText(m)}</button>
      ))}
      <button className={custom ? 'on' : undefined} aria-pressed={custom} onClick={onCustom}>{tx("직접")}</button>
    </div>
  )
}

/** 분을 직접 적는 칸 */
function MinuteInput({ value, onChange, id }: { value: number; onChange: (m: number) => void; id: string }) {
  const [text, setText] = useState(String(value))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <span className="minput">
      <label className="sr" htmlFor={id}>{tx("몇 분")}</label>
      <input id={id} ref={ref} type="number" inputMode="numeric" min={1} max={MAX_MIN} value={text}
        onChange={(e) => { setText(e.target.value); const n = parseInt(e.target.value, 10); if (n > 0) onChange(clampMin(n)) }}
        onBlur={() => setText(String(value))} />
      <span className="dunit">{tx("분")}</span>
    </span>
  )
}

/* ───────── 반복 ───────── */
type Kind = 'none' | 'one' | 'times' | 'all' | 'timed' | 'part'

function kindOf(r: Repeat): Kind {
  if (r.limit === 'timed') return 'timed'
  if (r.limit === 'forever') return r.scope === 'one' ? 'one' : 'all'
  return 'none'
}

/** count가 있으면 고른 곡을 틀기 전에 묻는 창 */
export function RepeatSheet({ player, onClose, count, onApply }: {
  player: Player; onClose: () => void; count?: number; onApply?: (r: Repeat) => void
}) {
  const cur = player.repeat
  const [kind, setKind] = useState<Kind>(count ? 'none' : kindOf(cur))
  const [scope, setScope] = useState<Repeat['scope']>(count ? 'all' : cur.limit === 'timed' ? cur.scope : 'one')
  const [m, setM] = useState(cur.minutes || 60)
  const [custom, setCustom] = useState(!PRESETS.includes(cur.minutes || 60))
  const tm = player.times && player.current && player.times.id === player.current.id ? player.times : null
  const [n, setN] = useState(tm?.n ?? 3)
  useEffect(() => { if (tm && !count) setKind('times') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const song = player.current ? info(player.current).song : ''
  const end = clock(Date.now() + m * 60000)

  let say: React.ReactNode
  // {0} 곡 이름(조사 붙음), {1} 곡 이름, {2} 고른 곡 수
  const sj = josa(song, '을', '를')
  if (kind === 'none') say = count ? rt("고른 {2}곡을 **한 번** 듣고 멈춰요.", sj, song, nf.format(count)) : rt("목록을 **한 번** 듣고 멈춰요.")
  else if (kind === 'one') say = rt("**{1}**만 계속 반복해요.", sj, song)
  else if (kind === 'times') say = <>{rt("**{0}** __{3}번__[num] 듣고\n다음 곡으로 가요.", sj, song, '', n)}{tm && <> {rt("지금 {0}번째예요.", tm.done + 1)}</>}</>
  else if (kind === 'part') say = rt("**{1}**의 __한 부분__만 계속 들어요.\n시작과 끝을 정해 주세요.", sj, song)
  else if (kind === 'all') say = count ? rt("고른 {2}곡을 **계속** 반복해요.", sj, song, nf.format(count)) : rt("목록이 끝나면 **처음부터 다시** 들어요.")
  else say = scope === 'one' && !count ? rt("**{1}**만 __{3}__ 동안 반복하고\n{4}에 멈춰요.", sj, song, '', minutesText(m), end)
    : count ? rt("고른 {2}곡을 __{3}__ 동안 반복하고\n{4}에 멈춰요.", sj, song, nf.format(count), minutesText(m), end)
    : rt("목록 전체를 __{3}__ 동안 반복하고\n{4}에 멈춰요.", sj, song, '', minutesText(m), end)

  const apply = () => {
    if (kind === 'part') { player.abStart(); onClose(); return }
    if (kind === 'times') {
      // 몇 번 듣기는 반복 설정을 바꾸지 않는다. 한 곡 반복 중이었으면 목록으로 돌려 놓는다
      if (cur.scope === 'one') player.setRepeat({ scope: 'all', limit: cur.limit === 'timed' ? 'forever' : cur.limit, minutes: cur.minutes })
      player.setTimes(n)
      onClose()
      return
    }
    if (tm) player.setTimes(null)
    const r: Repeat =
      kind === 'none' ? { scope: 'all', limit: 'once', minutes: m }
        : kind === 'one' ? { scope: 'one', limit: 'forever', minutes: m }
          : kind === 'all' ? { scope: 'all', limit: 'forever', minutes: m }
            : { scope: count ? 'all' : scope, limit: 'timed', minutes: m }
    if (onApply) onApply(r); else player.setRepeat(r)
    onClose()
  }
  const opt = (k: Kind, title: string, side?: string) => (
    <FitOpt className={'opt' + (kind === k ? ' on' : '')} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
      <span className="r" aria-hidden="true" /><span className="ot">{title}</span>{side && <span className="side">{side}</span>}
    </FitOpt>
  )
  return (
    <Sheet label={tx("반복")} onClose={onClose}>
      <div>
        <h2 className="q" id="rep-h">{count ? tx("고른 {0}곡 듣기", nf.format(count)) : tx("반복")}</h2>
        <p className="say" role="status">{say}</p>
      </div>
      <div className="stopq" role="radiogroup" aria-labelledby="rep-h">
        {opt('none', tx("반복 안 함"), tx("한 번 듣고 멈춤"))}
        {!count && opt('one', tx("이 곡 계속 반복"))}
        {!count && player.current && opt('times', tx("이 곡 몇 번 듣기"), tm ? tx("{0}/{1}번째", tm.done + 1, tm.n) : tx("듣고 다음 곡으로"))}
        {kind === 'times' && (
          <div className="timebox">
            <div className="chips4" role="radiogroup" aria-label={tx("몇 번 들을까요")}>
              {TIMES.map((v) => (
                <button key={v} className={n === v ? 'on' : undefined} role="radio" aria-checked={n === v} onClick={() => setN(v)}><span className="num">{v}</span>{tx("번")}</button>
              ))}
            </div>
          </div>
        )}
        {opt('all', count ? tx("계속 반복") : tx("목록 계속 반복"))}
        {opt('timed', tx("시간 정해서 반복"), tx("예: 이 곡 1시간"))}
        {!count && player.current && opt('part', tx("한 부분만 반복"), tx("구간 반복"))}
        {kind === 'timed' && (
          <div className="timebox">
            {!count && (
              <div className="seg2" role="group" aria-label={tx("무엇을 반복할까요")}>
                <button className={scope === 'one' ? 'on' : undefined} aria-pressed={scope === 'one'} onClick={() => setScope('one')}>{tx("이 곡만")}</button>
                <button className={scope === 'all' ? 'on' : undefined} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>{tx("목록 전체")}</button>
              </div>
            )}
            <div className="tb-top">
              {custom ? <MinuteInput id="rep-min" value={m} onChange={setM} /> : <span className="big num">{minutesText(m)}</span>}
              <span className="when num">{end}{tx("까지")}</span>
            </div>
            <Chips label={tx("반복할 시간")} value={m} custom={custom} onPick={(v) => { setM(v); setCustom(false) }} onCustom={() => setCustom(true)} />
          </div>
        )}
      </div>
      {kind === 'timed' && <p className="hint">{tx("일시 정지한 동안은 시간을 세지 않아요. 시간이 다 되면 듣던 곡까지 듣고 멈춰요.")}</p>}
      <button className="go" onClick={apply}>{count ? tx("듣기") : kind === 'part' ? tx("시작과 끝 정하기") : tx("적용")}</button>
    </Sheet>
  )
}

/* ───────── 빠르기(강의) ───────── */
export function SpeedSheet({ player, onClose }: { player: Player; onClose: () => void }) {
  const [v, setV] = useState(player.rate || 1)
  const [each, setEach] = useState(player.rateEach)
  const [quiet, setQuiet] = useState(player.quietOn)
  const say = v === 1 ? rt("__보통 빠르기__로 들어요.")
    : v > 1 ? rt("__{0}배__[num] 빠르게 들어요.\n목소리 높이는 그대로예요.", v) : rt("__{0}배__[num] 느리게 들어요.\n목소리 높이는 그대로예요.", v)
  return (
    <Sheet label={tx("빠르기")} onClose={onClose}>
      <div>
        <h2 className="q">{tx("빠르기")}</h2>
        <p className="say" role="status">{say}</p>
      </div>
      <div className="chips4" role="radiogroup" aria-label={tx("빠르기")}>
        {RATES.map((r) => (
          <button key={r} className={'num' + (v === r ? ' on' : '')} role="radio" aria-checked={v === r} onClick={() => setV(r)}>{r.toFixed(1)}×</button>
        ))}
      </div>
      <div className="fade">
        <span id="each-l">{tx("강의마다 빠르기를 따로 기억하기")}</span>
        <button className="sw" role="switch" aria-checked={each} aria-labelledby="each-l" onClick={() => setEach(!each)} />
      </div>
      <div className="fade">
        <span id="quiet-l">{tx("말 사이 쉼 줄이기")}<small>{tx("말이 멈춘 긴 쉼만 빠르게 지나가요. 말은 그대로예요")}</small></span>
        <button className="sw" role="switch" aria-checked={quiet} aria-labelledby="quiet-l" onClick={() => setQuiet(!quiet)} />
      </div>
      <button className="go" onClick={() => { player.setRate(v, each); setFlag('quietSkip', quiet); onClose() }}>{tx("적용")}</button>
    </Sheet>
  )
}

/* ───────── 잠들기 ───────── */
function BigMinutes({ m }: { m: number }) {
  const h = Math.floor(m / 60), r = m % 60
  return (
    <p className="dread num" aria-hidden="true">
      {h > 0 && <><span className="dnum">{h}</span><span className="dunit">{r ? tx("시간") : tx("시간 뒤")}</span></>}
      {(r > 0 || !h) && <><span className="dnum">{r}</span><span className="dunit">{tx("분 뒤")}</span></>}
    </p>
  )
}

export function SleepSheet({ player, onClose }: { player: Player; onClose: () => void }) {
  const s = player.sleep
  const left = s && !s.endOfTrack ? Math.max(5, Math.round(player.sleepLeft / 60000 / 5) * 5) : 30
  const [m, setM] = useState(left)
  const [custom, setCustom] = useState(false)
  const [track, setTrack] = useState(!!s?.endOfTrack)
  const [fade, setFade] = useState<boolean>(() => s?.fade ?? load('sleepFade', true))
  const song = player.current ? info(player.current).song : ''
  const set = (v: number) => { setM(clampMin(v)); setTrack(false) }

  const say = track
    ? (song ? rt("**{0}** 끝나면 멈춰요.", josa(song, '이', '가'), song) : rt("**이 곡이** 끝나면 멈춰요."))
    : fade ? rt("__{0}__[num]에 소리를 줄이며 멈춰요.", clock(Date.now() + m * 60000)) : rt("__{0}__[num]에 멈춰요.", clock(Date.now() + m * 60000))
  const book = () => { save('sleepFade', fade); player.setSleep(track ? 'track' : m, fade); onClose() }
  return (
    <Sheet label={tx("잠들기")} onClose={onClose}>
      <div>
        <h2 className="q">{tx("잠들기")}</h2>
        <p className="say" role="status">{say}</p>
        {s && <p className="note">{tx("지금 예약: ")}{s.endOfTrack ? tx("이 곡이 끝나면") : tx("{0}에", clock(s.until))} {tx("멈춰요")}</p>}
      </div>
      <div className={'dial' + (track ? ' dim-off' : '')}>
        <button className="dbtn" onClick={() => set(m - 5)} disabled={!track && m <= 5} aria-label={tx("5분 줄이기")}><Icon n="minus" s={22} w={2.6} /></button>
        {custom && !track ? <MinuteInput id="sleep-min" value={m} onChange={(v) => setM(v)} /> : <BigMinutes m={m} />}
        <button className="dbtn" onClick={() => set(m + 5)} disabled={m >= MAX_MIN} aria-label={tx("5분 늘리기")}><Icon n="plus" s={22} w={2.6} /></button>
      </div>
      <Chips label={tx("자주 쓰는 시간")} value={track ? -1 : m} custom={custom && !track} onPick={(v) => { set(v); setCustom(false) }} onCustom={() => { setCustom(true); setTrack(false) }} />
      <FitOpt className={'opt' + (track ? ' on' : '')} aria-pressed={track} onClick={() => setTrack(!track)} disabled={!player.current}>
        <span className="r" aria-hidden="true" /><span className="ot">{tx("시간 말고, 이 곡이 끝나면 멈추기")}</span></FitOpt>
      <div className="fade">
        <span id="fade-l">{tx("끝날 때 30초 동안 소리를 서서히 줄이기")}</span>
        <button className="sw" role="switch" aria-checked={fade} aria-labelledby="fade-l" onClick={() => setFade(!fade)} />
      </div>
      {s ? (
        <div className="nb">
          <button className="ghost" onClick={() => { player.setSleep(null); onClose() }}>{tx("예약 끄기")}</button>
          <button className="go" onClick={book}>{tx("바꾸기")}</button>
        </div>
      ) : <button className="go" onClick={book}>{tx("잠들기 예약")}</button>}
    </Sheet>
  )
}

/* ───────── 멈춘 뒤 밤 인사 ───────── */
export function GoodnightScreen({ g, onClose, onResume }: { g: Goodnight; onClose: () => void; onResume: () => void }) {
  const box = useDialog(onClose)
  const song = g.title ? parseTitle(g.title).song : ''
  const nv = shown(NIGHT, useKjv())
  return (
    <Layer>
    <div ref={box} tabIndex={-1} className="goodnight" data-theme="night" role="dialog" aria-modal="true" aria-labelledby="gn-h">
      <p className="nt num">{clock(g.at)}{song && tx(" · {0} 마지막으로 멈췄어요", josa(song, '을', '를'), song)}</p>
      <div className="nv">
        <h2 className="nh" id="gn-h">{tx("평안한 밤 되세요")}</h2>
        <p className="nw" lang={nv.lang}>{nv.text}</p>
        <p className="wr">{nv.ref} · {nv.ver}</p>
      </div>
      <div className="nb">
        <button className="ghost" onClick={onResume}>{tx("이어서 듣기")}</button>
        <button className="go" onClick={onClose}>{tx("닫기")}</button>
      </div>
    </div>
    </Layer>
  )
}

/* ───────── 줄 고치기: 순서·빼기 ───────── */
export function EditRows({ tracks, currentId, lockCurrent, onTap, onMove, onRemove, tagOf, onLong }: {
  tracks: Track[]; currentId?: string; lockCurrent?: boolean
  onTap: (i: number) => void; onMove: (i: number, dir: 1 | -1) => void; onRemove: (i: number) => void
  tagOf?: (t: Track) => Tag | undefined; onLong?: (i: number) => void
}) {
  const items = useMemo(() => tracks.map((t, i) => ({ t, i })), [tracks])
  const lp = useLongPress()
  return (
    <VirtualList items={items} className="erows" render={({ t, i }) => {
      const x = info(t)
      const on = t.id === currentId
      return (
        <li key={t.id + i} className={on ? 'on' : undefined}>
          <button className="erow-main" aria-current={on ? 'true' : undefined} onClick={() => onTap(i)} {...(onLong ? lp(() => onLong(i)) : {})}>
            <span className="en num" aria-hidden="true">{i + 1}</span>
            {tagOf && <i className={'ctag ' + (tagOf(t) ?? 'none')} aria-hidden="true" />}
            <span className="x"><span className="x1">{x.song}</span><span className="x2">{tagOf?.(t) ? <span className="sr">{tagName(tagOf(t))} {tx("표시, ")}</span> : null}{whoLine(x) || ' '}</span></span>
          </button>
          <button className="eb" disabled={i === 0} onClick={() => onMove(i, -1)} aria-label={tx("{0} 위로", x.song)}><Icon n="up" s={22} /></button>
          <button className="eb" disabled={i === tracks.length - 1} onClick={() => onMove(i, 1)} aria-label={tx("{0} 아래로", x.song)}><Icon n="down" s={22} /></button>
          <button className="eb" disabled={lockCurrent && on} onClick={() => onRemove(i)} aria-label={tx("{0} 빼기", x.song)}><Icon n="x" s={22} /></button>
        </li>
      )
    }} />
  )
}

/** 겹쳐 뜨는 전체 화면 */
/** 고르기 줄: 한 줄에 들어가면 그대로, 넘치면(다른 언어 등) 설명을 제목 아래로 내리고 제목도 줄을 바꾼다 */
function FitOpt(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      el.classList.remove('stack')
      const over = el.scrollWidth > el.clientWidth + 1 || [...el.querySelectorAll<HTMLElement>('.ot,.side')].some((c) => c.scrollWidth > c.clientWidth + 1)
      el.classList.toggle('stack', over)
    }
    check()
    const ro = new ResizeObserver(() => { if (el.clientWidth) check() })
    ro.observe(el.parentElement ?? el)
    return () => ro.disconnect()
  }, [])
  return <button ref={ref} {...props} />
}

export function Page({ label, onClose, children, actions, className }: { label: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  const box = useDialog(onClose)
  useSwipeClose(box, onClose)
  // 제목이 두 줄로도 다 안 들어가면 오른쪽 단추를 아이콘만 남겨 자리를 내준다
  const lh = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = lh.current, h = el?.querySelector('h2')
    if (!el || !h || !actions) return
    const check = () => { el.classList.remove('tight'); el.classList.toggle('tight', h.scrollHeight > h.clientHeight + 1) }
    check()
    const ro = new ResizeObserver(check); ro.observe(el)
    return () => ro.disconnect()
  }, [label, !!actions]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Layer>
    <div ref={box} tabIndex={-1} className={className ? `layer ${className}` : "layer"} role="dialog" aria-modal="true" aria-label={label}>
      <div className="lh" ref={lh}>
        <button className="back" onClick={onClose} aria-label={tx("닫기")}><Icon n="back" s={26} /></button>
        <h2>{label}</h2>
        {actions}
      </div>
      <div className="lb">{children}</div>
    </div>
    </Layer>
  )
}

/** 지금 듣는 목록: 바로 고르기·추가·빼기·순서 바꾸기 */
export function QueuePage({ player, tracks, lists, onClose }: { player: Player; tracks: Track[]; lists: Playlists; onClose: () => void }) {
  const [adding, setAdding] = useState(false)
  const [naming, setNaming] = useState(false)
  const [saved, setSaved] = useState('')
  const closeAdding = useCallback(() => setAdding(false), [])
  const closeNaming = useCallback(() => setNaming(false), [])
  const q = player.queueTracks
  const inQueue = useMemo(() => new Set(q.map((t) => t.id)), [q])
  return (
    <Page label={tx("재생 목록 · {0}곡", nf.format(q.length))} onClose={onClose}>
      <div className="acts">
        <button className="pillbtn" onClick={() => setAdding(true)}><Icon n="plus" s={18} />{tx("곡 추가")}</button>
        <button className="pillbtn" onClick={() => setNaming(true)}><Icon n="list" s={18} />{tx("내 목록으로 저장")}</button>
      </div>
      {saved && <p className="done-note" role="status">"{saved}{tx("\" 목록으로 저장했어요")}</p>}
      <p className="hint">{tx("곡을 누르면 바로 들어요. 지금 듣는 곡은 뺄 수 없어요.")}</p>
      <EditRows tracks={q} currentId={player.current?.id} lockCurrent onTap={player.jump} onMove={player.move} onRemove={player.removeAt} />
      {adding && <AddSongs tracks={tracks} has={(id) => inQueue.has(id)} onAdd={(t) => player.enqueue([t])} onClose={closeAdding} />}
      {naming && <NameSheet onClose={closeNaming} onDone={(name) => { lists.create(name, q.map((t) => t.id)); setSaved(name) }} />}
    </Page>
  )
}

/** 곡을 찾아 하나씩 담는 창 */
export function AddSongs({ tracks, has, onAdd, onClose }: { tracks: Track[]; has: (id: string) => boolean; onAdd: (t: Track) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [, bump] = useState(0)
  // 휴대폰에 새로 받은 곡이 있으면 열 때 바로 찾아 온다
  const [look, setLook] = useState<'idle' | 'busy' | number>('idle')
  const find = useCallback(async (force: boolean) => { setLook('busy'); setLook(await rescan(force)) }, [])
  useEffect(() => { if (canRescan()) find(false) }, [find])
  // 최근 이레 안에 받은 곡을 맨 위에 따로(찾는 글자가 없을 때)
  const fresh = useMemo(() => {
    const since = Date.now() - 7 * 864e5
    return new Set(tracks.filter((t) => t.added > since).sort((a, b) => b.added - a.added).slice(0, 12).map((t) => t.id))
  }, [tracks])
  const found = useMemo(() => {
    const f = tracks.filter((t) => {
      const x = info(t)
      return matches(x.song, q) || matches(x.singer, q) || matches(x.original, q) || matches(t.title, q)
    })
    // 찾는 글자가 없으면 최근 받은 곡을 맨 위로
    if (q || !fresh.size) return f
    return [...f.filter((t) => fresh.has(t.id)).sort((a, b) => b.added - a.added), ...f.filter((t) => !fresh.has(t.id))]
  }, [tracks, q, fresh])
  return (
    <Sheet label={tx("곡 추가")} onClose={onClose} tall>
      <div className="sh-row">
        <h2 className="q">{tx("곡 추가")}</h2>
        <button className="pillbtn" onClick={onClose}>{tx("다 담았어요")}</button>
      </div>
      <label className="search">
        <Icon n="search" s={20} />
        <span className="sr">{tx("곡, 부른 사람 찾기")}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("곡·부른 사람 (초성도 돼요)")} autoComplete="off" enterKeyHint="search" />
      </label>
      {canRescan() && (
        <div className="rescan">
          <span aria-live="polite">{look === 'busy' ? tx("새로 받은 곡을 찾는 중…") : typeof look === 'number' && look > 0 ? tx("새로 받은 곡 {0}곡을 찾았어요", look) : tx("휴대폰에 새로 받은 곡도 여기 나와요")}</span>
          <button className="textlink" onClick={() => find(true)} disabled={look === 'busy'}>{tx("다시 찾기")}</button>
        </div>
      )}
      {found.length === 0 && <p className="empty">{tx("맞는 곡이 없어요.")}</p>}
      {found.length === 0 && canRescan() && <p className="hint-s">{tx("방금 받은 곡이 안 보이면 「다시 찾기」를 눌러 보세요. 30초보다 짧은 곡과 「가져올 폴더」에서 뺀 폴더의 곡은 나오지 않아요.")}</p>}
      <div className="sheet-list">
        <VirtualList items={found} className="list" render={(t) => {
          const x = info(t)
          const got = has(t.id)
          return (
            <li key={t.id}>
              <button className="lrow" disabled={got} onClick={() => { onAdd(t); bump((n) => n + 1) }}>
                <span className="x"><span className="x1">{!q && fresh.has(t.id) && <b className="newb">{tx("새 곡")}</b>}{x.song}</span><span className="x2">{whoLine(x) || ' '}</span></span>
                <span className={'tag' + (got ? ' got' : '')}>{got ? tx("담김") : tx("담기")}</span>
              </button>
            </li>
          )
        }} />
      </div>
    </Sheet>
  )
}

/** 목록 이름 적기 */
export function NameSheet({ onDone, onClose, title = tx("새 목록 만들기"), initial = '', done = tx("만들기"), placeholder = tx("예: 새벽 기도 찬양") }: { onDone: (name: string) => void; onClose: () => void; title?: string; initial?: string; done?: string; placeholder?: string }) {
  const [name, setName] = useState(initial)
  const [err, setErr] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) { setErr(true); input.current?.focus(); return }
    onDone(n)
    onClose()
  }
  return (
    <Sheet label={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <h2 className="q">{title}</h2>
        <label className="flabel" htmlFor="list-name">{tx("이름")}</label>
        <input id="list-name" ref={input} className="field" value={name} maxLength={30} autoComplete="off" enterKeyHint="done"
          placeholder={placeholder} aria-invalid={err} aria-describedby={err ? 'name-err' : undefined}
          onChange={(e) => { setName(e.target.value); setErr(false) }} />
        {err && <p id="name-err" className="ferr" role="alert">{tx("이름을 적어 주세요.")}</p>}
        <button className="go" type="submit">{done}</button>
      </form>
    </Sheet>
  )
}

/** 고른 곡을 어느 목록에 담을지 */
export function ChooseListSheet({ lists, ids, onClose, onDone }: { lists: Playlists; ids: string[]; onClose: () => void; onDone: (name: string) => void }) {
  const [naming, setNaming] = useState(false)
  const closeNaming = useCallback(() => setNaming(false), [])
  const finish = (name: string) => { onDone(name); onClose() }
  return (
    <Sheet label={tx("목록에 담기")} onClose={onClose}>
      <h2 className="q">{tx("고른 {0}곡을 어디에 담을까요?", nf.format(ids.length))}</h2>
      <div className="stopq">
        <button className="opt" onClick={() => setNaming(true)}><Icon n="plus" s={20} />{tx("새 목록 만들기")}</button>
        {lists.items.map((p) => (
          <button key={p.id} className="opt" onClick={() => { lists.add(p.id, ids); finish(p.name) }}>
            <span className="one">{p.name}</span><span className="side num">{nf.format(p.ids.length)}{tx("곡")}</span>
          </button>
        ))}
      </div>
      {naming && <NameSheet onClose={closeNaming} onDone={(name) => { lists.create(name, ids); finish(name) }} />}
    </Sheet>
  )
}

/* ───────── 곡별 시작·끝 지점 ───────── */
export function TrimSheet({ t, player, onClose }: { t: Track; player: Player; onClose: () => void }) {
  const isCur = player.current?.id === t.id
  const dur = isCur && player.duration > 0 ? player.duration : t.duration
  const tr = player.trims[t.id] || {}
  const [s, setS] = useState(tr.s ?? 0)
  const [e, setE] = useState(Math.min(tr.e ?? dur, dur))
  const x = info(t)
  const cs = (v: number) => setS(Math.max(0, Math.min(v, e - 2)))
  const ce = (v: number) => setE(Math.min(dur, Math.max(v, s + 2)))
  const whole = s <= 0.5 && e >= dur - 0.5
  const row = (label: string, v: number, set: (v: number) => void) => (
    <div className="trow">
      <span>{label}<b className="num">{fmt(v)}</b></span>
      <button className="num" onClick={() => set(v - 1)} aria-label={tx("{0} 1초 앞으로", label)}>{tx("−1초")}</button>
      <button className="num" onClick={() => set(v + 1)} aria-label={tx("{0} 1초 뒤로", label)}>{tx("+1초")}</button>
      {isCur && <button onClick={() => set(player.time)}>{tx("지금 자리")}</button>}
    </div>
  )
  if (!dur) {
    return (
      <Sheet label={tx("시작·끝 지점")} onClose={onClose}>
        <h2 className="q">{tx("시작·끝 지점")}</h2>
        <p className="say">{tx("이 곡의 길이를 아직 몰라요. 한 번 틀고 나서 정해 주세요.")}</p>
        <button className="go" onClick={onClose}>{tx("닫기")}</button>
      </Sheet>
    )
  }
  return (
    <Sheet label={tx("시작·끝 지점")} onClose={onClose}>
      <div>
        <h2 className="q">{tx("시작·끝 지점 · ")}{x.song}</h2>
        <p className="say" role="status">{whole ? rt("처음부터 끝까지 **다** 들어요.") : rt("__{0}__[num]부터 __{1}__[num]까지 들어요.", fmt(s), fmt(e))}</p>
      </div>
      <ShapeBar t={t} time={isCur ? player.time : s} duration={dur} ab={whole ? null : { a: s, b: e, n: 1 }} />
      <div className="trows">
        {row(tx("시작"), s, cs)}
        {row(tx("끝"), e, ce)}
      </div>
      <p className="hint">{tx("이 곡을 틀 때마다 이 범위만 들어요. 녹음 앞뒤의 빈 소리는 따로 건너뛰어요(쉼 › 보기).")}</p>
      <div className="nb">
        <button className="ghost" onClick={() => { player.setTrim(t.id, null); onClose() }}>{tx("처음부터 끝까지")}</button>
        <button className="go" onClick={() => { player.setTrim(t.id, { s: s > 0.5 ? s : undefined, e: e < dur - 0.5 ? e : undefined }); onClose() }}>{tx("저장")}</button>
      </div>
    </Sheet>
  )
}

/* ───────── 곡 사이 넘김 ───────── */
export function XfadeChips({ player }: { player: Player }) {
  return (
    <div className="chips4" role="radiogroup" aria-label={tx("곡 사이 넘김")}>
      {XFADES.map((v) => (
        <button key={v} className={player.xfade === v ? 'on' : undefined} role="radio" aria-checked={player.xfade === v} onClick={() => player.setXfade(v)}>
          {v ? tx("{0}초", v) : tx("끊김 없이")}
        </button>
      ))}
    </div>
  )
}

/* ───────── 곡별 소리 크기 ───────── */
const LEVEL_NAME: Record<string, string> = { '-6': tx("많이 작게"), '-3': tx("조금 작게"), '0': tx("원래대로"), '3': tx("조금 크게"), '6': tx("많이 크게") }
export function LevelSheet({ t, player, onClose }: { t: Track; player: Player; onClose: () => void }) {
  const [, redraw] = useState(0)
  useEffect(() => { let alive = true; getShape(t).then(() => { if (alive) redraw((v) => v + 1) }); return () => { alive = false } }, [t])
  const v = player.levels[t.id] ?? 0
  const i = Math.max(0, LEVELS.indexOf(v))
  const room = player.headroom(t)
  const canUp = i < LEVELS.length - 1 && LEVELS[i + 1] <= room + 0.5
  const [full, setFull] = useState(false)
  const x = info(t)
  const isCur = player.current?.id === t.id
  const step = (d: 1 | -1) => {
    if (d === 1 && !canUp) { setFull(true); return }
    setFull(false)
    const ni = Math.min(LEVELS.length - 1, Math.max(0, i + d))
    player.setLevel(t.id, LEVELS[ni])
  }
  return (
    <Sheet label={tx("이 곡 소리 크기")} onClose={onClose}>
      <div>
        <h2 className="q">{tx("이 곡 소리 크기 · ")}{x.song}</h2>
        <p className="say" role="status">
          {full ? rt("이 곡은 이미 **가장 크게** 나와요.\n더 키우려면 휴대폰 소리를 올려 주세요.")
            : v === 0 ? rt("다른 곡과 **같은 크기**로 들어요.") : rt("이 곡만 **{0}** 들어요.", LEVEL_NAME[String(v)])}
        </p>
      </div>
      <div className="lvl">
        <button onClick={() => step(-1)} disabled={i === 0} aria-label={tx("작게")}><Icon n="minus" s={26} /></button>
        <div className="lvl-mid" aria-hidden="true">
          <b>{LEVEL_NAME[String(v)]}</b>
          <span className="dots">{LEVELS.map((l, k) => <i key={l} className={(k === i ? 'on' : '') + (l > room + 0.5 ? ' no' : '')} />)}</span>
        </div>
        <button onClick={() => step(1)} aria-disabled={!canUp} className={canUp ? undefined : 'full'} aria-label={tx("크게")}><Icon n="plus" s={26} /></button>
      </div>
      <p className="hint">{isCur ? tx("누르는 대로 바로 바뀌어요. ") : ''}{tx("이 곡을 틀 때마다 이 크기로 들어요. 휴대폰 소리 크기는 그대로예요.")}</p>
      <div className="nb">
        {v !== 0 && <button className="ghost" onClick={() => { player.setLevel(t.id, 0); setFull(false) }}>{tx("원래대로")}</button>}
        <button className="go" onClick={onClose}>{tx("닫기")}</button>
      </div>
    </Sheet>
  )
}

/* ───────── 연습: 빠르기와 키(음악) ───────── */
const keyName = (k: number) => (k === 0 ? tx("원래 키") : `${k > 0 ? '+' : '−'}${Math.abs(k)}`)
export function PracticeSheet({ t, player, onClose }: { t: Track; player: Player; onClose: () => void }) {
  const id = t.src ?? t.id
  const pr = player.current && (player.current.src ?? player.current.id) === id ? player.practice : null
  const [r, setR] = useState(pr?.r ?? 1)
  const [k, setK] = useState(pr?.k ?? 0)
  const x = info(t)
  // 누르는 대로 바로 들려 준다
  const apply = (nr: number, nk: number) => { setR(nr); setK(nk); player.setPractice(id, { r: nr, k: nk }) }
  const ri = PRACTICE_RATES.indexOf(r)
  const say = r === 1 && k === 0 ? <>{tx("원래 ")}<b>{tx("빠르기와 키")}</b>{tx("로 들어요.")}</>
    : <>{r !== 1 && <><em className="num">{r}{tx("배")}</em> {r < 1 ? tx("느리게") : tx("빠르게")}</>}{r !== 1 && k !== 0 && ', '}{k !== 0 && <>{tx("키는 ")}<em className="num">{Math.abs(k)}</em> {k > 0 ? tx("높게") : tx("낮게")}</>} {tx("들어요.")}</>
  return (
    <Sheet label={tx("빠르기와 키")} onClose={onClose}>
      <div>
        <h2 className="q">{tx("빠르기와 키 · ")}{x.song}</h2>
        <p className="say" role="status">{say}</p>
      </div>
      <div className="prow">
        <span className="pl-l">{tx("빠르기")}</span>
        <div className="lvl">
          <button onClick={() => apply(PRACTICE_RATES[Math.max(0, ri - 1)], k)} disabled={ri <= 0} aria-label={tx("느리게")}><Icon n="minus" s={24} /></button>
          <div className="lvl-mid" aria-hidden="true"><b className="num">{r.toFixed(1)}×</b></div>
          <button onClick={() => apply(PRACTICE_RATES[Math.min(PRACTICE_RATES.length - 1, ri + 1)], k)} disabled={ri >= PRACTICE_RATES.length - 1} aria-label={tx("빠르게")}><Icon n="plus" s={24} /></button>
        </div>
      </div>
      <div className="prow">
        <span className="pl-l">{tx("키")}<small>{tx("반음씩")}</small></span>
        <div className="lvl">
          <button onClick={() => apply(r, Math.max(-6, k - 1))} disabled={k <= -6} aria-label={tx("키 반음 낮추기")}><Icon n="minus" s={24} /></button>
          <div className="lvl-mid" aria-hidden="true"><b className="num">{keyName(k)}</b></div>
          <button onClick={() => apply(r, Math.min(6, k + 1))} disabled={k >= 6} aria-label={tx("키 반음 올리기")}><Icon n="plus" s={24} /></button>
        </div>
      </div>
      <p className="hint">{tx("빠르기를 바꿔도 키는 그대로, 키를 바꿔도 빠르기는 그대로예요. 이 곡을 틀 때마다 이대로 들어요.")}</p>
      <div className="nb">
        {(r !== 1 || k !== 0) && <button className="ghost" onClick={() => apply(1, 0)}>{tx("원래대로")}</button>}
        <button className="go" onClick={onClose}>{tx("닫기")}</button>
      </div>
    </Sheet>
  )
}

/* ───────── 목록 메모 ───────── */
export function MemoSheet({ name, memo, onDone, onClose }: { name: string; memo: string; onDone: (m: string) => void; onClose: () => void }) {
  const [v, setV] = useState(memo)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const b = box.current; if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length) } }, [])
  return (
    <Sheet label={tx("목록 메모")} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onDone(v); onClose() }}>
        <h2 className="q">{tx("메모 · ")}{name}</h2>
        <label className="flabel" htmlFor="list-memo">{tx("이 목록에 남길 말")}</label>
        <textarea id="list-memo" ref={box} className="field memo" value={v} maxLength={300} rows={4}
          placeholder={tx("예: 수요 예배 특송. 세 번째 곡은 2절까지만")} onChange={(e) => setV(e.target.value)} aria-describedby="memo-n" />
        <p id="memo-n" className="hint num">{v.length}{tx("/300자 · 이 휴대폰에만 남아요")}</p>
        <div className="nb">
          {memo && <button type="button" className="ghost" onClick={() => { onDone(''); onClose() }}>{tx("메모 지우기")}</button>}
          <button className="go" type="submit">{tx("저장")}</button>
        </div>
      </form>
    </Sheet>
  )
}

/* ───────── 곡 색 표시 ───────── */
export function TagSheet({ t, tag, onPick, onClose }: { t: Track; tag?: Tag; onPick: (k: Tag | null) => void; onClose: () => void }) {
  const x = info(t)
  const pick = (k: Tag | null) => { onPick(k); onClose() }
  return (
    <Sheet label={tx("곡 색 표시")} onClose={onClose}>
      <div>
        <h2 className="q" id="tag-h">{tx("색 표시 · ")}{x.song}</h2>
        <p className="say">{tx("이 목록 안에서만 보여요. 순서나 할 일을 눈에 띄게 해 두세요.")}</p>
      </div>
      <div className="stopq" role="radiogroup" aria-labelledby="tag-h">
        <button className={'opt' + (!tag ? ' on' : '')} role="radio" aria-checked={!tag} onClick={() => pick(null)}><span className="r" aria-hidden="true" />{tx("표시 안 함")}</button>
        {TAGS.map((g) => (
          <button key={g.k} className={'opt' + (tag === g.k ? ' on' : '')} role="radio" aria-checked={tag === g.k} onClick={() => pick(g.k)}>
            <span className="r" aria-hidden="true" /><i className={'ctag ' + g.k} aria-hidden="true" />{g.name}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
