// 「지금」: 곡 · 소리 모양 · 조작 · 음량 · 흐름(앞으로 무엇이 언제) · 오늘의 한 문장
import { rt } from './rich'
import { useCallback, useEffect, useState } from 'react'
import { fmt, type Track } from '../lib/library'
import type { AB, Player } from '../lib/usePlayer'
import { byLecture, lectureOf } from '../lib/kind'
import { askNearby, type Output } from '../lib/native'
import { load, save } from '../lib/store'
import { BARS, cachedShape, getShape, type Shape } from '../lib/shape'
import type { Playlists } from '../lib/playlists'
import { Icon, SAFE_VOLUME, clock, fromLine, info, minutesText, nf, outputIcon, outputLabel, secText, whoLine, type Vol } from './common'
import { LyricsInline, LyricsPage } from './Lyrics'
import { LevelSheet, PracticeSheet, QueuePage, RepeatSheet, SpeedSheet, TrimSheet } from './Sheets'
import { NoteFloat } from './Notes'
import { ChooseEditSheet } from './Edits'
import type { Edits } from '../lib/edits'
import { tx } from "../lib/i18n";
import { useFlag } from '../lib/flag'

/* ── 소리 모양 ── */
export function ShapeBar({ t, time, duration, onSeek, ab, mark }: { t: Track; time: number; duration: number; onSeek?: (s: number) => void; ab?: AB | null; mark?: number | null }) {
  const [shape, setShape] = useState<Shape | null | undefined>(() => cachedShape(t))
  useEffect(() => {
    let alive = true
    const hit = cachedShape(t)
    setShape(hit)
    if (!hit) getShape(t).then((s) => { if (alive) setShape(s) })
    return () => { alive = false }
  }, [t])
  const ratio = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0
  const bars = shape?.bars ?? null
  const hook = shape?.hook ?? null
  return (
    <div className={'shape' + (bars ? '' : ' wait')}>
      {Array.from({ length: BARS }, (_, i) => (
        <i key={`${t.id}-${bars ? 1 : 0}-${i}`} className={(i / BARS < ratio ? 'done' : '') + (bars ? ' in' : '')}
          style={{ height: `${(bars ? bars[i] : 0.14) * 100}%`, ['--i' as string]: i }} />
      ))}
      {ab && duration > 0 && (
        <>
          <span className={'band' + (ab.b == null ? ' open' : '')} aria-hidden="true"
            style={{ left: `${(ab.a / duration) * 100}%`, right: ab.b == null ? 0 : `${100 - (ab.b / duration) * 100}%` }} />
          <span className={'mk num' + (ab.a / duration < 0.12 ? ' b' : '')} aria-hidden="true" style={{ left: `${(ab.a / duration) * 100}%` }}>{fmt(ab.a)}</span>
          {ab.b != null && (ab.b - ab.a) / duration > 0.14 && <span className="mk b num" aria-hidden="true" style={{ left: `${(ab.b / duration) * 100}%` }}>{fmt(ab.b)}</span>}
        </>
      )}
      {!ab && mark != null && duration > 0 && (
        <>
          <span className="bmk" aria-hidden="true" style={{ left: `${(mark / duration) * 100}%` }} />
          <span className={'mk num' + (mark / duration < 0.12 ? ' b' : '')} aria-hidden="true" style={{ left: `${(mark / duration) * 100}%` }}>↺ {fmt(mark)}</span>
        </>
      )}
      {!ab && mark == null && hook != null && !t.talk && <span className="hook" aria-hidden="true" style={{ left: `${Math.min(88, Math.max(12, hook * 100))}%` }}>{tx("후렴(추정)")}</span>}
      <span className="head" aria-hidden="true" style={{ left: `${ratio * 100}%` }} />
      {onSeek && (
        <input type="range" className="scrub" min={0} max={Math.max(1, Math.floor(duration))} step={1} value={Math.floor(time)}
          onChange={(e) => onSeek(+e.target.value)} aria-label={tx("재생 위치")}
          aria-valuetext={tx("{0}, 전체 {1}", fmt(time), fmt(duration))} />
      )}
    </div>
  )
}

/* ── 음량 ── */
export function VolumeRow({ vol, loud, guide, onCar }: { vol: Vol; loud: boolean; guide: boolean; onCar?: () => void }) {
  const p = vol.percent
  return (
    <>
      <div className={'vol' + (loud ? ' over' : '') + (vol.flash ? ' flash' : '')}>
        <button className={'ico' + (p === 0 ? ' muted' : '')} onClick={vol.toggleMute} aria-label={p === 0 ? tx("소리 다시 켜기") : tx("소리 끄기")} aria-pressed={p === 0}>
          <Icon n={p === 0 ? 'mute' : p > SAFE_VOLUME ? 'speakerLoud' : 'speaker'} s={22} />
        </button>
        <div className="track">
          {guide && <i className="safe" style={{ left: `${SAFE_VOLUME}%` }} aria-hidden="true" />}
          <b style={{ width: `${p}%` }} />
          <s style={{ left: `${p}%` }} />
          <input type="range" min={0} max={100} step={1} value={p} onChange={(e) => vol.set(+e.target.value)}
            aria-label={tx("음량")} aria-valuetext={`${p}%${loud ? tx(", 권장 음량 넘음") : ''}`} />
        </div>
        <span className="val num" aria-hidden="true">{p === 0 ? tx("꺼짐") : `${p}%`}</span>
      </div>
      {loud && (
        <div className="warnrow">
          <p className="warn" role="status"><Icon n="warn" s={15} w={2.6} />{tx("이어폰 권장 음량({0}%)을 넘었어요", SAFE_VOLUME)}</p>
          {onCar && <button className="carq" onClick={onCar}>{tx("차 스피커예요")}</button>}
        </div>
      )}
    </>
  )
}

/* ── 반복 버튼의 짧은 말 ── */
function repeatShort(p: Player): { label: string; on: boolean; one: boolean } {
  const r = p.repeat
  const tm = p.times && p.current && p.times.id === p.current.id ? p.times : null
  if (tm && r.scope !== 'one') return { label: tx("{0}/{1}번", tm.done + 1, tm.n), on: true, one: true }
  if (r.limit === 'timed') return { label: minutesText(Math.max(1, Math.ceil(p.repeatLeft / 60000))) + (r.scope === 'one' ? tx(" 한 곡") : ''), on: true, one: r.scope === 'one' }
  if (r.limit === 'forever') return { label: r.scope === 'one' ? tx("한 곡 반복") : tx("목록 반복"), on: true, one: r.scope === 'one' }
  return { label: tx("반복"), on: false, one: false }
}

/* ── 흐름: 앞으로 무엇이 언제 ── */
interface Row { kind: 'next' | 'rep' | 'stop' | 'end'; at: number | null; title: string; sub: string; jump?: number }
interface Flow { rows: Row[]; more: string }

function buildFlow(p: Player, now: number): Flow {
  const cur = p.current!
  const q = p.queueTracks
  const bd = p.bounds(cur, p.duration)
  const dur = bd.to || p.duration || cur.duration || 0
  const loop = Math.max(1, dur - bd.from) // 한 곡 반복 한 바퀴 길이(시작·끝 지점 반영)
  const len = (t: Track) => { const b = p.bounds(t); return b.to > 0 ? Math.max(0, b.to - b.from - p.xfade) : 0 }
  const known = dur > 0
  const endCur = now + Math.max(0, dur - p.time - (p.repeat.scope === 'one' ? 0 : p.xfade)) * 1000
  const r = p.repeat
  const s = p.sleep
  const ci = info(cur)
  const sleepAt = s ? (s.endOfTrack ? endCur : s.until) : Infinity
  const sleepRow = (at: number): Row => ({
    kind: 'stop', at,
    title: s!.endOfTrack ? tx("이 곡이 끝나면 멈춰요") : s!.fade ? tx("소리를 줄이며 멈춰요") : tx("멈춰요"),
    sub: s!.fade && !s!.endOfTrack ? tx("30초 동안 서서히 작아져요") : tx("잠들기 예약"),
  })
  const timedEnd = r.limit === 'timed' ? now + p.repeatLeft : Infinity
  const listLabel = tx("재생 목록 {0}곡 보기", nf.format(q.length))

  // 한 곡 반복
  if (r.scope === 'one') {
    if (r.limit === 'once') return { rows: [{ kind: 'end', at: known ? endCur : null, title: tx("이 곡이 끝나면 멈춰요"), sub: tx("반복 안 함") }], more: listLabel }
    if (s?.endOfTrack) return { rows: [sleepRow(endCur)], more: listLabel }
    const stopAt = Math.min(sleepAt, timedEnd)
    const finite = isFinite(stopAt) && known
    // 정해진 때 전에 시작하는 횟수
    const n = finite ? Math.max(0, Math.ceil((stopAt - endCur) / (loop * 1000))) : 0
    const rows: Row[] = [{
      kind: 'rep', at: known ? endCur : null,
      title: r.limit === 'timed' ? tx("{0} · {1} 반복", ci.song, minutesText(r.minutes)) : tx("{0} · 한 곡 계속 반복", ci.song),
      sub: !finite ? tx("멈출 때까지 계속 들어요") : n ? tx("{0} 전까지 약 {1}번 더 들어요", sleepAt <= timedEnd ? tx("잠들기") : tx("정한 시간"), n) : tx("이번이 마지막이에요"),
    }]
    if (sleepAt <= timedEnd && s) rows.push(sleepRow(sleepAt))
    else if (isFinite(timedEnd)) rows.push({ kind: 'stop', at: known ? endCur + n * loop * 1000 : null, title: tx("반복을 마치고 멈춰요"), sub: tx("듣던 곡까지 듣고 멈춰요") })
    return { rows, more: listLabel }
  }

  // 이 곡 몇 번 듣기: 남은 횟수만큼 다시 듣고 나서 목록으로
  const tm = p.times && p.times.id === cur.id ? p.times : null
  const again = tm ? Math.max(0, tm.n - tm.done - 1) : 0
  const repRow: Row | null = again > 0 ? {
    kind: 'rep', at: known ? now + Math.max(0, dur - p.time) * 1000 : null,
    title: tx("{0} · {1}번째", ci.song, tm!.done + 2), sub: again > 1 ? tx("{0}번 더 듣고 다음 곡으로", again) : tx("한 번 더 듣고 다음 곡으로"),
  } : null

  // 목록
  const ahead: { t: Track; at: number | null; i: number }[] = []
  const firstAt: number | null = known ? (again > 0 ? now + (Math.max(0, dur - p.time) + again * loop - p.xfade) * 1000 : endCur) : null
  let at = firstAt
  for (let i = p.index + 1; i < q.length; i++) {
    ahead.push({ t: q[i], at, i })
    at = at != null && len(q[i]) > 0 ? at + len(q[i]) * 1000 : null
  }
  const listEnd = at
  let wrap = false
  if (!ahead.length && r.limit !== 'once' && q.length > 0) {
    // 마지막 곡: 처음으로 돌아간다
    wrap = true
    if (!p.shuffle) ahead.push({ t: q[0], at: firstAt, i: 0 })
  }
  const cutAt = Math.min(sleepAt, timedEnd)
  const playable = ahead.filter((a) => a.at == null || a.at < cutAt)
  const stop: Row | null =
    s && sleepAt <= timedEnd && (sleepAt < (listEnd ?? Infinity) || r.limit !== 'once') ? sleepRow(sleepAt)
      : isFinite(timedEnd) ? { kind: 'stop', at: playable.length < ahead.length ? ahead[playable.length].at : listEnd, title: tx("반복을 마치고 멈춰요"), sub: tx("듣던 곡까지 듣고 멈춰요") }
        : null
  const room = Math.max(1, (stop ? 1 : 2) + extraRow() - (repRow ? 1 : 0))
  const shown = playable.slice(0, room)
  const rows: Row[] = shown.map((a) => {
    const x = info(a.t)
    return { kind: 'next', at: a.at, title: x.song, sub: whoLine(x) || fromLine(x, a.t) || ' ', jump: a.i }
  })
  if (repRow) rows.unshift(repRow)
  if (wrap && p.shuffle && !stop) rows.push({ kind: 'end', at: firstAt, title: tx("처음부터 다시 섞어 들어요"), sub: tx("목록 계속 반복") })
  if (!playable.length && !stop && r.limit === 'once') rows.push({ kind: 'end', at: known ? endCur : null, title: tx("이 곡이 끝나면 멈춰요"), sub: tx("마지막 곡이에요") })
  if (stop) rows.push(stop)
  const rest = playable.length - shown.length
  let more = listLabel
  if (rest > 0 && !wrap) {
    const endAt = playable.length === ahead.length && listEnd != null ? listEnd : null
    more = tx("그다음 {0}곡", nf.format(rest)) + (endAt != null && !stop ? tx(" · {0}에 목록 끝", clock(endAt, false)) : '')
  }
  return { rows, more }
}

/** 키 큰 화면(아래 말씀 줄을 빼고도 자리가 남으면)은 다음 곡을 한 줄 더 */
const extraRow = () => (window.innerHeight >= 860 ? 1 : 0)

/** 강의: 다음 강의들과 시작 시각(빠르기 반영) */
function buildTalkFlow(p: Player, now: number): Flow {
  const cur = p.current!
  const q = p.queueTracks
  const r = p.rate || 1
  const dur = p.duration || cur.duration || 0
  const endCur = now + (Math.max(0, dur - p.time) / r) * 1000
  const s = p.sleep
  const sleepAt = s ? (s.endOfTrack ? endCur : s.until) : Infinity
  const rows: Row[] = []
  let at: number | null = dur > 0 ? endCur : null
  let rest = 0
  for (let i = p.index + 1; i < q.length; i++) {
    const t = q[i]
    if (at != null && at >= sleepAt) { rest += q.length - i; break }
    if (rows.length < (s ? 1 : 2) + extraRow()) {
      const l = lectureOf(t)
      rows.push({ kind: 'next', at, title: l.no ? `${l.no} · ${l.name}` : l.name, sub: [t.folder, t.duration ? minutesText(Math.round(t.duration / 60)) : ''].filter(Boolean).join(' · '), jump: i })
    } else rest++
    const left = t.duration > 0 ? t.duration - (p.talkDone[t.id] ? 0 : p.talkPos[t.id] ?? 0) : 0
    at = at != null && left > 0 ? at + (left / r) * 1000 : null
  }
  if (!rows.length && !s) rows.push({ kind: 'end', at: dur > 0 ? endCur : null, title: tx("이 강의가 끝나면 멈춰요"), sub: tx("마지막 강의예요") })
  if (s) rows.push({ kind: 'stop', at: sleepAt, title: s.endOfTrack ? tx("이 강의가 끝나면 멈춰요") : s.fade ? tx("소리를 줄이며 멈춰요") : tx("멈춰요"), sub: s.fade && !s.endOfTrack ? tx("30초 동안 서서히 작아져요") : tx("잠들기 예약") })
  return { rows, more: rest > 0 ? tx("{0} · 남은 {1}강", cur.folder, nf.format(rest)) : tx("재생 목록 {0}개 보기", nf.format(q.length)) }
}

/** 구간 반복: 시작 정하기 → 끝 정하기 → 반복 중 */
function AbBar({ player, edits }: { player: Player; edits: Edits }) {
  const g = player.ab!
  const [miss, setMiss] = useState(false)
  const [save, setSave] = useState(false)
  const [saved, setSaved] = useState('')
  const cur = player.current
  if (g.b == null) {
    return (
      <section className="abbar" aria-label={tx("구간 반복")}>
        <p className="sr" role="status">{tx("구간 반복: {0}부터 시작했어요. 끝낼 자리에서 여기까지를 누르세요.", fmt(g.a))}</p>
        <p className="say2" aria-hidden="true">{rt("__{0}__[num]부터 듣고 있어요.\n끝낼 자리에서 「여기까지」를 누르세요.", fmt(g.a))}</p>
        <div className="ab2">
          <button className="set" onClick={player.abStart} aria-label={tx("시작을 지금 자리로 다시 정하기, 지금 시작 {0}", fmt(g.a))}>{tx("여기부터")}<small className="num">{fmt(g.a)}</small></button>
          <button className="next" onClick={() => setMiss(!player.abEnd())}>{tx("여기까지")}<small className="num">{tx("지금 ")}{fmt(player.time)}</small></button>
        </div>
        <button className="quick" onClick={() => setMiss(!player.abSpan(10))}>{rt("__{0}__[num]부터 10초만 반복", fmt(g.a))}</button>
        {miss && <p className="ferr" role="alert">{tx("시작보다 1초 넘게 지난 뒤에 눌러 주세요.")}</p>}
        <div className="abx"><span className="t2">{tx("막대를 끌어 자리를 옮긴 뒤 눌러도 돼요")}</span><button onClick={player.abClear}>{tx("그만두기")}</button></div>
      </section>
    )
  }
  return (
    <section className="abbar" aria-label={tx("구간 반복")}>
      <p className="sr" role="status">{tx("{0}부터 {1}까지 구간을 계속 들어요.", fmt(g.a), fmt(g.b))}</p>
      <p className="say2" aria-hidden="true">{rt("__{0}__ 구간을 계속 들어요 · {1}번째", secText(g.b - g.a), g.n)}</p>
      <div className="fine2">
        <div><span>{tx("시작")}<b className="num">{fmt(g.a)}</b></span>
          <button className="num" onClick={() => player.abSet('a', g.a - 1)} aria-label={tx("시작 1초 앞으로")}>{tx("−1초")}</button>
          <button className="num" onClick={() => player.abSet('a', g.a + 1)} aria-label={tx("시작 1초 뒤로")}>{tx("+1초")}</button></div>
        <div><span>{tx("끝")}<b className="num">{fmt(g.b)}</b></span>
          <button className="num" onClick={() => player.abSet('b', g.b! - 1)} aria-label={tx("끝 1초 앞으로")}>{tx("−1초")}</button>
          <button className="num" onClick={() => player.abSet('b', g.b! + 1)} aria-label={tx("끝 1초 뒤로")}>{tx("+1초")}</button></div>
      </div>
      {cur && !cur.clip && <button className="quick" onClick={() => setSave(true)}>{tx("이 구간을 편집곡에 담기")}</button>}
      {saved && <p className="done-note" role="status">「{saved}{tx("」에 담았어요 · 내 목록에서 들어요")}</p>}
      <div className="abx"><span className="t2">{tx("다음 곡으로 가면 저절로 풀려요")}</span><button onClick={player.abClear}>{tx("구간 반복 끝내기")}</button></div>
      {save && cur && <ChooseEditSheet edits={edits} part={{ tid: cur.src ?? cur.id, s: Math.floor(g.a), e: Math.ceil(g.b!) }} onClose={() => setSave(false)} onDone={setSaved} />}
    </section>
  )
}

/** 멈췄을 때: 그 자리에서 다시 듣기(책갈피) · 그 자리부터 구간 반복 */
function PausedBar({ player, onTrim, onLevel, onPractice }: { player: Player; onTrim: () => void; onLevel: () => void; onPractice?: () => void }) {
  const t = player.time
  return (
    <section className="pz" aria-labelledby="pz-h">
      <div className="pz-top">
        <h2 className="pz-h" id="pz-h">{rt("__{0}__[num]에서 멈췄어요", fmt(t))}</h2>
        <div className="pz-nudge" role="group" aria-label={tx("멈춘 자리 다듬기")}>
          <button className="num" onClick={() => player.skip(-5)} aria-label={tx("멈춘 자리를 5초 되돌리기")}><Icon n="rew" s={16} />{tx("5초")}</button>
          <button className="num" onClick={() => player.skip(5)} aria-label={tx("멈춘 자리를 5초 넘기기")}>{tx("5초")}<Icon n="fwd" s={16} /></button>
        </div>
      </div>
      <div className="pz-acts">
        <button onClick={() => { player.setBookmark(t); player.play() }}>
          <span className="pz-ic" aria-hidden="true"><Icon n="undo" s={20} /></span>
          <span className="x"><span className="x1">{tx("여기부터 다시 듣기")}</span><span className="x2">{tx("언제든 이 자리로 돌아와요")}</span></span>
        </button>
        <button onClick={() => { player.abStart(); player.play() }}>
          <span className="pz-ic" aria-hidden="true"><Icon n="ab" s={20} /></span>
          <span className="x"><span className="x1">{tx("여기부터 구간 반복")}</span><span className="x2">{tx("끝을 정해 그 사이만 들어요")}</span></span>
        </button>
      </div>
      <div className={'pz-tools' + (onPractice ? '' : ' two')} role="group" aria-label={tx("이 곡 설정")}>
        <button onClick={onTrim}><Icon n="trim" s={22} /><span>{tx("시작·끝")}</span></button>
        <button onClick={onLevel}><Icon n="level" s={22} /><span>{tx("소리 크기")}</span></button>
        {onPractice && <button onClick={onPractice}><Icon n="note" s={22} /><span>{tx("빠르기·키")}</span></button>}
      </div>
    </section>
  )
}

/** 시계 칸이 멈춰 있을 때도 30초마다 다시 계산한다 */
function useNow(ms: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(h) }, [ms])
  return now
}

export function NowScreen({ tracks, player, vol, loud, output, lists, edits, onSleep }: {
  tracks: Track[]; player: Player; vol: Vol; loud: boolean; output: Output | null; lists: Playlists; edits: Edits; onSleep: () => void
}) {
  const notesOn = useFlag('notes', true)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [trimOpen, setTrimOpen] = useState(false)
  const closeTrim = useCallback(() => setTrimOpen(false), [])
  const [levelOpen, setLevelOpen] = useState(false)
  const [pracOpen, setPracOpen] = useState(false)
  const closePrac = useCallback(() => setPracOpen(false), [])
  const [lyOpen, setLyOpen] = useState<false | 'view' | 'edit' | 'sync'>(false)
  const [view, setView] = useState<'flow' | 'lyrics'>(() => load('nowView', 'flow'))
  const pickView = (v: 'flow' | 'lyrics') => { setView(v); save('nowView', v) }
  const closeLy = useCallback(() => setLyOpen(false), [])
  const closeLevel = useCallback(() => setLevelOpen(false), [])
  const [nearbyAsked, setNearbyAsked] = useState<boolean>(() => load('nearbyAsked', false))
  const closeSpeed = useCallback(() => setSpeedOpen(false), [])
  const closeRepeat = useCallback(() => setRepeatOpen(false), [])
  const closeQueue = useCallback(() => setQueueOpen(false), [])
  useNow(30000)
  const now = Date.now()
  const cur = player.current
  const shown = cur ?? player.resumeTrack
  const rp = repeatShort(player)
  const p = shown ? info(shown) : null
  const talk = !!shown?.talk
  const lyView = cur && !talk ? view : 'flow'
  const lec = talk && shown ? lectureOf(shown) : null
  const music = tracks.filter((t) => !t.talk)

  const press = () => {
    if (cur) player.toggle()
    else if (shown) player.playFrom(talk ? tracks.filter((t) => t.talk && t.folder === shown.folder).sort(byLecture) : music, shown.id, player.resumePos, talk)
    else {
      if (!player.shuffle) player.toggleShuffle()
      const pool = music.length ? music : tracks
      player.playFrom(pool, pool[Math.floor(Math.random() * pool.length)].id)
    }
  }
  const flow = cur ? (cur.talk ? buildTalkFlow(player, now) : buildFlow(player, now)) : null
  const s = player.sleep
  const from = talk && lec ? [shown!.folder, lec.no].filter(Boolean).join(' · ') + (cur ? '' : tx(" · {0}부터 이어서", fmt(player.resumePos))) : cur ? fromLine(p!, cur) : shown ? tx("이어서 듣기 · {0}부터", fmt(player.resumePos)) : tx("{0}곡이 준비됐어요", nf.format(tracks.length))
  const who = lec ? lec.speaker : p ? p.singer : ''
  const r = player.rate || 1

  return (
    <div className="page now">
      <div className="top">
        <span className="mark">{tx("온음")}</span>
        {output && <span className="out" role="status"><Icon n={outputIcon(output)} s={16} />{outputLabel(output)}</span>}
      </div>

      <div className="song">
        {from && <p className="from">{from}</p>}
        <h1>{lec ? lec.name : p ? p.song : tx("모든 곡 골고루 섞어 듣기")}</h1>
        {talk ? (
          <p className="who">{who}{shown!.duration > 0 && <span>{who ? ' · ' : ''}{minutesText(Math.round(shown!.duration / 60))}</span>}</p>
        ) : (who || p?.original) && <p className="who">{who}{p?.original && <span>{who ? ' · ' : ''}{tx("원곡 ")}{p.original}</span>}</p>}
        {cur && !talk && (player.practice || player.ab) && (
          <div className="chiprow">
            {(player.practice || player.ab) && (
              <button className={'prac' + (player.practice ? ' on' : '')} onClick={() => setPracOpen(true)} aria-haspopup="dialog" aria-label={player.practice ? tx("연습 중인 빠르기와 키 바꾸기") : undefined}>
                <Icon n="note" s={18} />{player.practice ? <span className="num">{[player.practice.r && player.practice.r !== 1 ? `${player.practice.r}×` : '', player.practice.k ? tx("키 {0}{1}", player.practice.k > 0 ? '+' : '−', Math.abs(player.practice.k)) : ''].filter(Boolean).join(' · ')}</span> : <span>{tx("빠르기·키")}</span>}
              </button>
            )}
          </div>
        )}
      </div>

      {shown && (
        <>
          <ShapeBar t={shown} time={cur ? player.time : player.resumePos} duration={cur ? player.duration : shown.duration}
            onSeek={cur ? player.seek : undefined} ab={cur ? (player.ab ?? (cur.clip ? { a: cur.clip.s, b: cur.clip.e, n: 1 } : null)) : null} mark={cur ? player.bookmark : null} />
          <div className="times num" aria-hidden="true">
            {notesOn && cur && !cur.talk && <NoteFloat playing={player.playing} ratio={player.duration > 0 ? player.time / player.duration : 0} bars={cachedShape(cur)?.bars ?? null} />}
            {cur?.clip ? (
              <>
                <span>{fmt(Math.max(0, player.time - cur.clip.s))}</span>
                <span>−{fmt(Math.max(0, cur.clip.e - player.time))}</span>
              </>
            ) : (
              <>
                <span>{fmt(cur ? player.time : player.resumePos)}</span>
                {cur?.talk && player.quietOn && player.quietReady && (
                  <span className="qsave">{player.quietSaved >= 60 ? tx("쉼을 줄여 {0} 아꼈어요", minutesText(Math.floor(player.quietSaved / 60))) : tx("말 사이 쉼을 줄이는 중")}</span>
                )}
                <span>−{fmt(Math.max(0, (cur ? player.duration : shown.duration) - (cur ? player.time : player.resumePos)))}</span>
              </>
            )}
          </div>
        </>
      )}

      {talk ? (
        <div className="ctl">
          <button className="small" aria-haspopup="dialog" onClick={() => setSpeedOpen(true)} disabled={!cur} aria-label={tx("빠르기 {0}배", r)}>
            <span className="spd num">{r.toFixed(1)}×</span>{tx("빠르기")}</button>
          <button className="jump" onClick={() => player.skip(-player.SKIP)} disabled={!cur} aria-label={tx("{0}초 뒤로", player.SKIP)}><Icon n="rew" s={30} /><b className="num">{player.SKIP}{tx("초")}</b></button>
          <button className="play" onClick={press} aria-label={player.playing ? tx("일시 정지") : cur ? tx("재생") : tx("이어서 듣기")}>
            <Icon n={player.playing ? 'pause' : 'play'} s={30} />
          </button>
          <button className="jump" onClick={() => player.skip(player.SKIP)} disabled={!cur} aria-label={tx("{0}초 앞으로", player.SKIP)}><Icon n="fwd" s={30} /><b className="num">{player.SKIP}{tx("초")}</b></button>
          <button className={'small' + (player.ab ? ' on' : '')} aria-pressed={!!player.ab} disabled={!cur}
            onClick={() => (player.ab ? player.abClear() : player.abStart())}><Icon n="ab" />{tx("구간")}</button>
        </div>
      ) : (
        <div className="ctl">
        <button className={'small' + (player.shuffle ? ' on' : '')} aria-pressed={player.shuffle} onClick={player.toggleShuffle}>
          <Icon n="shuffle" />{tx("섞기")}</button>
        <button className="skip" onClick={() => player.go(-1)} disabled={!cur} aria-label={tx("이전 곡")}><Icon n="prev" s={32} /></button>
        <button className="play" onClick={press} aria-label={player.playing ? tx("일시 정지") : cur ? tx("재생") : shown ? tx("이어서 듣기") : tx("모든 곡 섞어 듣기")}>
          <Icon n={player.playing ? 'pause' : 'play'} s={30} />
        </button>
        <button className="skip" onClick={() => player.go(1)} disabled={!cur} aria-label={tx("다음 곡")}><Icon n="next" s={32} /></button>
        <button className={'small' + (rp.on ? ' on' : '')} aria-haspopup="dialog" onClick={() => setRepeatOpen(true)} aria-label={tx("반복: {0}", rp.on ? rp.label : tx("안 함"))}>
          <Icon n={rp.one ? 'repeat1' : 'repeat'} /><span className="num">{rp.label}</span>
        </button>
      </div>

      )}

      <VolumeRow vol={vol} loud={loud} guide={!!output && output.kind !== 'speaker' && !output.car}
        onCar={output?.kind === 'bluetooth' && output.car === undefined && !nearbyAsked ? () => { save('nearbyAsked', true); setNearbyAsked(true); askNearby() } : undefined} />

      {cur && player.ab ? <AbBar player={player} edits={edits} /> : cur && !player.playing && player.time > 0.5 && !(player.duration > 0 && player.time >= player.duration - 0.5) ? <PausedBar player={player} onTrim={() => setTrimOpen(true)} onLevel={() => setLevelOpen(true)} onPractice={talk ? undefined : () => setPracOpen(true)} /> : (
      <section className="flow" aria-labelledby="flow-h">
        <div className="flow-h">
          {cur && !talk ? (
            <div className="ftabs" role="tablist" aria-label={tx("지금 화면 아래")}>
              <button role="tab" id="flow-h" aria-selected={lyView === 'flow'} className={lyView === 'flow' ? 'on' : undefined} onClick={() => pickView('flow')}>{tx("이어서")}</button>
              <button role="tab" aria-selected={lyView === 'lyrics'} className={lyView === 'lyrics' ? 'on' : undefined} onClick={() => pickView('lyrics')}><Icon n="lyric" s={16} />{tx("가사")}</button>
            </div>
          ) : <h2 id="flow-h">{tx("이어서")}</h2>}
          <button className={'until' + (s ? ' set' : '')} aria-haspopup="dialog" onClick={onSleep}>
            <Icon n="moon" s={16} />
            {s ? (s.endOfTrack ? tx("이 곡 끝나면 멈춤") : <><span className="num">{clock(s.until, false)}</span> {tx("멈춤")}</>) : tx("잠들기")}
          </button>
        </div>
        {player.bookmark != null && lyView === 'flow' && (
          <span className="bmchip">
            <button className="bm-go" onClick={player.backToMark}><Icon n="rew" s={18} />{rt("__{0}__[num]부터 다시", fmt(player.bookmark))}</button>
            <button className="bm-x" onClick={() => player.setBookmark(null)} aria-label={tx("책갈피 지우기")}><Icon n="x" s={16} /></button>
          </span>
        )}
        {lyView === 'lyrics' && cur && <LyricsInline t={cur} player={player} onOpen={(m) => setLyOpen(m ?? 'view')} />}
        {flow && lyView === 'flow' && (
          <>
            <ol className="rows">
              {flow.rows.map((r, k) => {
                const body = (
                  <>
                    <span className="t num">{r.at != null ? clock(r.at, false) : ''}</span>
                    <span className="n" aria-hidden="true">
                      {r.kind === 'rep' && <Icon n="repeat" s={12} w={3.2} />}
                      {r.kind === 'stop' && <Icon n="moon" s={11} />}
                    </span>
                    <span className="x"><span className="x1">{r.title}</span><span className="x2">{r.sub}</span></span>
                  </>
                )
                return (
                  <li key={k} className={r.kind}>
                    {r.jump != null
                      ? <button className="rowbtn" onClick={() => player.jump(r.jump!)} aria-label={tx("{0} 바로 듣기{1}", r.title, r.at != null ? tx(", {0} 예정", clock(r.at)) : '')}>{body}</button>
                      : <div className="rowbtn">{body}</div>}
                  </li>
                )
              })}
            </ol>
            <button className="more num" aria-haspopup="dialog" onClick={() => setQueueOpen(true)}>{flow.more}<Icon n="chev" s={16} /></button>
          </>
        )}
      </section>
      )}

      {repeatOpen && <RepeatSheet player={player} onClose={closeRepeat} />}
      {speedOpen && <SpeedSheet player={player} onClose={closeSpeed} />}
      {trimOpen && cur && <TrimSheet t={cur} player={player} onClose={closeTrim} />}
      {levelOpen && cur && <LevelSheet t={cur} player={player} onClose={closeLevel} />}
      {pracOpen && cur && <PracticeSheet t={cur} player={player} onClose={closePrac} />}
      {lyOpen && cur && <LyricsPage t={cur} player={player} onClose={closeLy} start={lyOpen === 'view' ? undefined : lyOpen} />}
      {queueOpen && <QueuePage player={player} tracks={tracks} lists={lists} onClose={closeQueue} />}
    </div>
  )
}
