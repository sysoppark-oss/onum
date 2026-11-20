// 들은 시간: 최근 7일 막대, 지난 7일과 견주기, 많이 들은 곡, 끝에 말씀 한 절. 모두 이 휴대폰 안의 기록.
import { useMemo, useState, useSyncExternalStore } from 'react'
import type { Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { days, hm, lastDays, onStats, topSongs } from '../lib/stats'
import { YEAR } from '../lib/verses365'
import { dayIndex } from '../lib/verses'
import { shown, useKjv } from '../lib/kjv'
import { Icon, info, whoLine } from './common'
import { Page } from './Sheets'

const WD = ['일', '월', '화', '수', '목', '금', '토']
let ver = 0
onStats(() => { ver++ })
/** 기록이 저장될 때마다 다시 그린다 */
function useStatsVersion() {
  return useSyncExternalStore((f) => onStats(f), () => ver)
}

function week() {
  const d14 = lastDays(14)
  const cur = d14.slice(7)
  const prev = d14.slice(0, 7)
  const sum = (a: { t: number }[]) => a.reduce((s, d) => s + d.t, 0)
  return { cur, total: sum(cur), before: sum(prev) }
}

function compare(total: number, before: number): string {
  if (before < 60) return total >= 60 ? '최근 7일 동안 들은 시간이에요' : ''
  const diff = total - before
  if (Math.abs(diff) < 60) return '그 전 7일과 비슷해요'
  return `그 전 7일보다 ${hm(Math.abs(diff))} ${diff > 0 ? '더' : '덜'} 들었어요`
}

/** 내 목록 맨 위 한 줄: 최근 7일 들은 시간과 작은 막대 */
export function ListenCard({ onOpen }: { onOpen: () => void }) {
  useStatsVersion()
  const w = week()
  const max = Math.max(...w.cur.map((d) => d.t), 1)
  return (
    <button className="lcard" onClick={onOpen} aria-label={`최근 7일 들은 시간 ${hm(w.total)}. 자세히 보기`}>
      <span className="x">
        <span className="lc1">최근 7일 들은 시간</span>
        <span className="lc2 num">{w.total < 60 ? '아직 기록이 적어요' : hm(w.total)}</span>
      </span>
      <span className="lspark" aria-hidden="true">
        {w.cur.map((d, i) => <i key={d.key} className={i === 6 ? 'td' : ''} style={{ height: `${Math.max(d.t > 0 ? 12 : 6, (d.t / max) * 100)}%` }} />)}
      </span>
      <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
    </button>
  )
}

export function ListenPage({ tracks, player, onClose, onPlayed }: { tracks: Track[]; player: Player; onClose: () => void; onPlayed: () => void }) {
  const v = useStatsVersion()
  const kjv = useKjv()
  const w = useMemo(week, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(6)
  const max = Math.max(...w.cur.map((d) => d.t), 1)
  const bySrc = useMemo(() => {
    const m = new Map<string, Track>()
    for (const t of tracks) if (!t.edit) m.set(t.src ?? t.id, t)
    return m
  }, [tracks])
  const top = useMemo(() => topSongs(w.cur.map((d) => d.key), 5)
    .map((s) => ({ ...s, t: bySrc.get(s.id) })).filter((s): s is { id: string; sec: number; t: Track } => !!s.t), [w, bySrc])
  const month = useMemo(() => {
    const now = new Date()
    const pre = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`
    return Object.entries(days()).reduce((s, [k, d]) => (k.startsWith(pre) ? s + d.t : s), 0)
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => Object.values(days()).reduce((s, d) => s + d.t, 0), [v]) // eslint-disable-line react-hooks/exhaustive-deps
  // 한 주에 한 절: 이번 주가 시작된 날의 말씀
  const verse = shown(YEAR[Math.floor(dayIndex() / 7) * 7 % YEAR.length], kjv)
  const d = w.cur[sel]
  const dayName = (i: number) => (i === 6 ? '오늘' : i === 5 ? '어제' : WD[w.cur[i].date.getDay()])
  const cmp = compare(w.total, w.before)

  return (
    <Page label="들은 시간" onClose={onClose}>
      <div className="lsum">
        <p className="lc1">최근 7일</p>
        <p className="lsum-t num">{w.total < 60 ? '0분' : hm(w.total)}</p>
        <p className="lsum-s">{cmp || '음악을 들으면 여기에 쌓여요'}</p>
      </div>

      <p className="lsel num" aria-live="polite">
        {d.date.getMonth() + 1}월 {d.date.getDate()}일 ({WD[d.date.getDay()]}) · <b>{d.t < 60 ? (d.t > 0 ? '1분 미만' : '안 들었어요') : hm(d.t)}</b>
      </p>
      <div className="lbars" role="group" aria-label="최근 7일 날마다 들은 시간">
        {w.cur.map((x, i) => (
          <button key={x.key} className={'lbar' + (i === sel ? ' on' : '')} onClick={() => setSel(i)} aria-pressed={i === sel}
            aria-label={`${x.date.getMonth() + 1}월 ${x.date.getDate()}일 ${hm(x.t)}`}>
            <span className="lb-track"><i style={{ height: `${x.t > 0 ? Math.max(4, (x.t / max) * 100) : 0}%` }} /></span>
            <span className={'lb-d' + (i === 6 ? ' td' : '')}>{dayName(i)}</span>
          </button>
        ))}
      </div>

      <div className="lstats">
        <p><span>이번 달</span><b className="num">{month < 60 ? '0분' : hm(month)}</b></p>
        <p><span>모두 합쳐</span><b className="num">{all < 60 ? '0분' : hm(all)}</b></p>
      </div>

      <h2 className="sub">최근 7일 많이 들은 곡</h2>
      {top.length === 0 ? (
        <p className="empty">아직 기록이 없어요. 곡을 들으면 많이 들은 순서로 모여요.</p>
      ) : (
        <ol className="pl ltop">
          {top.map((s, i) => {
            const p = info(s.t)
            return (
              <li key={s.id}>
                <span className="rk num" aria-hidden="true">{i + 1}</span>
                <button className="lrow" onClick={() => { player.playFrom(top.map((x) => x.t), s.t.id, 0, true); onPlayed() }}
                  aria-label={`${i + 1}위 ${p.song}, ${hm(s.sec)} 들음. 듣기`}>
                  <span className="x"><span className="x1">{p.song}</span><span className="x2">{whoLine(p) ? `${whoLine(p)} · ` : ''}<span className="num">{hm(s.sec)}</span></span></span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <figure className="lverse" lang={verse.lang}>
        <blockquote><p>{verse.text}</p></blockquote>
        <figcaption>{verse.ref} · {verse.ver}</figcaption>
      </figure>
      <p className="hint">기록은 이 휴대폰 안에만 있어요.</p>
    </Page>
  )
}
