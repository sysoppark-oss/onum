// 「내 목록」: 만든 목록 + 저절로 모이는 목록
import { CuePage } from './Cue'
import { useCallback, useMemo, useState } from 'react'
import { fmt, type Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import type { Playlist, Playlists } from '../lib/playlists'
import { Icon, VirtualList, info, minutesText, nf, whoLine } from './common'
import { AddSongs, EditRows, MemoSheet, NameSheet, Page, TagSheet } from './Sheets'
import { EditsSection } from './Edits'
import { ListenCard, ListenPage } from './Listen'
import { DupesPage, type Hide } from './Dupes'
import { findDupes } from '../lib/dupes'
import { tx } from "../lib/i18n";
import type { Edits } from '../lib/edits'
import { SUNG, useKaraokeOn } from '../lib/karaoke'

const DAY = 86400000
// 바로가기 목록: 파일이 있는 자리로 가른다(설치형 앱은 전체 경로, PC는 폴더 이름)
const KAKAO = /kakao|카카오|카톡/i
const DOWN = /(^|\/)downloads?(\/|$)|다운로드/i
const where = (t: Track) => t.path || t.folder || ''

/** "12곡 · 58분". 길이를 모르는 곡이 있으면 곡 수만 */
function meta(items: Track[]): string {
  const n = tx("{0}곡", nf.format(items.length))
  if (!items.length || items.some((t) => !t.duration)) return n
  const m = Math.round(items.reduce((a, t) => a + t.duration, 0) / 60)
  return `${n} · ${minutesText(Math.max(1, m))}`
}

interface Auto { id: string; name: string; sub: string; items: Track[] }

export function ListsScreen({ tracks, music, player, lists, edits, onPlayed, hide, notSame }: { tracks: Track[]; music: Track[]; player: Player; lists: Playlists; edits: Edits; onPlayed: () => void; hide: Hide; notSame: string[] }) {
  // 곡을 틀면 「지금」으로 넘어간다(음악 탭과 같게)
  const play: Player['playFrom'] = (...a) => { player.playFrom(...a); onPlayed() }
  const [open, setOpen] = useState<string | null>(null)
  const [auto, setAuto] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [listen, setListen] = useState(false)
  const closeListen = useCallback(() => setListen(false), [])
  const [dupes, setDupes] = useState(false)
  const closeDupes = useCallback(() => setDupes(false), [])
  const groups = useMemo(() => findDupes(music, info, player.plays, notSame), [music, player.plays, notSame])
  // 정리 창을 연 동안에는 그룹이 사라져도 창을 닫지 않는다
  const closeNaming = useCallback(() => setNaming(false), [])
  const closeOpen = useCallback(() => setOpen(null), [])
  const closeAuto = useCallback(() => setAuto(null), [])
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const itemsOf = (p: Playlist) => p.ids.map((id) => byId.get(id)).filter((t): t is Track => !!t)

  const karaOn = useKaraokeOn()
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
    const newest = (a: Track, b: Track) => b.added - a.added
    const kakao = tracks.filter((t) => KAKAO.test(where(t))).sort(newest)
    const sung = karaOn ? tracks.filter((t) => SUNG.test(where(t))).sort(newest) : []
    const down = tracks.filter((t) => !KAKAO.test(where(t)) && DOWN.test(where(t))).sort(newest)
    return [
      ...(sung.length ? [{ id: 'sung', name: tx("내가 부른 노래"), sub: tx("노래연습에서 녹음한 곡"), items: sung }] : []),
      ...(kakao.length ? [{ id: 'kakao', name: tx("카톡으로 받은 음악"), sub: tx("카카오톡에서 저장한 곡"), items: kakao }] : []),
      ...(down.length ? [{ id: 'down', name: tx("다운로드한 음악"), sub: tx("다운로드 폴더의 곡"), items: down }] : []),
      { id: 'often', name: tx("자주 들은 곡"), sub: tx("많이 들은 순서"), items: often },
      { id: 'fresh', name: tx("새로 들어온 곡"), sub: tx("최근 2주 동안 추가된 곡"), items: fresh },
      { id: 'old', name: tx("한동안 안 들은 곡"), sub: tx("석 달 넘게 듣지 않은 곡"), items: old },
    ]
  }, [music, player.plays, player.last, karaOn])

  /** 목록에서 마지막으로 듣던 곡·자리(곡이 목록에 남아 있을 때만) */
  const resumeOf = (p: Playlist, items: Track[]) => {
    const r = player.listPos['list:' + p.id]
    const t = r ? items.find((x) => x.id === r.id) : undefined
    return t && r.pos > 3 ? { t, pos: r.pos } : null
  }
  const pl = lists.items.find((p) => p.id === open)
  const au = autos.find((a) => a.id === auto)

  return (
    <div className="page">
      <div className="ph">
        <h1>{tx("내 목록")}</h1>
        <button className="add" onClick={() => setNaming(true)}><Icon n="plus" s={18} w={2.4} />{tx("새 목록")}</button>
      </div>
      <ListenCard onOpen={() => setListen(true)} />
      <h2 className="sub">{tx("만든 목록")}</h2>
      {lists.items.length === 0 ? (
        <p className="empty">{tx("아직 만든 목록이 없어요. \"새 목록\"을 눌러 듣고 싶은 곡을 모아 보세요.")}</p>
      ) : (
        <ul className="pl two">
          {lists.items.map((p) => {
            const items = itemsOf(p)
            const lp = resumeOf(p, items)
            return (
              <li key={p.id}>
                <button className="lrow" onClick={() => setOpen(p.id)}>
                  <span className="x"><span className="x1">{p.name}</span><span className="x2 num">{lp ? tx("이어서 · {0} {1}", info(lp.t).song, fmt(lp.pos)) : meta(items)}</span></span>
                </button>
                <button className="pp" disabled={!items.length}
                  onClick={() => (lp ? play(items, lp.t.id, lp.pos, true, 'list:' + p.id) : play(items, items[0].id, undefined, true, 'list:' + p.id))}
                  aria-label={lp ? tx("{0} 이어서 듣기", p.name) : tx("{0} 듣기", p.name)}>
                  <Icon n="play" s={20} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <EditsSection edits={edits} tracks={tracks} player={player} play={play} />
      <h2 className="sub">{tx("저절로 모이는 목록")}</h2>
      <ul className="pl auto two">
        {autos.map((a) => (
          <li key={a.id}>
            <button className="lrow" onClick={() => setAuto(a.id)}>
              <span className="x"><span className="x1">{a.name}</span><span className="x2 num">{a.sub} · {nf.format(a.items.length)}{tx("곡")}</span></span>
              <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
            </button>
          </li>
        ))}
        {(groups.length > 0 || hide.ids.length > 0) && (
          <li>
            <button className="lrow" onClick={() => setDupes(true)}>
              <span className="x"><span className="x1">{tx("같은 곡이 여러 개")}</span><span className="x2 num">{groups.length ? tx("정리할 수 있는 곡 {0}개", nf.format(groups.reduce((s, g) => s + g.items.length - 1, 0))) : tx("빼 둔 곡 {0}개", nf.format(hide.ids.length))}</span></span>
              <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
            </button>
          </li>
        )}
      </ul>
      {naming && <NameSheet onClose={closeNaming} onDone={(name) => setOpen(lists.create(name))} />}
      {pl && <ListDetail pl={pl} items={itemsOf(pl)} tracks={tracks} lists={lists} player={player} play={play} onClose={closeOpen} resume={resumeOf(pl, itemsOf(pl))} />}
      {listen && <ListenPage tracks={tracks} player={player} onClose={closeListen} onPlayed={() => { closeListen(); onPlayed() }} />}
      {dupes && <DupesPage groups={groups} player={player} h={hide} onClose={closeDupes} />}
      {au && <AutoDetail a={au} player={player} play={play} onClose={closeAuto} />}
    </div>
  )
}

function ListDetail({ pl, items, tracks, lists, player, play, onClose, resume }: {
  pl: Playlist; items: Track[]; tracks: Track[]; lists: Playlists; player: Player; play: Player['playFrom']; onClose: () => void; resume: { t: Track; pos: number } | null
}) {
  const src = 'list:' + pl.id
  const [adding, setAdding] = useState(false)
  const [sure, setSure] = useState(false)
  const [memo, setMemo] = useState(false)
  const [rename, setRename] = useState(false)
  const [tagAt, setTagAt] = useState<number | null>(null)
  const [cue, setCue] = useState(false)
  const closeCue = useCallback(() => setCue(false), [])
  const closeAdding = useCallback(() => setAdding(false), [])
  const closeMemo = useCallback(() => setMemo(false), [])
  const closeRename = useCallback(() => setRename(false), [])
  const closeTag = useCallback(() => setTagAt(null), [])
  const tags = pl.tags || {}
  const tagT = tagAt != null ? items[tagAt] : undefined
  return (
    <Page label={pl.name} onClose={onClose}>
      <div className="lmeta-row">
        <p className="lmeta num">{meta(items)}</p>
        {!pl.memo && <button className="textlink" onClick={() => setMemo(true)}>{tx("메모 남기기")}</button>}
      </div>
      {pl.memo ? (
        <button className="lmemo" onClick={() => setMemo(true)} aria-label={tx("메모: {0}. 고치기", pl.memo)}>
          <span>{pl.memo}</span><small>{tx("고치기")}</small>
        </button>
      ) : null}
      <div className="acts">
        {resume && <button className="go grow" onClick={() => play(items, resume.t.id, resume.pos, true, src)}><Icon n="play" s={18} /><span className="one">{tx("이어서 · ")}{info(resume.t).song} <span className="num">{fmt(resume.pos)}</span></span></button>}
        {items.length > 0 && <button className={resume ? 'pillbtn' : 'go grow'} onClick={() => play(items, items[0].id, undefined, true, src)}><Icon n="play" s={18} />{tx("처음부터 듣기")}</button>}
        <button className="pillbtn" onClick={() => setAdding(true)}><Icon n="plus" s={18} />{tx("곡 추가")}</button>
      </div>
      {items.length > 0 && (
        <button className="cue-btn" onClick={() => setCue(true)}>
          <Icon n="cue" s={20} /><b>{tx("큐 모드")}</b><span>{tx("누를 때만 다음 곡 · 행사·예배 진행용")}</span><Icon n="chev" s={18} />
        </button>
      )}
      {items.length > 1 && !Object.keys(tags).length && <p className="hint">{tx("곡을 길게 누르면 색으로 표시해 둘 수 있어요.")}</p>}
      {items.length === 0 && <p className="empty">{tx("아직 담은 곡이 없어요. \"곡 추가\"를 눌러 담아 보세요.")}</p>}
      <EditRows tracks={items} currentId={player.current?.id}
        onTap={(i) => play(items, items[i].id, undefined, true, src)}
        onMove={(i, d) => lists.swap(pl.id, items[i].id, items[i + d].id)}
        onRemove={(i) => lists.removeTrack(pl.id, items[i].id)}
        tagOf={(t) => tags[t.id]} onLong={setTagAt} />
      {sure ? (
        <div className="confirm" role="alert">
          <p>"{pl.name}{tx("\" 목록을 지울까요? 음악 파일은 지워지지 않아요.")}</p>
          <div className="nb">
            <button className="ghost" onClick={() => setSure(false)}>{tx("그만두기")}</button>
            <button className="go danger" onClick={() => { lists.remove(pl.id); onClose() }}>{tx("목록 지우기")}</button>
          </div>
        </div>
      ) : (
        <div className="tlinks">
          <button className="textbtn plain" onClick={() => setRename(true)}>{tx("이름 바꾸기")}</button>
          <button className="textbtn" onClick={() => setSure(true)}>{tx("이 목록 지우기")}</button>
        </div>
      )}
      {memo && <MemoSheet name={pl.name} memo={pl.memo ?? ''} onDone={(m) => lists.setMemo(pl.id, m)} onClose={closeMemo} />}
      {rename && <NameSheet title={tx("목록 이름 바꾸기")} initial={pl.name} done={tx("바꾸기")} onDone={(n) => lists.rename(pl.id, n)} onClose={closeRename} />}
      {tagT && <TagSheet t={tagT} tag={tags[tagT.id]} onPick={(k) => lists.setTag(pl.id, tagT.id, k)} onClose={closeTag} />}
      {adding && <AddSongs tracks={tracks} has={(id) => pl.ids.includes(id)} onAdd={(t) => lists.add(pl.id, [t.id])} onClose={closeAdding} />}
      {cue && <CuePage listId={pl.id} name={pl.name} items={items} player={player} onClose={closeCue} />}
    </Page>
  )
}

function AutoDetail({ a, player, play, onClose }: { a: Auto; player: Player; play: Player['playFrom']; onClose: () => void }) {
  return (
    <Page label={a.name} onClose={onClose}>
      <p className="lmeta num">{a.sub} · {meta(a.items)}</p>
      {a.items.length > 0
        ? <div className="acts"><button className="go grow" onClick={() => play(a.items, a.items[0].id, undefined, true)}><Icon n="play" s={18} />{tx("처음부터 듣기")}</button></div>
        : <p className="empty">{a.id === 'often' ? tx("두 번 이상 들은 곡이 여기 모여요.") : tx("아직 해당하는 곡이 없어요.")}</p>}
      <VirtualList items={a.items} className="pl two" rowRem={4.25} render={(t) => {
        const x = info(t)
        return (
          <li key={t.id}>
            <button className="lrow" onClick={() => play(a.items, t.id, undefined, true)}>
              <span className="x"><span className="x1">{x.song}</span><span className="x2">{whoLine(x) || ' '}</span></span>
              <span className="d num">{a.id === 'often' ? tx("{0}번", nf.format(player.plays[t.id] ?? 0)) : t.duration ? fmt(t.duration) : ''}</span>
            </button>
          </li>
        )
      }} />
    </Page>
  )
}
