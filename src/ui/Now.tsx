// 「지금」: 곡 · 소리 모양 · 조작 · 음량 · 흐름(앞으로 무엇이 언제) · 오늘의 한 문장
import { useCallback, useEffect, useState } from 'react'
import { fmt, type Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import type { Output } from '../lib/native'
import { BARS, cachedShape, getShape, type Shape } from '../lib/shape'
import { today } from '../lib/verses'
import type { Playlists } from '../lib/playlists'
import { Icon, SAFE_VOLUME, clock, fromLine, info, minutesText, nf, outputIcon, outputLabel, whoLine, type Vol } from './common'
import { QueuePage, RepeatSheet } from './Sheets'

/* ── 소리 모양 ── */
export function ShapeBar({ t, time, duration, onSeek }: { t: Track; time: number; duration: number; onSeek?: (s: number) => void }) {
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
        <i key={i} className={i / BARS < ratio ? 'done' : undefined} style={{ height: `${(bars ? bars[i] : 0.14) * 100}%` }} />
      ))}
      {hook != null && <span className="hook" aria-hidden="true" style={{ left: `${Math.min(92, Math.max(8, hook * 100))}%` }}>후렴</span>}
      <span className="head" aria-hidden="true" style={{ left: `${ratio * 100}%` }} />
      {onSeek && (
        <input type="range" className="scrub" min={0} max={Math.max(1, Math.floor(duration))} step={1} value={Math.floor(time)}
          onChange={(e) => onSeek(+e.target.value)} aria-label="재생 위치"
          aria-valuetext={`${fmt(time)}, 전체 ${fmt(duration)}`} />
      )}
    </div>
  )
}

/* ── 음량 ── */
export function VolumeRow({ vol, loud, guide }: { vol: Vol; loud: boolean; guide: boolean }) {
  const p = vol.percent
  return (
    <>
      <div className={'vol' + (loud ? ' over' : '') + (vol.flash ? ' flash' : '')}>
        <span className="ico" aria-hidden="true"><Icon n={p > SAFE_VOLUME ? 'speakerLoud' : 'speaker'} s={22} /></span>
        <div className="track">
          {guide && <i className="safe" style={{ left: `${SAFE_VOLUME}%` }} aria-hidden="true" />}
          <b style={{ width: `${p}%` }} />
          <s style={{ left: `${p}%` }} />
          <input type="range" min={0} max={100} step={1} value={p} onChange={(e) => vol.set(+e.target.value)}
            aria-label="음량" aria-valuetext={`${p}%${loud ? ', 권장 음량 넘음' : ''}`} />
        </div>
        <span className="val num" aria-hidden="true">{p}%</span>
      </div>
      {loud && <p className="warn" role="status"><Icon n="warn" s={15} w={2.6} />이어폰 권장 음량({SAFE_VOLUME}%)을 넘었어요</p>}
    </>
  )
}

/* ── 반복 버튼의 짧은 말 ── */
function repeatShort(p: Player): { label: string; on: boolean; one: boolean } {
  const r = p.repeat
  if (r.limit === 'timed') return { label: minutesText(Math.max(1, Math.ceil(p.repeatLeft / 60000))), on: true, one: r.scope === 'one' }
  if (r.limit === 'forever') return { label: r.scope === 'one' ? '한 곡' : '목록', on: true, one: r.scope === 'one' }
  return { label: '반복', on: false, one: false }
}

/* ── 흐름: 앞으로 무엇이 언제 ── */
interface Row { kind: 'next' | 'rep' | 'stop' | 'end'; at: number | null; title: string; sub: string; jump?: number }
interface Flow { rows: Row[]; more: string }

function buildFlow(p: Player, now: number): Flow {
  const cur = p.current!
  const q = p.queueTracks
  const dur = p.duration || cur.duration || 0
  const known = dur > 0
  const endCur = now + Math.max(0, dur - p.time) * 1000
  const r = p.repeat
  const s = p.sleep
  const ci = info(cur)
  const sleepAt = s ? (s.endOfTrack ? endCur : s.until) : Infinity
  const sleepRow = (at: number): Row => ({
    kind: 'stop', at,
    title: s!.endOfTrack ? '이 곡이 끝나면 멈춰요' : s!.fade ? '소리를 줄이며 멈춰요' : '멈춰요',
    sub: s!.fade && !s!.endOfTrack ? '30초 동안 서서히 작아져요' : '잠들기 예약',
  })
  const timedEnd = r.limit === 'timed' ? now + p.repeatLeft : Infinity
  const listLabel = `재생 목록 ${nf.format(q.length)}곡 보기`

  // 한 곡 반복
  if (r.scope === 'one') {
    if (r.limit === 'once') return { rows: [{ kind: 'end', at: known ? endCur : null, title: '이 곡이 끝나면 멈춰요', sub: '반복 안 함' }], more: listLabel }
    if (s?.endOfTrack) return { rows: [sleepRow(endCur)], more: listLabel }
    const stopAt = Math.min(sleepAt, timedEnd)
    const finite = isFinite(stopAt) && known
    // 정해진 때 전에 시작하는 횟수
    const n = finite ? Math.max(0, Math.ceil((stopAt - endCur) / (dur * 1000))) : 0
    const rows: Row[] = [{
      kind: 'rep', at: known ? endCur : null,
      title: r.limit === 'timed' ? `${ci.song} · ${minutesText(r.minutes)} 반복` : `${ci.song} · 한 곡 계속 반복`,
      sub: !finite ? '멈출 때까지 계속 들어요' : n ? `${sleepAt <= timedEnd ? '잠들기' : '정한 시간'} 전까지 약 ${n}번 더 들어요` : '이번이 마지막이에요',
    }]
    if (sleepAt <= timedEnd && s) rows.push(sleepRow(sleepAt))
    else if (isFinite(timedEnd)) rows.push({ kind: 'stop', at: known ? endCur + n * dur * 1000 : null, title: '반복을 마치고 멈춰요', sub: '듣던 곡까지 듣고 멈춰요' })
    return { rows, more: listLabel }
  }

  // 목록
  const ahead: { t: Track; at: number | null; i: number }[] = []
  let at: number | null = known ? endCur : null
  for (let i = p.index + 1; i < q.length; i++) {
    ahead.push({ t: q[i], at, i })
    at = at != null && q[i].duration > 0 ? at + q[i].duration * 1000 : null
  }
  const listEnd = at
  let wrap = false
  if (!ahead.length && r.limit !== 'once' && q.length > 0) {
    // 마지막 곡: 처음으로 돌아간다
    wrap = true
    if (!p.shuffle) ahead.push({ t: q[0], at: known ? endCur : null, i: 0 })
  }
  const cutAt = Math.min(sleepAt, timedEnd)
  const playable = ahead.filter((a) => a.at == null || a.at < cutAt)
  const stop: Row | null =
    s && sleepAt <= timedEnd && (sleepAt < (listEnd ?? Infinity) || r.limit !== 'once') ? sleepRow(sleepAt)
      : isFinite(timedEnd) ? { kind: 'stop', at: playable.length < ahead.length ? ahead[playable.length].at : listEnd, title: '반복을 마치고 멈춰요', sub: '듣던 곡까지 듣고 멈춰요' }
        : null
  const room = stop ? 1 : 2
  const shown = playable.slice(0, room)
  const rows: Row[] = shown.map((a) => {
    const x = info(a.t)
    return { kind: 'next', at: a.at, title: x.song, sub: whoLine(x) || fromLine(x, a.t) || ' ', jump: a.i }
  })
  if (wrap && p.shuffle && !stop) rows.push({ kind: 'end', at: known ? endCur : null, title: '처음부터 다시 섞어 들어요', sub: '목록 계속 반복' })
  if (!playable.length && !stop && r.limit === 'once') rows.push({ kind: 'end', at: known ? endCur : null, title: '이 곡이 끝나면 멈춰요', sub: '마지막 곡이에요' })
  if (stop) rows.push(stop)
  const rest = playable.length - shown.length
  let more = listLabel
  if (rest > 0 && !wrap) {
    const endAt = playable.length === ahead.length && listEnd != null ? listEnd : null
    more = `그다음 ${nf.format(rest)}곡` + (endAt != null && !stop ? ` · ${clock(endAt, false)}에 목록 끝` : '')
  }
  return { rows, more }
}

/** 시계 칸이 멈춰 있을 때도 30초마다 다시 계산한다 */
function useNow(ms: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(h) }, [ms])
  return now
}

export function NowScreen({ tracks, player, vol, loud, output, lists, onSleep }: {
  tracks: Track[]; player: Player; vol: Vol; loud: boolean; output: Output | null; lists: Playlists; onSleep: () => void
}) {
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const closeRepeat = useCallback(() => setRepeatOpen(false), [])
  const closeQueue = useCallback(() => setQueueOpen(false), [])
  useNow(30000)
  const now = Date.now()
  const cur = player.current
  const shown = cur ?? player.resumeTrack
  const verse = today()
  const rp = repeatShort(player)
  const p = shown ? info(shown) : null

  const press = () => {
    if (cur) player.toggle()
    else if (shown) player.playFrom(tracks, shown.id, player.resumePos)
    else {
      if (!player.shuffle) player.toggleShuffle()
      player.playFrom(tracks, tracks[Math.floor(Math.random() * tracks.length)].id)
    }
  }
  const flow = cur ? buildFlow(player, now) : null
  const s = player.sleep
  const from = cur ? fromLine(p!, cur) : shown ? `이어서 듣기 · ${fmt(player.resumePos)}부터` : `${nf.format(tracks.length)}곡이 준비됐어요`
  const who = p ? p.singer : ''

  return (
    <div className="page now">
      <div className="top">
        <span className="mark">온음</span>
        {output && <span className="out" role="status"><Icon n={outputIcon(output)} s={16} />{outputLabel(output)}</span>}
      </div>

      <div className="song">
        {from && <p className="from">{from}</p>}
        <h1>{p ? p.song : '모든 곡 골고루 섞어 듣기'}</h1>
        {(who || p?.original) && <p className="who">{who}{p?.original && <span>{who ? ' · ' : ''}원곡 {p.original}</span>}</p>}
      </div>

      {shown && (
        <>
          <ShapeBar t={shown} time={cur ? player.time : player.resumePos} duration={cur ? player.duration : shown.duration}
            onSeek={cur ? player.seek : undefined} />
          <div className="times num" aria-hidden="true">
            <span>{fmt(cur ? player.time : player.resumePos)}</span>
            <span>−{fmt(Math.max(0, (cur ? player.duration : shown.duration) - (cur ? player.time : player.resumePos)))}</span>
          </div>
        </>
      )}

      <div className="ctl">
        <button className={'small' + (player.shuffle ? ' on' : '')} aria-pressed={player.shuffle} onClick={player.toggleShuffle}>
          <Icon n="shuffle" />섞기
        </button>
        <button className="skip" onClick={() => player.go(-1)} disabled={!cur} aria-label="이전 곡"><Icon n="prev" s={32} /></button>
        <button className="play" onClick={press} aria-label={player.playing ? '일시 정지' : cur ? '재생' : shown ? '이어서 듣기' : '모든 곡 섞어 듣기'}>
          <Icon n={player.playing ? 'pause' : 'play'} s={30} />
        </button>
        <button className="skip" onClick={() => player.go(1)} disabled={!cur} aria-label="다음 곡"><Icon n="next" s={32} /></button>
        <button className={'small' + (rp.on ? ' on' : '')} aria-haspopup="dialog" onClick={() => setRepeatOpen(true)} aria-label={`반복: ${rp.on ? rp.label : '안 함'}`}>
          <Icon n={rp.one ? 'repeat1' : 'repeat'} /><span className="num">{rp.label}</span>
        </button>
      </div>

      <VolumeRow vol={vol} loud={loud} guide={!!output && output.kind !== 'speaker'} />

      <section className="flow" aria-labelledby="flow-h">
        <div className="flow-h">
          <h2 id="flow-h">이어서</h2>
          <button className={'until' + (s ? ' set' : '')} aria-haspopup="dialog" onClick={onSleep}>
            <Icon n="moon" s={16} />
            {s ? (s.endOfTrack ? '이 곡 끝나면 멈춤' : <><span className="num">{clock(s.until, false)}</span> 멈춤</>) : '잠들기'}
          </button>
        </div>
        {flow && (
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
                      ? <button className="rowbtn" onClick={() => player.jump(r.jump!)} aria-label={`${r.title} 바로 듣기${r.at != null ? `, ${clock(r.at)} 예정` : ''}`}>{body}</button>
                      : <div className="rowbtn">{body}</div>}
                  </li>
                )
              })}
            </ol>
            <button className="more num" aria-haspopup="dialog" onClick={() => setQueueOpen(true)}>{flow.more}<Icon n="chev" s={16} /></button>
          </>
        )}
        <div className="word">
          <p className="wl">오늘의 한 문장</p>
          <p className="wt">{verse.text}</p>
          <p className="wr">{verse.ref} · 개역한글</p>
        </div>
      </section>

      {repeatOpen && <RepeatSheet player={player} onClose={closeRepeat} />}
      {queueOpen && <QueuePage player={player} tracks={tracks} lists={lists} onClose={closeQueue} />}
    </div>
  )
}
