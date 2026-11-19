import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fmt, scanFiles, type ScanResult, type Track } from './lib/library'
import { matches } from './lib/hangul'
import { usePlayer, type Player, type Repeat } from './lib/usePlayer'
import { getFontScale, getOutput, isNative, nativeArt, onOutput, scanDevice, type Output } from './lib/native'
import { App as CapApp } from '@capacitor/app'
import { load, save } from './lib/store'

type Tab = 'home' | 'library' | 'practice' | 'worship'

const nf = new Intl.NumberFormat('ko-KR')

// 떠 있는 창들 (맨 나중에 연 것이 맨 위). 뒤로 버튼·Esc는 맨 위 창부터 닫는다.
const closers: (() => void)[] = []
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([type=hidden]), [tabindex]:not([tabindex="-1"])'

/** 창이 뜨면 초점을 창으로 옮겨 그 안에 가두고, 닫히면 원래 자리로 돌려준다 */
function useDialog(onClose: () => void) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    closers.push(onClose)
    box.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (closers[closers.length - 1] !== onClose || !box.current) return
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      const at = document.activeElement
      if (!box.current.contains(at)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && (at === first || at === box.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      const i = closers.lastIndexOf(onClose)
      if (i >= 0) closers.splice(i, 1)
      before?.focus?.()
    }
  }, [onClose])
  return box
}

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
  const output = useOutput(player)
  const openFull = useCallback(() => setFull(true), [])
  const closeFull = useCallback(() => setFull(false), [])

  // 설치형 앱: 휴대폰의 글자 크기 설정을 따라간다
  useEffect(() => {
    getFontScale().then((k) => { if (k) document.documentElement.style.fontSize = `${Math.round(k * 100)}%` })
  }, [])

  // 뒤로 버튼: 재생 화면이면 닫고, 아니면 앱을 끄지 않고 뒤로 숨긴다(음악은 계속)
  useEffect(() => {
    if (!isNative) return
    const h = CapApp.addListener('backButton', () => {
      if (closers.length) closers[closers.length - 1]()
      else if (tab !== 'home') setTab('home')
      else CapApp.minimizeApp()
    })
    return () => { h.then((x) => x.remove()) }
  }, [tab])

  if (!scan || tracks.length === 0) return <Import onDone={setScan} empty={scan !== null} />

  return (
    <div className="app">
      <main className="screen" inert={full}>
        {tab === 'home' && <Home tracks={tracks} player={player} onOpen={openFull} />}
        {tab === 'library' && <Library tracks={tracks} scan={scan} player={player} />}
        {tab === 'practice' && <Later title="연습" what="구간 반복, 음 높이를 유지한 빠르기 조절, 키 바꾸기" />}
        {tab === 'worship' && <Later title="찬양·묵상" what="찬송가 반주 무료 팩, 묵상 모드" />}
      </main>
      {player.current && !full && <Mini player={player} onOpen={openFull} />}
      <TabBar tab={tab} setTab={setTab} hidden={full} />
      {full && player.current && <Full player={player} output={output} onClose={closeFull} />}
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
          <p>{busy.total ? `음악 정리 중… ${nf.format(busy.done)} / ${nf.format(busy.total)}` : '휴대폰 속 음악을 찾는 중…'}</p>
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
            <Card key={t.id} t={t} onPlay={() => player.playFrom(recent, t.id)} />
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
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [ask, setAsk] = useState(false)
  const pick = (id: string) => setPicked((old) => {
    const n = new Set(old)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const stopPicking = () => { setPicking(false); setPicked(new Set()) }
  const closeAsk = useCallback(() => setAsk(false), [])
  const order = useMemo(() => [...picked], [picked]) // 고른 순서

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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="곡·가수 찾기 (초성도 돼요)" autoComplete="off" enterKeyHint="search" />
      </label>
      <div className="seg" role="tablist" aria-label="보기">
        {([['songs', '곡'], ['artists', '가수'], ['folders', '폴더']] as const).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => { setView(v); setGroup(null) }}>{l}</button>
        ))}
      </div>
      <p className="small muted" role="status">
        {nf.format(filtered.length)}곡{hidden > 0 && ` · 짧은 소리·녹음 ${nf.format(hidden)}개는 숨겼어요`}
      </p>
      <div className="rowgap">
        {group != null && <button className="back-chip" onClick={() => setGroup(null)}>‹ {group}</button>}
        {showSongs && (
          <button className="back-chip" aria-pressed={picking} onClick={() => (picking ? stopPicking() : setPicking(true))}>
            {picking ? '고르기 취소' : '곡 골라서 듣기'}
          </button>
        )}
      </div>
      {filtered.length === 0 && (
        <p className="muted empty">{q ? `"${q}"에 맞는 곡이 없어요. 초성이나 가수 이름으로도 찾아 보세요.` : '곡이 없어요.'}</p>
      )}
      {showSongs ? (
        <VirtualList items={filtered} render={(t) => (
          <li key={t.id}>
            <button className={'row' + (player.current?.id === t.id ? ' on' : '')}
              aria-current={player.current?.id === t.id ? 'true' : undefined}
              aria-pressed={picking ? picked.has(t.id) : undefined}
              onClick={() => (picking ? pick(t.id) : player.playFrom(filtered, t.id))}>
              {picking && <span className={'tick' + (picked.has(t.id) ? ' on' : '')} aria-hidden="true">{picked.has(t.id) && order.indexOf(t.id) + 1}</span>}
              <Art t={t} size={48} />
              <span className="grow left">
                <span className="one">{t.title}</span>
                <span className="small muted one">{t.artist}</span>
              </span>
              <span className="small muted num">{t.duration ? fmt(t.duration) : ''}</span>
            </button>
          </li>
        )} />
      ) : (
        <VirtualList items={groups} render={([name, n]) => (
          <li key={name}>
            <button className="row" onClick={() => setGroup(name)}>
              <span className="grow left"><span className="one">{name}</span></span>
              <span className="small muted num">{nf.format(n)}곡 ›</span>
            </button>
          </li>
        )} />
      )}
      {picking && picked.size > 0 && (
        <div className="pickbar">
          <span className="strong" role="status">{nf.format(picked.size)}곡 골랐어요 · 고른 순서대로 틀어요</span>
          <button className="primary" onClick={() => setAsk(true)}>반복 정하고 듣기</button>
        </div>
      )}
      {ask && (
        <RepeatSheet player={player} count={picked.size} onClose={closeAsk}
          onApply={(r) => {
            const byId = new Map(tracks.map((t) => [t.id, t]))
            const sel = order.map((id) => byId.get(id)).filter((t): t is Track => !!t)
            player.setRepeat(r)
            player.playFrom(sel, sel[0].id, 0, true)
            stopPicking()
          }} />
      )}
    </div>
  )
}

/** 긴 목록: 화면에 보이는 줄과 그 위아래 몇 줄만 그린다. 한 줄 높이는 4rem. */
function VirtualList<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null)
  const [range, setRange] = useState({ from: 0, to: 24 })
  useEffect(() => {
    let raf = 0
    const calc = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const rowH = parseFloat(getComputedStyle(document.documentElement).fontSize) * 4
      const top = el.getBoundingClientRect().top
      const from = Math.max(0, Math.floor(-top / rowH) - 8)
      const to = Math.min(items.length, Math.ceil((window.innerHeight - top) / rowH) + 8)
      setRange((r) => (r.from === from && r.to === to ? r : { from, to }))
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(calc) }
    calc()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [items.length])
  const from = Math.min(range.from, items.length)
  const to = Math.min(Math.max(range.to, from), items.length)
  return (
    <ul ref={ref} className="list" style={{ paddingTop: `${from * 4}rem`, paddingBottom: `${(items.length - to) * 4}rem` }}>
      {items.slice(from, to).map(render)}
    </ul>
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
      <span className="mini-bar" style={{ transform: `scaleX(${Math.min(1, player.time / (player.duration || 1))})` }} />
    </div>
  )
}

function Full({ player, output, onClose }: { player: Player; output: Output | null; onClose: () => void }) {
  const t = player.current!
  const [sheet, setSheet] = useState(false)
  const closeSheet = useCallback(() => setSheet(false), [])
  const box = useDialog(onClose)
  return (
    <div ref={box} tabIndex={-1} className="full" role="dialog" aria-modal="true" aria-label="지금 재생">
      <div className="full-head">
        <button className="icon" onClick={onClose} aria-label="닫기"><DownIcon /></button>
        {output
          ? <p className="out small" role="status"><OutIcon kind={output.kind} />{outputLabel(output)}</p>
          : <p className="small muted">지금 재생</p>}
        <span className="spacer" />
      </div>
      <div className="full-art"><Art t={t} size={300} /></div>
      <h1 className="full-title">{t.title}</h1>
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
        <button className="chip" aria-pressed={player.repeat.limit !== 'once'} aria-haspopup="dialog" onClick={() => setSheet(true)}>
          {repeatLabel(player.repeat, player.repeatLeft)}
        </button>
      </div>
      {sheet && <RepeatSheet player={player} onClose={closeSheet} />}
    </div>
  )
}

/* ───────── 반복 ───────── */
function minutesText(m: number): string {
  const h = Math.floor(m / 60), r = m % 60
  return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`
}

function repeatLabel(r: Repeat, leftMs: number): string {
  const what = r.scope === 'one' ? '한 곡' : '모두'
  if (r.limit === 'once') return `${what} 한 번만`
  if (r.limit === 'forever') return `✓ ${what} 계속 반복`
  const left = Math.ceil(leftMs / 60000)
  return `✓ ${what} 반복 · ${minutesText(left)} 남음`
}

/** count가 있으면 "고른 곡"을 위한 창: 무엇을(한 곡·모두)은 묻지 않는다 */
function RepeatSheet({ player, onClose, count, onApply }: {
  player: Player; onClose: () => void; count?: number; onApply?: (r: Repeat) => void
}) {
  const [r, setR] = useState<Repeat>(count ? { ...player.repeat, scope: 'all' } : player.repeat)
  const box = useDialog(onClose)
  // 컴포넌트가 아니라 함수로 그린다: 누른 버튼이 다시 만들어져 초점을 잃지 않게
  const opt = <K extends keyof Repeat>(k: K, v: Repeat[K], label: string) => (
    <button key={String(v)} className="opt" aria-pressed={r[k] === v} onClick={() => setR({ ...r, [k]: v })}>
      {r[k] === v && '✓ '}{label}
    </button>
  )
  const step = (d: number) => setR({ ...r, minutes: Math.min(720, Math.max(5, r.minutes + d)) })
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" onClick={(e) => e.stopPropagation()}>
        <h2 id="sheet-h" className="h-sec">{count ? `고른 ${nf.format(count)}곡 듣기` : '반복'}</h2>
        {!count && (
          <>
            <p className="small muted">무엇을</p>
            <div className="opts" role="group" aria-label="무엇을">
              {opt('scope', 'one', '한 곡')}
              {opt('scope', 'all', '모두')}
            </div>
          </>
        )}
        <p className="small muted">얼마나</p>
 <div className="opts" role="group" aria-label="얼마나">
          {opt('limit', 'once', '한 번만')}
          {opt('limit', 'forever', '계속')}
          {opt('limit', 'timed', '시간 동안')}
        </div>
        {r.limit === 'timed' && (
          <>
            <div className="opts" role="group" aria-label="시간">
              {[10, 30, 60, 120].map((m) => opt('minutes', m, minutesText(m)))}
            </div>
            <div className="stepper">
              <button className="opt" onClick={() => step(-5)} aria-label="5분 줄이기">− 5분</button>
              <p className="strong" role="status">{minutesText(r.minutes)}</p>
              <button className="opt" onClick={() => step(5)} aria-label="5분 늘리기">+ 5분</button>
            </div>
            <p className="small muted">{minutesText(r.minutes)} 동안 계속 반복하고, 시간이 지나면 듣던 곡까지만 틀고 멈춰요. 일시 정지한 동안은 시간을 세지 않아요.</p>
          </>
        )}
        <button className="primary" onClick={() => { if (onApply) onApply(r); else player.setRepeat(r); onClose() }}>
          {count ? '듣기 시작' : '적용'}
        </button>
      </div>
    </div>
  )
}

/* ───────── 소리 나가는 곳 ───────── */
function useOutput(player: Player): Output | null {
  const [out, setOut] = useState<Output | null>(null)
  const ref = useRef(player)
  ref.current = player
  const prev = useRef<Output | null>(null)
  useEffect(() => {
    const apply = (o: Output | null) => {
      if (!o) return
      // 이어폰·블루투스가 빠지면 스피커로 크게 나오지 않게 멈춘다
      if (prev.current && prev.current.kind !== 'speaker' && o.kind === 'speaker' && ref.current.playing) ref.current.pause()
      prev.current = o
      setOut(o)
    }
    getOutput().then(apply)
    return onOutput(apply)
  }, [])
  return out
}

function outputLabel(o: Output): string {
  if (o.kind === 'bluetooth') return o.name ? `블루투스 · ${o.name}` : '블루투스 연결됨'
  if (o.kind === 'wired') return '이어폰 연결됨'
  return '휴대폰 스피커'
}

function OutIcon({ kind }: { kind: Output['kind'] }) {
  const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'bluetooth') return <svg {...p}><polyline points="6 7 18 17 12 22 12 2 18 7 6 17" /></svg>
  if (kind === 'wired') return <svg {...p}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>
  return <svg {...p}><rect x="6" y="3" width="12" height="18" rx="2" /><circle cx="12" cy="14" r="3" /><line x1="12" y1="7" x2="12" y2="7" /></svg>
}

/** 앨범 그림이 없을 때 보여 줄 한 글자: "[우리들의 발라드] 김…" → "김" */
function initial(title: string): string {
  const s = title.replace(/^(\s*[[(【][^\])】]*[\])】])+/, '')
  const m = (s || title).match(/[가-힣A-Za-z0-9]/)
  return m ? m[0] : '♪'
}

/* ───────── 공통 ───────── */
/** 앨범 그림 주소. 설치형 앱에서는 화면에 보일 때만 휴대폰에 요청한다. */
function useArt(t: Track): [string | undefined, (n: HTMLElement | null) => void] {
  const [src, setSrc] = useState(t.art)
  const el = useRef<HTMLElement | null>(null)
  useEffect(() => {
    setSrc(t.art)
    if (t.art || t.nativeId == null || !el.current) return
    let alive = true
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      nativeArt(t).then((u) => { if (alive && u) setSrc(u) })
    }, { rootMargin: '200px' })
    io.observe(el.current)
    return () => { alive = false; io.disconnect() }
  }, [t])
  return [src, (n) => { el.current = n }]
}

function ArtView({ t, size, src, setEl }: { t: Track; size: number; src?: string; setEl: (n: HTMLElement | null) => void }) {
  if (src) return <img className="art" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
  if (size < 100) {
    return <span ref={setEl} className="art art-none" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initial(t.title)}</span>
  }
  // 그림이 없으면 제목과 가수를 두 줄로
  return (
    <span ref={setEl} className="art art-none art-text" aria-hidden="true" style={{ width: size, height: size, fontSize: `min(${Math.min(24, Math.max(14, size * 0.085)) / 16}rem, ${Math.round(size * 0.125)}px)` }}>
      <span className="art-title">{t.title}</span>
      <span className="art-artist">{t.artist}</span>
    </span>
  )
}

function Art({ t, size }: { t: Track; size: number }) {
  const [src, setEl] = useArt(t)
  return <ArtView t={t} size={size} src={src} setEl={setEl} />
}

/** 홈의 곡 카드. 그림이 없으면 카드 안에 제목·가수가 있으니 아래에 또 쓰지 않는다. */
function Card({ t, onPlay }: { t: Track; onPlay: () => void }) {
  const [src, setEl] = useArt(t)
  return (
    <button className="card" onClick={onPlay} aria-label={`${t.title}, ${t.artist}`}>
      <ArtView t={t} size={132} src={src} setEl={setEl} />
      {src && <span className="strong one">{t.title}</span>}
      {src && <span className="small muted one">{t.artist}</span>}
    </button>
  )
}

function TabBar({ tab, setTab, hidden }: { tab: Tab; setTab: (t: Tab) => void; hidden: boolean }) {
  const items: [Tab, string, React.ReactNode][] = [
    ['home', '홈', <path key="h" d="M3 10.5 12 4l9 6.5V20H3z" />],
    ['library', '내 음악', <g key="l"><line x1="5" y1="5" x2="5" y2="19" /><line x1="9" y1="5" x2="9" y2="19" /><rect x="13" y="5" width="5" height="14" rx="1" /></g>],
    ['practice', '연습', <g key="p"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="21" /></g>],
    ['worship', '찬양·묵상', <g key="w"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z" /><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></g>],
  ]
  return (
    <nav className="tabs" aria-label="주요 메뉴" inert={hidden}>
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

