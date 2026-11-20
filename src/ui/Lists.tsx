// 「내 목록」: 만든 목록 + 저절로 모이는 목록
import { useCallback, useMemo, useState } from 'react'
import { fmt, type Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import type { Playlist, Playlists } from '../lib/playlists'
import { Icon, VirtualList, info, minutesText, nf, whoLine } from './common'
import { AddSongs, EditRows, NameSheet, Page } from './Sheets'

const DAY = 86400000

/** "12곡 · 58분". 길이를 모르는 곡이 있으면 곡 수만 */
function meta(items: Track[]): string {
  const n = `${nf.format(items.length)}곡`
  if (!items.length || items.some((t) => !t.duration)) return n
  const m = Math.round(items.reduce((a, t) => a + t.duration, 0) / 60)
  return `${n} · ${minutesText(Math.max(1, m))}`
}

interface Auto { id: string; name: string; sub: string; items: Track[] }

export function ListsScreen({ tracks, music, player, lists }: { tracks: Track[]; music: Track[]; player: Player; lists: Playlists }) {
  const [open, setOpen] = useState<string | null>(null)
  const [auto, setAuto] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const closeNaming = useCallback(() => setNaming(false), [])
  const closeOpen = useCallback(() => setOpen(null), [])
  const closeAuto = useCallback(() => setAuto(null), [])
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const itemsOf = (p: Playlist) => p.ids.map((id) => byId.get(id)).filter((t): t is Track => !!t)

  const autos = useMemo<Auto[]>(() => {
    const now = Date.now()
    const tracks = music // 저절로 모이는 목록에는 강의를 넣지 않는다
    const often = tracks.filter((t) => (player.plays[t.id] ?? 0) >= 2)
      .sort((a, b) => player.plays[b.id] - player.plays[a.id]).slice(0, 100)
    const fresh = tracks.filter((t) => now - t.added < 14 * DAY).sort((a, b) => b.added - a.added)
    const old = tracks.filter((t) => {
      const l = player.last[t.id]
      return l ? now - l > 90 * DAY : now - t.added > 90 * DAY
    }).sort((a, b) => (player.last[a.id] ?? 0) - (player.last[b.id] ?? 0))
    return [
      { id: 'often', name: '자주 들은 곡', sub: '많이 들은 순서', items: often },
      { id: 'fresh', name: '새로 들어온 곡', sub: '최근 2주 동안 추가된 곡', items: fresh },
      { id: 'old', name: '한동안 안 들은 곡', sub: '석 달 넘게 듣지 않은 곡', items: old },
    ]
  }, [music, player.plays, player.last])

  const pl = lists.items.find((p) => p.id === open)
  const au = autos.find((a) => a.id === auto)

  return (
    <div className="page">
      <div className="ph">
        <h1>내 목록</h1>
        <button className="add" onClick={() => setNaming(true)}><Icon n="plus" s={18} w={2.4} />새 목록</button>
      </div>
      <h2 className="sub">만든 목록</h2>
      {lists.items.length === 0 ? (
        <p className="empty">아직 만든 목록이 없어요. "새 목록"을 눌러 듣고 싶은 곡을 모아 보세요.</p>
      ) : (
        <ul className="pl">
          {lists.items.map((p) => {
            const items = itemsOf(p)
            return (
              <li key={p.id}>
                <button className="lrow" onClick={() => setOpen(p.id)}>
                  <span className="x"><span className="x1">{p.name}</span><span className="x2 num">{meta(items)}</span></span>
                </button>
                <button className="pp" disabled={!items.length} onClick={() => player.playFrom(items, items[0].id, 0, true)} aria-label={`${p.name} 듣기`}>
                  <Icon n="play" s={20} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <h2 className="sub">저절로 모이는 목록</h2>
      <ul className="pl auto">
        {autos.map((a) => (
          <li key={a.id}>
            <button className="lrow" onClick={() => setAuto(a.id)}>
              <span className="x"><span className="x1">{a.name}</span><span className="x2 num">{a.sub} · {nf.format(a.items.length)}곡</span></span>
              <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
            </button>
          </li>
        ))}
      </ul>
      {naming && <NameSheet onClose={closeNaming} onDone={(name) => setOpen(lists.create(name))} />}
      {pl && <ListDetail pl={pl} items={itemsOf(pl)} tracks={tracks} lists={lists} player={player} onClose={closeOpen} />}
      {au && <AutoDetail a={au} player={player} onClose={closeAuto} />}
    </div>
  )
}

function ListDetail({ pl, items, tracks, lists, player, onClose }: {
  pl: Playlist; items: Track[]; tracks: Track[]; lists: Playlists; player: Player; onClose: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [sure, setSure] = useState(false)
  const closeAdding = useCallback(() => setAdding(false), [])
  return (
    <Page label={pl.name} onClose={onClose}>
      <p className="lmeta num">{meta(items)}</p>
      <div className="acts">
        {items.length > 0 && <button className="go grow" onClick={() => player.playFrom(items, items[0].id, 0, true)}><Icon n="play" s={18} />처음부터 듣기</button>}
        <button className="pillbtn" onClick={() => setAdding(true)}><Icon n="plus" s={18} />곡 추가</button>
      </div>
      {items.length === 0 && <p className="empty">아직 담은 곡이 없어요. "곡 추가"를 눌러 담아 보세요.</p>}
      <EditRows tracks={items} currentId={player.current?.id}
        onTap={(i) => player.playFrom(items, items[i].id, 0, true)}
        onMove={(i, d) => lists.swap(pl.id, items[i].id, items[i + d].id)}
        onRemove={(i) => lists.removeTrack(pl.id, items[i].id)} />
      {sure ? (
        <div className="confirm" role="alert">
          <p>"{pl.name}" 목록을 지울까요? 음악 파일은 지워지지 않아요.</p>
          <div className="nb">
            <button className="ghost" onClick={() => setSure(false)}>그만두기</button>
            <button className="go danger" onClick={() => { lists.remove(pl.id); onClose() }}>목록 지우기</button>
          </div>
        </div>
      ) : <button className="textbtn" onClick={() => setSure(true)}>이 목록 지우기</button>}
      {adding && <AddSongs tracks={tracks} has={(id) => pl.ids.includes(id)} onAdd={(t) => lists.add(pl.id, [t.id])} onClose={closeAdding} />}
    </Page>
  )
}

function AutoDetail({ a, player, onClose }: { a: Auto; player: Player; onClose: () => void }) {
  return (
    <Page label={a.name} onClose={onClose}>
      <p className="lmeta num">{a.sub} · {meta(a.items)}</p>
      {a.items.length > 0
        ? <div className="acts"><button className="go grow" onClick={() => player.playFrom(a.items, a.items[0].id, 0, true)}><Icon n="play" s={18} />처음부터 듣기</button></div>
        : <p className="empty">{a.id === 'often' ? '두 번 이상 들은 곡이 여기 모여요.' : '아직 해당하는 곡이 없어요.'}</p>}
      <VirtualList items={a.items} className="pl" rowRem={4.25} render={(t) => {
        const x = info(t)
        return (
          <li key={t.id}>
            <button className="lrow" onClick={() => player.playFrom(a.items, t.id, 0, true)}>
              <span className="x"><span className="x1">{x.song}</span><span className="x2">{whoLine(x) || ' '}</span></span>
              <span className="d num">{a.id === 'often' ? `${nf.format(player.plays[t.id] ?? 0)}번` : t.duration ? fmt(t.duration) : ''}</span>
            </button>
          </li>
        )
      }} />
    </Page>
  )
}
