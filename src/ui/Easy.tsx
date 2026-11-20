// 쉬운 화면: 글자와 버튼을 크게, 꼭 필요한 것만
import { useCallback, useMemo, useState } from 'react'
import type { Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { matches } from '../lib/hangul'
import { Icon, SAFE_VOLUME, VirtualList, info, type Vol } from './common'
import { Page } from './Sheets'

export function EasyScreen({ tracks, player, vol, loud, onNormal, onSleep }: {
  tracks: Track[]; player: Player; vol: Vol; loud: boolean; onNormal: () => void; onSleep: () => void
}) {
  const [picking, setPicking] = useState(false)
  const closePick = useCallback(() => setPicking(false), [])
  const cur = player.current ?? player.resumeTrack
  const x = cur ? info(cur) : null
  const press = () => {
    if (player.current) player.toggle()
    else if (cur) player.playFrom(tracks, cur.id, player.resumePos)
    else setPicking(true)
  }
  const next = player.next && !player.nextNote ? info(player.next).song : player.nextNote
  return (
    <div className="page easy">
      <div className="top">
        <span className="mark">온음</span>
        <button className="out" onClick={onNormal}>보통 화면으로</button>
      </div>
      <div className="e-song">
        <h1 className="e-t">{x ? x.song : '노래를 골라 주세요'}</h1>
        {x?.singer && <p className="e-a">{x.singer}</p>}
      </div>
      <div className="e-ctl">
        <button className="e-skip" onClick={() => player.go(-1)} disabled={!player.current} aria-label="이전 곡"><Icon n="prev" s={40} /></button>
        <button className="e-play" onClick={press} aria-label={player.playing ? '일시 정지' : '재생'}><Icon n={player.playing ? 'pause' : 'play'} s={48} /></button>
        <button className="e-skip" onClick={() => player.go(1)} disabled={!player.current} aria-label="다음 곡"><Icon n="next" s={40} /></button>
      </div>
      <div className={'e-vol' + (loud ? ' over' : '')} role="group" aria-label="소리 크기">
        <button className="e-vb" onClick={() => vol.step(-1)} aria-label="소리 줄이기"><Icon n="minus" s={30} w={2.6} /></button>
        <p role="status"><span className="num">{vol.percent}</span><small>{loud ? `소리 · ${SAFE_VOLUME} 넘음` : '소리'}</small></p>
        <button className="e-vb" onClick={() => vol.step(1)} aria-label="소리 키우기"><Icon n="plus" s={30} w={2.6} /></button>
      </div>
      {player.current && next && <div className="e-next"><span>다음 곡</span><b>{next}</b></div>}
      <div className="e-big">
        <button onClick={() => setPicking(true)}><Icon n="search" s={28} />노래 고르기</button>
        <button className={player.sleep ? 'set' : undefined} onClick={onSleep}><Icon n="moon" s={26} />{player.sleep ? '잠들기 예약됨' : '잠들기'}</button>
      </div>
      {picking && <EasyPick tracks={tracks} player={player} onClose={closePick} />}
    </div>
  )
}

function EasyPick({ tracks, player, onClose }: { tracks: Track[]; player: Player; onClose: () => void }) {
  const [q, setQ] = useState('')
  const found = useMemo(() => tracks.filter((t) => {
    const x = info(t)
    return matches(x.song, q) || matches(x.singer, q) || matches(t.title, q)
  }), [tracks, q])
  return (
    <Page label="노래 고르기" onClose={onClose}>
      <label className="search big">
        <Icon n="search" s={24} />
        <span className="sr">노래, 부른 사람 찾기</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="노래 이름 (초성도 돼요)" autoComplete="off" enterKeyHint="search" />
      </label>
      <VirtualList items={found} className="elist" rowRem={5.5} render={(t) => {
        const x = info(t)
        return (
          <li key={t.id}>
            <button onClick={() => { player.playFrom(found, t.id); onClose() }}>
              <span className="x1">{x.song}</span>{x.singer && <span className="x2">{x.singer}</span>}
            </button>
          </li>
        )
      }} />
    </Page>
  )
}
