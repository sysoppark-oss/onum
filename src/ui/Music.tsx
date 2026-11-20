// 「음악」: 찾고, 고른 순서대로 듣기
import { useCallback, useMemo, useState } from 'react'
import { fmt, type ScanResult, type Track } from '../lib/library'
import { findRange, matches } from '../lib/hangul'
import type { Player, Repeat } from '../lib/usePlayer'
import type { Playlists } from '../lib/playlists'
import { Icon, Sheet, VirtualList, info, minutesText, nf, useLongPress } from './common'
import { byLecture, lectureOf, natural } from '../lib/kind'
import { load, save } from '../lib/store'
import { ChooseListSheet, RepeatSheet } from './Sheets'

type By = 'program' | 'singer' | 'original' | 'folder'
interface Group { by: By; name: string | null }
const BY_LABEL: Record<By, string> = { program: '프로그램', singer: '부른 사람', original: '원곡', folder: '폴더' }

function keyOf(t: Track, by: By): string {
  const x = info(t)
  return by === 'program' ? x.program : by === 'singer' ? x.singer : by === 'original' ? x.original : t.folder
}

/** 찾은 글자를 굵게 */
function Hl({ text, q }: { text: string; q: string }) {
  const r = q ? findRange(text, q) : null
  if (!r) return <>{text}</>
  const ch = [...text]
  return <>{ch.slice(0, r[0]).join('')}<mark>{ch.slice(r[0], r[0] + r[1]).join('')}</mark>{ch.slice(r[0] + r[1]).join('')}</>
}

export type MoveKind = (t: Track, scope: 'one' | 'folder', talk: boolean) => void

export function MusicScreen({ tracks: all, scan, player, lists, onPlayed, onKind }: {
  tracks: Track[]; scan: ScanResult; player: Player; lists: Playlists; onPlayed: () => void; onKind: MoveKind
}) {
  const [mode, setModeState] = useState<'music' | 'talk'>(() => load('libMode', 'music'))
  const setMode = (m: 'music' | 'talk') => { setModeState(m); save('libMode', m) }
  const tracks = useMemo(() => all.filter((t) => !t.talk), [all])
  const talks = useMemo(() => all.filter((t) => t.talk), [all])
  const [menu, setMenu] = useState<Track | null>(null)
  const [saveIds, setSaveIds] = useState<string[] | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const closeSaveIds = useCallback(() => setSaveIds(null), [])
  const lp = useLongPress()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<Group | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const closeAsk = useCallback(() => setAsking(false), [])
  const closeSave = useCallback(() => setSaving(false), [])

  const programs = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tracks) { const p = info(t).program; if (p) m.set(p, (m.get(p) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [tracks])
  const folders = useMemo(() => new Set(tracks.map((t) => t.folder)).size, [tracks])

  const filtered = useMemo(() => tracks.filter((t) => {
    if (group?.name != null && keyOf(t, group.by) !== group.name) return false
    if (!q) return true
    const x = info(t)
    return matches(x.song, q) || matches(x.singer, q) || matches(x.original, q) || matches(x.program, q) || matches(t.album, q) || matches(t.title, q)
  }), [tracks, q, group])

  const names = useMemo(() => {
    if (!group || group.name != null) return []
    const m = new Map<string, number>()
    for (const t of filtered) { const k = keyOf(t, group.by); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [filtered, group])

  const pick = (id: string) => setPicked((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]))
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all])

  // 강의: 폴더마다 1강, 2강 순서
  const talkGroups = useMemo(() => {
    const m = new Map<string, Track[]>()
    for (const t of talks) {
      if (q) { const x = info(t); if (!(matches(x.song, q) || matches(t.folder, q) || matches(x.singer, q))) continue }
      const a = m.get(t.folder) ?? []
      a.push(t)
      m.set(t.folder, a)
    }
    for (const a of m.values()) a.sort(byLecture)
    return [...m.entries()].sort((a, b) => natural.compare(a[0], b[0]))
  }, [talks, q])
  const pickedTracks = () => picked.map((id) => byId.get(id)).filter((t): t is Track => !!t)
  const hidden = scan.skippedShort + scan.skippedFolder
  const showNames = group != null && group.name == null

  const chip = (on: boolean, label: React.ReactNode, onClick: () => void, key: string) => (
    <button key={key} className={on ? 'on' : undefined} aria-pressed={on} onClick={onClick}>{label}</button>
  )

  const talk = mode === 'talk' && talks.length > 0

  const talkView = (
    <>
      {q && <p className="found num" role="status">'{q}' · {nf.format(talkGroups.reduce((n, g) => n + g[1].length, 0))}개 찾았어요</p>}
      {talkGroups.length === 0 && <p className="empty">맞는 강의가 없어요.</p>}
      {talkGroups.map(([f, items]) => {
        const done = items.filter((t) => player.talkDone[t.id]).length
        const numbered = items.some((t) => lectureOf(t).no)
        const unit = numbered ? '강' : '개'
        return (
          <section key={f} aria-label={f}>
            <div className="fold"><h2>{f || '이름 없는 폴더'}</h2><span className="num">{done ? `${nf.format(items.length)}${unit} 중 ${nf.format(done)}${unit} 다 들음` : `${nf.format(items.length)}${unit}`}</span></div>
            <ul className="lec">
              {items.map((t, i) => {
                const l = lectureOf(t)
                const isDone = !!player.talkDone[t.id]
                const now = player.current?.id === t.id
                const pos = now ? player.time : player.talkPos[t.id] ?? 0
                const pct = isDone ? 100 : t.duration ? Math.min(100, (pos / t.duration) * 100) : 0
                const state = isDone ? '다 들음' : pos > 5 ? `${Math.max(1, Math.floor(pos / 60))}분까지 들음` : '처음'
                return (
                  <li key={t.id} className={(isDone ? 'done' : '') + (now ? ' now' : '')}>
                    <button className="lrow" aria-current={now ? 'true' : undefined} {...lp(() => setMenu(t))}
                      onClick={() => { player.playFrom(items, t.id, isDone ? 0 : undefined, true); onPlayed() }}>
                      <span className="no num">{l.no || i + 1}</span>
                      <span className="x">
                        <span className="x1">{l.name}</span>
                        <span className="st num">{pct > 0 && <span className="pb" aria-hidden="true"><b style={{ width: `${pct}%` }} /></span>}{state}{t.duration ? ` · ${minutesText(Math.max(1, Math.round(t.duration / 60)))}` : ''}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </>
  )

  return (
    <div className={'page lib' + (picked.length && !talk ? ' picking' : '')}>
      <h1>음악</h1>
      {talks.length > 0 && (
        <div className="seg-top" role="group" aria-label="음악과 강의">
          <button className={mode === 'music' ? 'on' : undefined} aria-pressed={mode === 'music'} onClick={() => setMode('music')}>음악<span className="num">{nf.format(tracks.length)}</span></button>
          <button className={mode === 'talk' ? 'on' : undefined} aria-pressed={mode === 'talk'} onClick={() => setMode('talk')}>강의<span className="num">{nf.format(talks.length)}</span></button>
        </div>
      )}
      <label className="search">
        <Icon n="search" s={20} />
        <span className="sr">곡, 부른 사람, 원곡, 프로그램 찾기</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={talk ? '강의 찾기 (초성도 돼요)' : '곡·부른 사람 찾기 (초성도 돼요)'} autoComplete="off" enterKeyHint="search" />
        {q && <button className="clear" onClick={() => setQ('')} aria-label="찾는 글자 지우기"><Icon n="x" s={18} /></button>}
      </label>
      {talk ? talkView : (<>
      <div className="groups" role="group" aria-label="모아 보기">
        {chip(group == null, <>전체<span className="num">{nf.format(tracks.length)}</span></>, () => setGroup(null), 'all')}
        {programs.map(([p, n]) => chip(group?.by === 'program' && group.name === p, <>{p}<span className="num">{nf.format(n)}</span></>, () => setGroup({ by: 'program', name: p }), 'p' + p))}
        {(['singer', 'original'] as By[]).map((b) => chip(group?.by === b, BY_LABEL[b], () => setGroup({ by: b, name: null }), b))}
        {folders > 1 && chip(group?.by === 'folder', BY_LABEL.folder, () => setGroup({ by: 'folder', name: null }), 'folder')}
      </div>
      {group && group.by !== 'program' && group.name != null && (
        <button className="crumb" onClick={() => setGroup({ by: group.by, name: null })}><Icon n="back" s={18} />{BY_LABEL[group.by]} · {group.name}</button>
      )}
      <p className="found num" role="status">
        {showNames ? `${BY_LABEL[group!.by]} ${nf.format(names.length)}명`
          : q ? `'${q}' · ${nf.format(filtered.length)}곡 찾았어요`
            : `${nf.format(filtered.length)}곡${!group && hidden > 0 ? ` · 짧은 소리·녹음 ${nf.format(hidden)}개는 뺐어요` : ''}`}
      </p>
      {note && <p className="done-note" role="status">{note}</p>}
      {!showNames && filtered.length === 0 && (
        <p className="empty">{q ? `'${q}'에 맞는 곡이 없어요. 초성이나 부른 사람 이름으로도 찾아 보세요.` : '곡이 없어요.'}</p>
      )}
      {showNames ? (
        <VirtualList items={names} className="pl" rowRem={4.25} render={([name, n]) => (
          <li key={name}>
            <button className="lrow" onClick={() => setGroup({ by: group!.by, name })}>
              <span className="x"><span className="x1">{name}</span></span>
              <span className="d num">{nf.format(n)}곡</span><Icon n="chev" s={18} />
            </button>
          </li>
        )} />
      ) : (
        <VirtualList items={filtered} className="list" render={(t) => {
          const x = info(t)
          const at = picked.indexOf(t.id)
          const now = player.current?.id === t.id
          const parts: React.ReactNode[] = []
          if (x.singer) parts.push(<Hl key="s" text={x.singer} q={q} />)
          if (x.original) parts.push(<span key="o">원곡 <Hl text={x.original} q={q} /></span>)
          if (x.episode) parts.push(<span key="e">{x.episode}</span>)
          return (
            <li key={t.id} className={(at >= 0 ? 'on' : '') + (now ? ' now' : '')}>
              <button className="pick" aria-pressed={at >= 0} onClick={() => pick(t.id)} aria-label={`${x.song} 고르기`}>
                <span className="dot num" aria-hidden="true">{at >= 0 ? at + 1 : ''}</span>
              </button>
              <button className="lmain" aria-current={now ? 'true' : undefined} {...lp(() => setMenu(t))} onClick={() => player.playFrom(filtered, t.id)}>
                <span className="x">
                  <span className="x1"><Hl text={x.song} q={q} /></span>
                  <span className="x2">{parts.length ? parts.flatMap((p, i) => (i ? [' · ', p] : [p])) : t.album || ' '}</span>
                </span>
                <span className="d num">{t.duration ? fmt(t.duration) : ''}</span>
              </button>
            </li>
          )
        }} />
      )}
      </>)}
      {picked.length > 0 && !talk && (
        <div className="bar" role="region" aria-label="고른 곡">
          <button className="bx" onClick={() => setPicked([])} aria-label="고른 것 모두 풀기"><Icon n="x" s={20} /></button>
          <p role="status"><b className="num">{nf.format(picked.length)}곡 골랐어요</b><span>고른 순서대로 들어요</span></p>
          <button className="bs" onClick={() => setSaving(true)}>담기</button>
          <button className="bp" onClick={() => setAsking(true)}>듣기</button>
        </div>
      )}
      {asking && (
        <RepeatSheet player={player} count={picked.length} onClose={closeAsk} onApply={(r: Repeat) => {
          const sel = pickedTracks()
          if (!sel.length) return
          player.setRepeat(r)
          player.playFrom(sel, sel[0].id, 0, true)
          setPicked([])
          onPlayed()
        }} />
      )}
      {menu && <ItemMenu t={menu} player={player} onClose={closeMenu} onKind={onKind}
        onSave={() => setSaveIds([menu.id])} onPlay={() => {
          const list = menu.talk ? talks.filter((x) => x.folder === menu.folder).sort(byLecture) : tracks
          player.playFrom(list, menu.id, 0, menu.talk)
          onPlayed()
        }} />}
      {saveIds && <ChooseListSheet lists={lists} ids={saveIds} onClose={closeSaveIds} onDone={(name) => setNote(`"${name}" 목록에 담았어요`)} />}
      {saving && <ChooseListSheet lists={lists} ids={picked} onClose={closeSave} onDone={(name) => { setPicked([]); setNote(`"${name}" 목록에 담았어요`) }} />}
    </div>
  )
}

/** 길게 눌렀을 때 */
function ItemMenu({ t, player, onClose, onKind, onSave, onPlay }: {
  t: Track; player: Player; onClose: () => void; onKind: MoveKind; onSave: () => void; onPlay: () => void
}) {
  const x = info(t)
  const l = t.talk ? lectureOf(t) : null
  const done = !!player.talkDone[t.id]
  const go = (fn: () => void) => () => { fn(); onClose() }
  const where = t.talk ? '음악으로' : '강의로'
  return (
    <Sheet label={l ? l.name : x.song} onClose={onClose}>
      <div className="who-s">
        <p>{l ? (l.no ? `${l.no} · ${l.name}` : l.name) : x.song}</p>
        <p className="num">{[t.talk ? t.folder : x.singer, t.duration ? minutesText(Math.max(1, Math.round(t.duration / 60))) : ''].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="menu">
        <button onClick={go(onPlay)}><Icon n="play" s={20} />처음부터 듣기</button>
        <button onClick={() => { onClose(); onSave() }}><Icon n="list" s={20} />목록에 담기</button>
        {t.talk && <button onClick={go(() => player.markDone(t.id, !done))}><Icon n={done ? 'undo' : 'check'} s={20} />{done ? '안 들은 것으로 되돌리기' : '다 들은 것으로 표시'}</button>}
        <button onClick={go(() => onKind(t, 'one', !t.talk))}><Icon n="move" s={20} />{where} 옮기기<small>{t.talk ? '강의가 아니에요' : '강의예요'}</small></button>
        {t.folder && <button onClick={go(() => onKind(t, 'folder', !t.talk))}><Icon n="move" s={20} /><span className="one">「{t.folder}」 폴더 모두 {where}</span></button>}
      </div>
    </Sheet>
  )
}
