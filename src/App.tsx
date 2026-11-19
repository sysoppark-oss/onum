import { useEffect, useMemo, useState } from 'react'
import { fmt, scanFiles, type ScanResult, type Track } from './lib/library'
import { matches } from './lib/hangul'
import { usePlayer, type Player } from './lib/usePlayer'
import { isNative, nativeArt, scanDevice } from './lib/native'
import { App as CapApp } from '@capacitor/app'
import { load, save } from './lib/store'

type Tab = 'home' | 'library' | 'practice' | 'worship'

// 개역한글. 하루에 한 문장씩 돌아간다.
const VERSES = [
  { text: '여호와는 나의 목자시니 내가 부족함이 없으리로다', ref: '시편 23:1' },
  { text: '그러므로 믿음은 들음에서 나며 들음은 그리스도의 말씀으로 말미암았느니라', ref: '로마서 10:17' },
  { text: '또 가라사대 너희는 온 천하에 다니며 만민에게 복음을 전파하라', ref: '마가복음 16:15' },
]
const verse = VERSES[Math.floor(Date.now() / 86400000) % VERSES.length]

export default function App() {
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [full, setFull] = useState(false)
  const tracks = scan?.tracks ?? []
  const player = usePlayer(tracks)

  // 뒤로 버튼: 재생 화면이면 닫고, 아니면 앱을 끄지 않고 뒤로 숨긴다(음악은 계속)
  useEffect(() => {
    if (!isNative) return
    const h = CapApp.addListener('backButton', () => {
      if (full) setFull(false)
      else if (tab !== 'home') setTab('home')
      else CapApp.minimizeApp()
    })
    return () => { h.then((x) => x.remove()) }
  }, [full, tab])

  if (!scan || tracks.length === 0) return <Import onDone={setScan} empty={scan !== null} />

  return (
    <div className="app">
      <main className="screen">
        {tab === 'home' && <Home tracks={tracks} player={player} onOpen={() => setFull(true)} />}
        {tab === 'library' && <Library tracks={tracks} scan={scan} player={player} />}
        {tab === 'practice' && <Later title="연습" what="구간 반복, 음 높이를 유지한 빠르기 조절, 키 바꾸기" />}
        {tab === 'worship' && <Later title="찬양·묵상" what="찬송가 반주 무료 팩, 묵상 모드" />}
      </main>
      {player.current && !full && <Mini player={player} onOpen={() => setFull(true)} />}
      <TabBar tab={tab} setTab={setTab} />
      {full && player.current && <Full player={player} onClose={() => setFull(false)} />}
    </div>
  )
}

/* ───────── 처음 설정: 음악 불러오기 ───────── */
function Import({ onDone, empty }: { onDone: (r: ScanResult) => void; empty: boolean }) {
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)

  const [error, setError] = useState('')

  async function findOnDevice() {
    setError('')
    setBusy({ done: 0, total: 0 })
    try {
      const r = await scanDevice()
      save('scanned', true)
      onDone(r)
    } catch (e) {
      setError(String(e).includes('permission') ? '음악을 찾으려면 "음악 및 오디오" 접근을 허용해 주세요.' : '음악을 찾지 못했어요. 다시 눌러 보세요.')
    }
    setBusy(null)
  }

  // 한 번 허락받은 뒤에는 켤 때마다 자동으로 다시 찾는다
  useEffect(() => {
    if (isNative && load('scanned', false)) findOnDevice()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pick(list: FileList | null) {
    if (!list || !list.length) return
    setBusy({ done: 0, total: list.length })
    const r = await scanFiles([...list], (done, total) => setBusy({ done, total }))
    setBusy(null)
    onDone(r)
  }

  return (
    <div className="app pad onboard">
      <p className="brand">온음</p>
      <h1 className="h-big">휴대폰 속 음악을<br />불러올게요</h1>
      <p className="muted">음악 파일은 이 기기 밖으로 나가지 않아요. 30초보다 짧은 소리와 통화·음성 녹음 폴더는 빼고 가져와요.</p>
      {empty && <p className="warn" role="alert">음악 파일을 찾지 못했어요. {isNative ? '휴대폰에 음악 파일이 있는지 확인해 주세요.' : '다른 폴더를 골라 보세요.'}</p>}
      {error && <p className="warn" role="alert">{error}</p>}
      {busy ? (
        <div className="progress" role="status">
          <p>{busy.total ? `음악 정리 중… ${busy.done} / ${busy.total}` : '휴대폰 속 음악을 찾는 중…'}</p>
          <div className="bar"><span style={{ width: `${(busy.done / Math.max(busy.total, 1)) * 100}%` }} /></div>
        </div>
      ) : isNative ? (
        <div className="stack">
          <button className="primary" onClick={findOnDevice}>음악 찾기 시작</button>
        </div>
      ) : (
        <div className="stack">
          <label className="primary pick">
            음악 폴더 고르기
            <input type="file" className="sr" multiple
              // @ts-expect-error 폴더 선택은 표준 속성이 아님
              webkitdirectory=""
              onChange={(e) => pick(e.target.files)} />
          </label>
          <label className="secondary pick">
            파일 직접 고르기
            <input type="file" className="sr" multiple accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg"
              onChange={(e) => pick(e.target.files)} />
          </label>
        </div>
      )}
      {!isNative && <p className="small muted">버튼을 눌러도 아무 창이 뜨지 않으면, 오른쪽 위 ⋮ 메뉴에서 크롬 같은 브라우저로 열어 주세요.</p>}
    </div>
  )
}

/* ───────── 홈 ───────── */
function Home({ tracks, player, onOpen }: { tracks: Track[]; player: Player; onOpen: () => void }) {
  const r = player.resumeTrack
  const recent = useMemo(() => [...tracks].sort((a, b) => b.added - a.added).slice(0, 8), [tracks])
  return (
    <div className="pad col">
      <p className="brand">온음</p>
      {r && !player.current && (
        <button className="resume" onClick={() => { player.playFrom(tracks, r.id, player.resumePos); onOpen() }}>
          <Art t={r} size={56} />
          <span className="grow left">
            <span className="small tint">이어 듣기 · {fmt(player.resumePos)}부터</span>
            <span className="strong one">{r.title}</span>
          </span>
          <PlayIcon />
        </button>
      )}
      <section className="verse" aria-label="오늘의 한 문장">
        <p className="small soft">오늘의 한 문장</p>
        <p className="verse-text">{verse.text}</p>
        <p className="small soft">{verse.ref} · 개역한글</p>
      </section>
      <section>
        <h2 className="h-sec">최근 추가한 곡</h2>
        <div className="shelf">
          {recent.map((t) => (
            <button key={t.id} className="card" onClick={() => player.playFrom(recent, t.id)}>
              <Art t={t} size={132} />
              <span className="strong one">{t.title}</span>
              <span className="small muted one">{t.artist}</span>
            </button>
          ))}
        </div>
      </section>
      <button className="secondary" onClick={() => {
        const first = tracks[Math.floor(Math.random() * tracks.length)]
        if (!player.shuffle) player.toggleShuffle()
        player.playFrom(tracks, first.id)
      }}>모든 곡 골고루 섞어 듣기</button>
    </div>
  )
}

/* ───────── 내 음악 ───────── */
type View = 'songs' | 'artists' | 'folders'
function Library({ tracks, scan, player }: { tracks: Track[]; scan: ScanResult; player: Player }) {
  const [q, setQ] = useState('')
  const [view, setView] = useState<View>('songs')
  const [group, setGroup] = useState<string | null>(null)

  const keyOf = (t: Track) => (view === 'artists' ? t.artist : t.folder)
  const filtered = useMemo(() => tracks.filter((t) =>
    (group == null || keyOf(t) === group) &&
    (matches(t.title, q) || matches(t.artist, q) || matches(t.album, q))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [tracks, q, group, view])

  const groups = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of filtered) m.set(keyOf(t), (m.get(keyOf(t)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, view])

  const showSongs = view === 'songs' || group != null
  const hidden = scan.skippedShort + scan.skippedFolder

  return (
    <div className="pad col">
      <h1 className="h-title">내 음악</h1>
      <label className="search">
        <SearchIcon />
        <span className="sr">곡, 가수 찾기</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="곡·가수 찾기 (ㄹㅅㄴ처럼 초성도 돼요)" />
      </label>
      <div className="seg" role="tablist" aria-label="보기">
        {([['songs', '곡'], ['artists', '가수'], ['folders', '폴더']] as const).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => { setView(v); setGroup(null) }}>{l}</button>
        ))}
      </div>
      <p className="small muted" role="status">
        {filtered.length}곡{hidden > 0 && ` · 짧은 소리·녹음 ${hidden}개는 숨겼어요`}
      </p>
      {group != null && (
        <button className="back-chip" onClick={() => setGroup(null)}>‹ {group}</button>
      )}
      {showSongs ? (
        <ul className="list">
          {filtered.map((t) => (
            <li key={t.id}>
              <button className={'row' + (player.current?.id === t.id ? ' on' : '')}
                aria-current={player.current?.id === t.id ? 'true' : undefined}
                onClick={() => player.playFrom(filtered, t.id)}>
                <Art t={t} size={48} />
                <span className="grow left">
                  <span className="one">{t.title}</span>
                  <span className="small muted one">{t.artist}</span>
                </span>
                <span className="small muted">{t.duration ? fmt(t.duration) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="list">
          {groups.map(([name, n]) => (
            <li key={name}>
              <button className="row" onClick={() => setGroup(name)}>
                <span className="grow left"><span className="one">{name}</span></span>
                <span className="small muted">{n}곡 ›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Later({ title, what }: { title: string; what: string }) {
  return (
    <div className="pad col">
      <h1 className="h-title">{title}</h1>
      <p className="muted">다음 단계에서 만들어요: {what}</p>
    </div>
  )
}

/* ───────── 재생 ───────── */
function Mini({ player, onOpen }: { player: Player; onOpen: () => void }) {
  const t = player.current!
  return (
    <div className="mini">
      <button className="mini-open" onClick={onOpen} aria-label={`지금 재생 화면 열기: ${t.title}`}>
        <Art t={t} size={44} />
        <span className="grow left">
          <span className="one strong">{t.title}</span>
          <span className="small muted one">{t.artist}</span>
        </span>
      </button>
      <button className="icon" onClick={player.toggle} aria-label={player.playing ? '일시 정지' : '재생'}>
        {player.playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="mini-bar" style={{ width: `${(player.time / (player.duration || 1)) * 100}%` }} />
    </div>
  )
}

function Full({ player, onClose }: { player: Player; onClose: () => void }) {
  const t = player.current!
  return (
    <div className="full" role="dialog" aria-modal="true" aria-label="지금 재생">
      <div className="full-head">
        <button className="icon" onClick={onClose} aria-label="닫기"><DownIcon /></button>
        <p className="small muted">지금 재생</p>
        <span style={{ width: 48 }} />
      </div>
      <div className="full-art"><Art t={t} size={300} /></div>
      <h1 className="full-title one">{t.title}</h1>
      <p className="muted one">{t.artist}{t.album && ` · ${t.album}`}</p>
      <label className="sr" htmlFor="seek">재생 위치</label>
      <input id="seek" type="range" className="seek" min={0} max={player.duration || 0} step={1}
        value={player.time} onChange={(e) => player.seek(+e.target.value)}
        aria-valuetext={`${fmt(player.time)} / ${fmt(player.duration)}`} />
      <div className="times small muted"><span>{fmt(player.time)}</span><span>{fmt(player.duration)}</span></div>
      <div className="controls">
        <button className="icon big" onClick={() => player.go(-1)} aria-label="이전 곡"><PrevIcon /></button>
        <button className="play" onClick={player.toggle} aria-label={player.playing ? '일시 정지' : '재생'}>
          {player.playing ? <PauseIcon s={36} /> : <PlayIcon s={36} />}
        </button>
        <button className="icon big" onClick={() => player.go(1)} aria-label="다음 곡"><NextIcon /></button>
      </div>
      <div className="chips">
        <button className="chip" aria-pressed={player.shuffle} onClick={player.toggleShuffle}>
          {player.shuffle && '✓ '}골고루 섞기
        </button>
      </div>
    </div>
  )
}

/* ───────── 공통 ───────── */
function Art({ t, size }: { t: Track; size: number }) {
  const [src, setSrc] = useState(t.art)
  useEffect(() => {
    setSrc(t.art)
    if (!t.art && t.nativeId != null) {
      let alive = true
      nativeArt(t).then((u) => { if (alive && u) setSrc(u) })
      return () => { alive = false }
    }
  }, [t])
  return src
    ? <img className="art" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="art art-none" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.36 }}>{t.title.slice(0, 1)}</span>
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: [Tab, string, React.ReactNode][] = [
    ['home', '홈', <path key="h" d="M3 10.5 12 4l9 6.5V20H3z" />],
    ['library', '내 음악', <g key="l"><line x1="5" y1="5" x2="5" y2="19" /><line x1="9" y1="5" x2="9" y2="19" /><rect x="13" y="5" width="5" height="14" rx="1" /></g>],
    ['practice', '연습', <g key="p"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="21" /></g>],
    ['worship', '찬양·묵상', <g key="w"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z" /><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></g>],
  ]
  return (
    <nav className="tabs" aria-label="주요 메뉴">
      {items.map(([id, label, icon]) => (
        <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === id ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
          {label}
        </button>
      ))}
    </nav>
  )
}

const I = ({ children, s = 24 }: { children: React.ReactNode; s?: number }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{children}</svg>
const PlayIcon = ({ s }: { s?: number }) => <I s={s}><polygon points="7 4 20 12 7 20" /></I>
const PauseIcon = ({ s }: { s?: number }) => <I s={s}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></I>
const PrevIcon = () => <I s={32}><polygon points="18 5 8 12 18 19" /><rect x="5" y="5" width="2.6" height="14" rx="1" /></I>
const NextIcon = () => <I s={32}><polygon points="6 5 16 12 6 19" /><rect x="16.4" y="5" width="2.6" height="14" rx="1" /></I>
const DownIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
const SearchIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>

