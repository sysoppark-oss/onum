// 반복 · 잠들기 · 밤 인사 · 재생 목록 · 곡 추가 · 목록 이름 · 목록 고르기
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '../lib/library'
import { RATES, XFADES, type Goodnight, type Player, type Repeat } from '../lib/usePlayer'
import { fmt } from '../lib/library'
import { ShapeBar } from './Now'
import type { Playlists } from '../lib/playlists'
import { matches } from '../lib/hangul'
import { josa, parseTitle } from '../lib/title'
import { load, save } from '../lib/store'
import { NIGHT } from '../lib/verses'
import { Icon, Layer, Sheet, VirtualList, useSwipeClose, clock, info, minutesText, nf, useDialog, whoLine } from './common'

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
      <button className={custom ? 'on' : undefined} aria-pressed={custom} onClick={onCustom}>직접</button>
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
      <label className="sr" htmlFor={id}>몇 분</label>
      <input id={id} ref={ref} type="number" inputMode="numeric" min={1} max={MAX_MIN} value={text}
        onChange={(e) => { setText(e.target.value); const n = parseInt(e.target.value, 10); if (n > 0) onChange(clampMin(n)) }}
        onBlur={() => setText(String(value))} />
      <span className="dunit">분</span>
    </span>
  )
}

/* ───────── 반복 ───────── */
type Kind = 'none' | 'one' | 'all' | 'timed' | 'part'

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
  const song = player.current ? info(player.current).song : ''
  const who = count ? `고른 ${nf.format(count)}곡` : ''
  const end = clock(Date.now() + m * 60000)

  let say: React.ReactNode
  if (kind === 'none') say = <>{count ? `${who}을` : '목록을'} <b>한 번</b> 듣고 멈춰요.</>
  else if (kind === 'one') say = <><b>{song}</b>만 계속 반복해요.</>
  else if (kind === 'part') say = <><b>{song}</b>의 <em>한 부분</em>만 계속 들어요.<br />시작과 끝을 정해 주세요.</>
  else if (kind === 'all') say = count ? <>{who}을 <b>계속</b> 반복해요.</> : <>목록이 끝나면 <b>처음부터 다시</b> 들어요.</>
  else say = <>{scope === 'one' && !count ? <><b>{song}</b>만</> : count ? `${who}을` : '목록 전체를'} <em>{minutesText(m)}</em> 동안 반복하고<br /><span className="num">{end}</span>에 멈춰요.</>

  const apply = () => {
    if (kind === 'part') { player.abStart(); onClose(); return }
    const r: Repeat =
      kind === 'none' ? { scope: 'all', limit: 'once', minutes: m }
        : kind === 'one' ? { scope: 'one', limit: 'forever', minutes: m }
          : kind === 'all' ? { scope: 'all', limit: 'forever', minutes: m }
            : { scope: count ? 'all' : scope, limit: 'timed', minutes: m }
    if (onApply) onApply(r); else player.setRepeat(r)
    onClose()
  }
  const opt = (k: Kind, title: string, side?: string) => (
    <button className={'opt' + (kind === k ? ' on' : '')} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
      <span className="r" aria-hidden="true" />{title}{side && <span className="side">{side}</span>}
    </button>
  )
  return (
    <Sheet label="반복" onClose={onClose}>
      <div>
        <h2 className="q" id="rep-h">{count ? `고른 ${nf.format(count)}곡 듣기` : '반복'}</h2>
        <p className="say" role="status">{say}</p>
      </div>
      <div className="stopq" role="radiogroup" aria-labelledby="rep-h">
        {opt('none', '반복 안 함', '한 번 듣고 멈춤')}
        {!count && opt('one', '이 곡 계속 반복')}
        {opt('all', count ? '계속 반복' : '목록 계속 반복')}
        {opt('timed', '시간 정해서 반복')}
        {!count && player.current && opt('part', '한 부분만 반복', '구간 반복')}
        {kind === 'timed' && (
          <div className="timebox">
            {!count && (
              <div className="seg2" role="group" aria-label="무엇을 반복할까요">
                <button className={scope === 'one' ? 'on' : undefined} aria-pressed={scope === 'one'} onClick={() => setScope('one')}>이 곡만</button>
                <button className={scope === 'all' ? 'on' : undefined} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>목록 전체</button>
              </div>
            )}
            <div className="tb-top">
              {custom ? <MinuteInput id="rep-min" value={m} onChange={setM} /> : <span className="big num">{minutesText(m)}</span>}
              <span className="when num">{end}까지</span>
            </div>
            <Chips label="반복할 시간" value={m} custom={custom} onPick={(v) => { setM(v); setCustom(false) }} onCustom={() => setCustom(true)} />
          </div>
        )}
      </div>
      {kind === 'timed' && <p className="hint">일시 정지한 동안은 시간을 세지 않아요. 시간이 다 되면 듣던 곡까지 듣고 멈춰요.</p>}
      <button className="go" onClick={apply}>{count ? '듣기' : kind === 'part' ? '시작과 끝 정하기' : '적용'}</button>
    </Sheet>
  )
}

/* ───────── 빠르기(강의) ───────── */
export function SpeedSheet({ player, onClose }: { player: Player; onClose: () => void }) {
  const [v, setV] = useState(player.rate || 1)
  const [each, setEach] = useState(player.rateEach)
  const say = v === 1 ? <><em>보통 빠르기</em>로 들어요.</>
    : <><em className="num">{v}배</em> {v > 1 ? '빠르게' : '느리게'} 들어요.<br />목소리 높이는 그대로예요.</>
  return (
    <Sheet label="빠르기" onClose={onClose}>
      <div>
        <h2 className="q">빠르기</h2>
        <p className="say" role="status">{say}</p>
      </div>
      <div className="chips4" role="radiogroup" aria-label="빠르기">
        {RATES.map((r) => (
          <button key={r} className={'num' + (v === r ? ' on' : '')} role="radio" aria-checked={v === r} onClick={() => setV(r)}>{r.toFixed(1)}×</button>
        ))}
      </div>
      <div className="fade">
        <span id="each-l">강의마다 빠르기를 따로 기억하기</span>
        <button className="sw" role="switch" aria-checked={each} aria-labelledby="each-l" onClick={() => setEach(!each)} />
      </div>
      <button className="go" onClick={() => { player.setRate(v, each); onClose() }}>적용</button>
    </Sheet>
  )
}

/* ───────── 잠들기 ───────── */
function BigMinutes({ m }: { m: number }) {
  const h = Math.floor(m / 60), r = m % 60
  return (
    <p className="dread num" aria-hidden="true">
      {h > 0 && <><span className="dnum">{h}</span><span className="dunit">{r ? '시간' : '시간 뒤'}</span></>}
      {(r > 0 || !h) && <><span className="dnum">{r}</span><span className="dunit">분 뒤</span></>}
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
    ? <><b>{song || '이 곡'}</b>{josa(song || '이 곡', '이', '가').slice((song || '이 곡').length)} 끝나면 멈춰요.</>
    : <><em className="num">{clock(Date.now() + m * 60000)}</em>에 {fade ? '소리를 줄이며 ' : ''}멈춰요.</>
  const book = () => { save('sleepFade', fade); player.setSleep(track ? 'track' : m, fade); onClose() }
  return (
    <Sheet label="잠들기" onClose={onClose}>
      <div>
        <h2 className="q">잠들기</h2>
        <p className="say" role="status">{say}</p>
        {s && <p className="note">지금 예약: {s.endOfTrack ? '이 곡이 끝나면' : `${clock(s.until)}에`} 멈춰요</p>}
      </div>
      <div className={'dial' + (track ? ' dim-off' : '')}>
        <button className="dbtn" onClick={() => set(m - 5)} disabled={!track && m <= 5} aria-label="5분 줄이기"><Icon n="minus" s={22} w={2.6} /></button>
        {custom && !track ? <MinuteInput id="sleep-min" value={m} onChange={(v) => setM(v)} /> : <BigMinutes m={m} />}
        <button className="dbtn" onClick={() => set(m + 5)} disabled={m >= MAX_MIN} aria-label="5분 늘리기"><Icon n="plus" s={22} w={2.6} /></button>
      </div>
      <Chips label="자주 쓰는 시간" value={track ? -1 : m} custom={custom && !track} onPick={(v) => { set(v); setCustom(false) }} onCustom={() => { setCustom(true); setTrack(false) }} />
      <button className={'opt' + (track ? ' on' : '')} aria-pressed={track} onClick={() => setTrack(!track)} disabled={!player.current}>
        <span className="r" aria-hidden="true" />시간 말고, 이 곡이 끝나면 멈추기
      </button>
      <div className="fade">
        <span id="fade-l">끝날 때 30초 동안 소리를 서서히 줄이기</span>
        <button className="sw" role="switch" aria-checked={fade} aria-labelledby="fade-l" onClick={() => setFade(!fade)} />
      </div>
      {s ? (
        <div className="nb">
          <button className="ghost" onClick={() => { player.setSleep(null); onClose() }}>예약 끄기</button>
          <button className="go" onClick={book}>바꾸기</button>
        </div>
      ) : <button className="go" onClick={book}>잠들기 예약</button>}
    </Sheet>
  )
}

/* ───────── 멈춘 뒤 밤 인사 ───────── */
export function GoodnightScreen({ g, onClose, onResume }: { g: Goodnight; onClose: () => void; onResume: () => void }) {
  const box = useDialog(onClose)
  const song = g.title ? parseTitle(g.title).song : ''
  return (
    <Layer>
    <div ref={box} tabIndex={-1} className="goodnight" data-theme="night" role="dialog" aria-modal="true" aria-labelledby="gn-h">
      <p className="nt num">{clock(g.at)}{song && ` · ${josa(song, '을', '를')} 마지막으로 멈췄어요`}</p>
      <div className="nv">
        <h2 className="nh" id="gn-h">평안한 밤 되세요</h2>
        <p className="nw">{NIGHT.text}</p>
        <p className="wr">{NIGHT.ref} · 개역한글</p>
      </div>
      <div className="nb">
        <button className="ghost" onClick={onResume}>이어서 듣기</button>
        <button className="go" onClick={onClose}>닫기</button>
      </div>
    </div>
    </Layer>
  )
}

/* ───────── 줄 고치기: 순서·빼기 ───────── */
export function EditRows({ tracks, currentId, lockCurrent, onTap, onMove, onRemove }: {
  tracks: Track[]; currentId?: string; lockCurrent?: boolean
  onTap: (i: number) => void; onMove: (i: number, dir: 1 | -1) => void; onRemove: (i: number) => void
}) {
  const items = useMemo(() => tracks.map((t, i) => ({ t, i })), [tracks])
  return (
    <VirtualList items={items} className="erows" render={({ t, i }) => {
      const x = info(t)
      const on = t.id === currentId
      return (
        <li key={t.id + i} className={on ? 'on' : undefined}>
          <button className="erow-main" aria-current={on ? 'true' : undefined} onClick={() => onTap(i)}>
            <span className="en num" aria-hidden="true">{i + 1}</span>
            <span className="x"><span className="x1">{x.song}</span><span className="x2">{whoLine(x) || ' '}</span></span>
          </button>
          <button className="eb" disabled={i === 0} onClick={() => onMove(i, -1)} aria-label={`${x.song} 위로`}><Icon n="up" s={22} /></button>
          <button className="eb" disabled={i === tracks.length - 1} onClick={() => onMove(i, 1)} aria-label={`${x.song} 아래로`}><Icon n="down" s={22} /></button>
          <button className="eb" disabled={lockCurrent && on} onClick={() => onRemove(i)} aria-label={`${x.song} 빼기`}><Icon n="x" s={22} /></button>
        </li>
      )
    }} />
  )
}

/** 겹쳐 뜨는 전체 화면 */
export function Page({ label, onClose, children, actions }: { label: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode }) {
  const box = useDialog(onClose)
  useSwipeClose(box, onClose)
  return (
    <Layer>
    <div ref={box} tabIndex={-1} className="layer" role="dialog" aria-modal="true" aria-label={label}>
      <div className="lh">
        <button className="back" onClick={onClose} aria-label="닫기"><Icon n="back" s={26} /></button>
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
    <Page label={`재생 목록 · ${nf.format(q.length)}곡`} onClose={onClose}>
      <div className="acts">
        <button className="pillbtn" onClick={() => setAdding(true)}><Icon n="plus" s={18} />곡 추가</button>
        <button className="pillbtn" onClick={() => setNaming(true)}><Icon n="list" s={18} />내 목록으로 저장</button>
      </div>
      {saved && <p className="done-note" role="status">"{saved}" 목록으로 저장했어요</p>}
      <p className="hint">곡을 누르면 바로 들어요. 지금 듣는 곡은 뺄 수 없어요.</p>
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
  const found = useMemo(() => tracks.filter((t) => {
    const x = info(t)
    return matches(x.song, q) || matches(x.singer, q) || matches(x.original, q) || matches(t.title, q)
  }), [tracks, q])
  return (
    <Sheet label="곡 추가" onClose={onClose} tall>
      <div className="sh-row">
        <h2 className="q">곡 추가</h2>
        <button className="pillbtn" onClick={onClose}>다 담았어요</button>
      </div>
      <label className="search">
        <Icon n="search" s={20} />
        <span className="sr">곡, 부른 사람 찾기</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="곡·부른 사람 (초성도 돼요)" autoComplete="off" enterKeyHint="search" />
      </label>
      {found.length === 0 && <p className="empty">맞는 곡이 없어요.</p>}
      <div className="sheet-list">
        <VirtualList items={found} className="list" render={(t) => {
          const x = info(t)
          const got = has(t.id)
          return (
            <li key={t.id}>
              <button className="lrow" disabled={got} onClick={() => { onAdd(t); bump((n) => n + 1) }}>
                <span className="x"><span className="x1">{x.song}</span><span className="x2">{whoLine(x) || ' '}</span></span>
                <span className={'tag' + (got ? ' got' : '')}>{got ? '담김' : '담기'}</span>
              </button>
            </li>
          )
        }} />
      </div>
    </Sheet>
  )
}

/** 목록 이름 적기 */
export function NameSheet({ onDone, onClose, title = '새 목록 만들기' }: { onDone: (name: string) => void; onClose: () => void; title?: string }) {
  const [name, setName] = useState('')
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
        <label className="flabel" htmlFor="list-name">목록 이름</label>
        <input id="list-name" ref={input} className="field" value={name} maxLength={30} autoComplete="off" enterKeyHint="done"
          placeholder="예: 새벽 기도 찬양" aria-invalid={err} aria-describedby={err ? 'name-err' : undefined}
          onChange={(e) => { setName(e.target.value); setErr(false) }} />
        {err && <p id="name-err" className="ferr" role="alert">이름을 적어 주세요.</p>}
        <button className="go" type="submit">만들기</button>
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
    <Sheet label="목록에 담기" onClose={onClose}>
      <h2 className="q">고른 {nf.format(ids.length)}곡을 어디에 담을까요?</h2>
      <div className="stopq">
        <button className="opt" onClick={() => setNaming(true)}><Icon n="plus" s={20} />새 목록 만들기</button>
        {lists.items.map((p) => (
          <button key={p.id} className="opt" onClick={() => { lists.add(p.id, ids); finish(p.name) }}>
            <span className="one">{p.name}</span><span className="side num">{nf.format(p.ids.length)}곡</span>
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
      <button className="num" onClick={() => set(v - 1)} aria-label={`${label} 1초 앞으로`}>−1초</button>
      <button className="num" onClick={() => set(v + 1)} aria-label={`${label} 1초 뒤로`}>+1초</button>
      {isCur && <button onClick={() => set(player.time)}>지금 자리</button>}
    </div>
  )
  if (!dur) {
    return (
      <Sheet label="시작·끝 지점" onClose={onClose}>
        <h2 className="q">시작·끝 지점</h2>
        <p className="say">이 곡의 길이를 아직 몰라요. 한 번 틀고 나서 정해 주세요.</p>
        <button className="go" onClick={onClose}>닫기</button>
      </Sheet>
    )
  }
  return (
    <Sheet label="시작·끝 지점" onClose={onClose}>
      <div>
        <h2 className="q">시작·끝 지점 · {x.song}</h2>
        <p className="say" role="status">{whole ? <>처음부터 끝까지 <b>다</b> 들어요.</> : <><em className="num">{fmt(s)}</em>부터 <em className="num">{fmt(e)}</em>까지 들어요.</>}</p>
      </div>
      <ShapeBar t={t} time={isCur ? player.time : s} duration={dur} ab={whole ? null : { a: s, b: e, n: 1 }} />
      <div className="trows">
        {row('시작', s, cs)}
        {row('끝', e, ce)}
      </div>
      <p className="hint">이 곡을 틀 때마다 이 범위만 들어요. 녹음 앞뒤의 빈 소리는 따로 건너뛰어요(쉼 › 보기).</p>
      <div className="nb">
        <button className="ghost" onClick={() => { player.setTrim(t.id, null); onClose() }}>처음부터 끝까지</button>
        <button className="go" onClick={() => { player.setTrim(t.id, { s: s > 0.5 ? s : undefined, e: e < dur - 0.5 ? e : undefined }); onClose() }}>저장</button>
      </div>
    </Sheet>
  )
}

/* ───────── 곡 사이 넘김 ───────── */
export function XfadeChips({ player }: { player: Player }) {
  return (
    <div className="chips4" role="radiogroup" aria-label="곡 사이 넘김">
      {XFADES.map((v) => (
        <button key={v} className={player.xfade === v ? 'on' : undefined} role="radio" aria-checked={player.xfade === v} onClick={() => player.setXfade(v)}>
          {v ? `${v}초` : '끊김 없이'}
        </button>
      ))}
    </div>
  )
}
