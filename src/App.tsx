// 온음 — 「흐름」 화면
import { appReady, applyPending, checkUpdate, hasPending, useUpd, type Remote } from './lib/update'
import { UpdateSheet } from './ui/Update'
import type { Hide } from './ui/Dupes'
import { useFlag } from './lib/flag'
import { partTracks, useEdits } from './lib/edits'
import { NOTES } from './lib/version'
import { WhatsNew } from './ui/WhatsNew'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import type { ScanResult, Track } from './lib/library'
import { classify, loadOverrides, saveOverrides, type KindOverrides } from './lib/kind'
import { usePlayer, type Player } from './lib/usePlayer'
import { usePlaylists } from './lib/playlists'
import { getFontScale, isNative } from './lib/native'
import { receiveUrl } from './lib/church'
import { IncomingSheet } from './ui/Church'
import { load, save } from './lib/store'
import { useDayNight } from './lib/theme'
import { Icon, SAFE_VOLUME, closers, info, useOutput, useVolume } from './ui/common'
import { NowScreen } from './ui/Now'
import { MusicScreen } from './ui/Music'
import { ListsScreen } from './ui/Lists'
import { RestScreen, SettingsScreen } from './ui/Rest'
import { FirstScreen, FoldersPage } from './ui/First'
import { EasyScreen } from './ui/Easy'
import { BatteryPage, useBattery } from './ui/Battery'
import { VerseStrip } from './ui/VerseStrip'
import { ReadPage } from './ui/Rest'
import { tx } from "./lib/i18n";
import { GoodnightScreen, SleepSheet } from './ui/Sheets'

type Tab = 'now' | 'music' | 'lists' | 'rest' | 'set'
const TABS: [Tab, string, string][] = [['now', tx("지금"), 'clock'], ['music', tx("음악"), 'search'], ['lists', tx("내 목록"), 'list'], ['rest', tx("쉼"), 'heart'], ['set', tx("설정"), 'gear']]

export default function App() {
  useDayNight()
  const [raw, setRaw] = useState<ScanResult | null>(null)
  const [hidden, setHidden] = useState<string[]>(() => load('hiddenFolders', []))
  // 같은 곡 정리로 빼 둔 곡(파일은 그대로), 같은 곡이 아니라고 한 묶음
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => load('hiddenIds', []))
  const [notSame, setNotSame] = useState<string[]>(() => load('notSame', []))
  const hide: Hide = useMemo(() => ({
    ids: hiddenIds,
    hide: (ids) => setHiddenIds((o) => { const n = [...new Set([...o, ...ids])]; save('hiddenIds', n); return n }),
    showAll: () => { setHiddenIds([]); save('hiddenIds', []) },
    notSame: (k) => setNotSame((o) => { const n = [...o, k]; save('notSame', n); return n }),
  }), [hiddenIds])
  const scan = useMemo<ScanResult | null>(() => {
    if (!raw) return null
    const ids = new Set(hiddenIds)
    return { ...raw, tracks: raw.tracks.filter((t) => !hidden.includes(t.folder) && !ids.has(t.id)) }
  }, [raw, hidden, hiddenIds])
  // 강의와 음악 가르기(사용자가 옮긴 것은 기억)
  const [kinds, setKinds] = useState<KindOverrides>(loadOverrides)
  const tracks = useMemo(() => {
    const base = scan?.tracks ?? []
    const talk = classify(base, kinds)
    return base.map((t) => (talk.has(t.id) === !!t.talk ? t : { ...t, talk: talk.has(t.id) }))
  }, [scan, kinds])
  const music = useMemo(() => tracks.filter((t) => !t.talk), [tracks])
  const moveKind = (t: Track, scope: 'one' | 'folder', talk: boolean) => {
    setKinds((o) => {
      const n: KindOverrides = { ids: { ...o.ids }, folders: { ...o.folders } }
      if (scope === 'folder') {
        n.folders[t.folder] = talk ? 'talk' : 'music'
        for (const x of tracks) if (x.folder === t.folder) delete n.ids[x.id]
      } else n.ids[t.id] = talk ? 'talk' : 'music'
      saveOverrides(n)
      return n
    })
  }
  const [tab, setTab] = useState<Tab>('now')
  const [easy, setEasyState] = useState<boolean>(() => load('easy', false))
  const setEasy = (v: boolean) => { setEasyState(v); save('easy', v); if (v) setTab('now') }
  const [sleeping, setSleeping] = useState(false)
  const [folders, setFolders] = useState(false)
  const openSleep = useCallback(() => setSleeping(true), [])
  const closeSleep = useCallback(() => setSleeping(false), [])
  const closeFolders = useCallback(() => setFolders(false), [])
  const [verseMove, setVerseMoveState] = useState<boolean>(() => load('verseMove', true))
  const setVerseMove = (v: boolean) => { setVerseMoveState(v); save('verseMove', v) }
  const [reading, setReading] = useState(false)
  const closeReading = useCallback(() => setReading(false), [])
  const [battery] = useBattery()
  const [batteryOpen, setBatteryOpen] = useState(false)
  const closeBattery = useCallback(() => { setBatteryOpen(false); save('batteryAsked', true) }, [])
  // 처음 한 번: 배터리 절약에 걸려 있으면 안내한다
  useEffect(() => {
    if (battery && !battery.free && !load('batteryAsked', false)) setBatteryOpen(true)
  }, [battery])
  const edits = useEdits()
  // 재생기는 편집곡의 구간들도 곡처럼 안다
  const playable = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]))
    return [...tracks, ...edits.items.flatMap((e) => partTracks(e, byId))]
  }, [tracks, edits.items])
  const player = usePlayer(playable)
  // 업데이트 뒤 한 번: 새로워진 점. 처음 쓰는 사람에게는 띄우지 않는다
  const [news, setNews] = useState(false)
  const closeNews = useCallback(() => { setNews(false); save('notesSeen', NOTES.id) }, [])
  useEffect(() => {
    if (!tracks.length || load('notesSeen', '') === NOTES.id) return
    if (Object.keys(player.plays).length) setNews(true)
    else save('notesSeen', NOTES.id)
  }, [tracks.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const output = useOutput(player)
  // 새 판: 화면 부분은 받아 두었다가 음악이 멈춰 있을 때 바꿔 끼우고, 휴대폰 쪽이 바뀐 판은 알린다
  const updOn = useFlag('updateCheck', true)
  const [apk, setApk] = useState<Remote | null>(null)
  const upd = useUpd() // 새 판이 있으면 설정 탭에 점
  const playingRef = useRef(player.playing)
  playingRef.current = player.playing
  const runCheck = useCallback(async (force = false) => {
    const u = await checkUpdate(force).catch(() => null)
    if (u?.kind === 'apk' && (force || load('skipApk', '') !== u.r.sha)) setApk(u.r)
    return u
  }, [])
  useEffect(() => {
    appReady()
    if (hasPending()) { applyPending(); return }
    if (!isNative) return
    const t = window.setTimeout(() => { if (updOn) runCheck() }, 8000)
    const h = CapApp.addListener('resume', () => {
      if (hasPending() && !playingRef.current) applyPending()
      else if (updOn) runCheck()
    })
    return () => { window.clearTimeout(t); h.then((x) => x.remove()) }
  }, [updOn]) // eslint-disable-line react-hooks/exhaustive-deps
  const lists = usePlaylists()
  const vol = useVolume(player)
  // 휴대폰의 실제 음량을 알 때만, 이어폰·블루투스로 들을 때만 경고한다
  const loud = vol.native && vol.percent > SAFE_VOLUME && output?.kind !== 'speaker' && !output?.car // 차 스피커는 귀에 대지 않으니 경고하지 않는다

  // 설치형 앱: 휴대폰의 글자 크기 설정을 따라간다
  useEffect(() => {
    // 크게 할수록 덜 키운다(안드로이드 14의 비선형 글자 크기와 같은 생각). 화면이 깨지지 않게 150%에서 멈춘다.
    getFontScale().then((k) => {
      if (k && k !== 1) document.documentElement.style.fontSize = `${Math.round(Math.min(1.5, k > 1 ? 1 + (k - 1) * 0.6 : k) * 100)}%`
    })
  }, [])

  // 뒤로 버튼: 떠 있는 창부터 닫고, 그다음 「지금」으로, 그다음 앱을 뒤로 숨긴다(음악은 계속)
  useEffect(() => {
    if (!isNative) return
    const h = CapApp.addListener('backButton', () => {
      if (closers.length) closers[closers.length - 1]()
      else if (tab !== 'now') setTab('now')
      else CapApp.minimizeApp()
    })
    return () => { h.then((x) => x.remove()) }
  }, [tab])

  // 교회 카드 링크로 열렸을 때: 웹은 주소 # 뒤, 설치형 앱은 onum://c/…
  useEffect(() => {
    const fromHash = () => { if (receiveUrl(location.hash)) history.replaceState(null, '', location.pathname + location.search) }
    fromHash()
    if (!isNative) { window.addEventListener('hashchange', fromHash); return () => window.removeEventListener('hashchange', fromHash) }
    CapApp.getLaunchUrl().then((r) => receiveUrl(r?.url)).catch(() => {})
    const h = CapApp.addListener('appUrlOpen', (e) => { receiveUrl(e.url) })
    return () => { h.then((x) => x.remove()) }
  }, [])

  if (!scan || !raw || tracks.length === 0) return <><FirstScreen onDone={(r, h) => { setHidden(h); setRaw(r) }} /><IncomingSheet /></>

  const gn = player.goodnight
  return (
    <div className="app">
      <div className="statusbar" aria-hidden="true" />
      <main className={'main' + (easy ? ' no-tabs' : '') + (!easy && tab === 'now' ? ' with-strip' : '') + (player.current && tab !== 'now' && !easy ? ' with-mini' : '')}>
        {easy ? (
          <EasyScreen tracks={tracks} player={player} vol={vol} loud={loud} onNormal={() => setEasy(false)} onSleep={openSleep} />
        ) : (
          <>
            {tab === 'now' && <NowScreen tracks={tracks} player={player} vol={vol} loud={loud} output={output} lists={lists} edits={edits} onSleep={openSleep} />}
            {tab === 'music' && <MusicScreen tracks={tracks} scan={scan} player={player} lists={lists} onPlayed={() => setTab('now')} onKind={moveKind} />}
            {tab === 'lists' && <ListsScreen tracks={tracks} music={music} player={player} lists={lists} edits={edits} onPlayed={() => setTab('now')} hide={hide} notSame={notSame} />}
            {tab === 'rest' && <RestScreen player={player} music={music} />}
            {tab === 'set' && <SettingsScreen easy={easy} setEasy={setEasy} onFolders={() => setFolders(true)} battery={battery} onBattery={() => setBatteryOpen(true)} verseMove={verseMove} setVerseMove={setVerseMove} player={player} onNews={() => setNews(true)} onCheck={runCheck} />}
          </>
        )}
      </main>
      {!easy && tab === 'now' && <VerseStrip moving={verseMove} onOpen={() => setReading(true)} />}
      {reading && <ReadPage onClose={closeReading} />}
      {!easy && player.current && tab !== 'now' && <Mini player={player} />}
      {!easy && (
        <nav className="tabs" aria-label={tx("주요 메뉴")}>
          {TABS.map(([id, label, ic]) => (
            <button key={id} className={tab === id ? 'on' : undefined} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}
              aria-label={id === 'set' && upd !== 'none' ? tx("{0} · 새 판이 있어요", label) : undefined}>
              <span className="tab-ic"><Icon n={ic} s={24} w={tab === id ? 2.4 : 2} />{id === 'set' && upd !== 'none' && <span className="tab-dot" aria-hidden="true" />}</span>{label}
            </button>
          ))}
        </nav>
      )}
      {vol.flash && (tab !== 'now' || easy) && (
        <p className={'toast' + (loud ? ' over' : '')} role="status">{tx("음량 ")}<span className="num">{vol.percent}%</span>{loud && tx(" · 권장 음량을 넘었어요")}</p>
      )}
      {sleeping && <SleepSheet player={player} onClose={closeSleep} />}
      {folders && <FoldersPage tracks={raw.tracks} hidden={hidden} setHidden={setHidden} onClose={closeFolders} />}
      {news && !batteryOpen && <WhatsNew onClose={closeNews} />}
      {apk && !news && !batteryOpen && <UpdateSheet r={apk} onClose={() => setApk(null)} />}
      {batteryOpen && <BatteryPage b={battery} onClose={closeBattery} />}
      <IncomingSheet />
      {gn && <GoodnightScreen g={gn} onClose={player.dismissGoodnight} onResume={() => { player.dismissGoodnight(); player.toggle() }} />}
    </div>
  )
}

/** 다른 탭에서 보이는 작은 재생 단추: 동그라미 하나, 테두리가 곡이 흘러간 만큼 차오른다 */
function Mini({ player }: { player: Player }) {
  const x = info(player.current!)
  const p = Math.min(1, player.time / (player.duration || 1))
  const C = 2 * Math.PI * 27
  return (
    <button className="mini" onClick={player.toggle} aria-label={(player.playing ? tx("일시 정지") : tx("재생")) + ' · ' + x.song}>
      <svg className="mini-ring" viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r="27" className="mr-bg" />
        <circle cx="30" cy="30" r="27" className="mr-fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }} />
      </svg>
      <Icon n={player.playing ? 'pause' : 'play'} s={24} />
    </button>
  )
}
