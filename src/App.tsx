// 온음 — 「흐름」 화면
import { NOTES } from './lib/version'
import { WhatsNew } from './ui/WhatsNew'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import type { ScanResult, Track } from './lib/library'
import { classify, loadOverrides, saveOverrides, type KindOverrides } from './lib/kind'
import { usePlayer, type Player } from './lib/usePlayer'
import { usePlaylists } from './lib/playlists'
import { getFontScale, isNative } from './lib/native'
import { load, save } from './lib/store'
import { useDayNight } from './lib/theme'
import { Icon, SAFE_VOLUME, closers, info, useOutput, useVolume } from './ui/common'
import { NowScreen } from './ui/Now'
import { MusicScreen } from './ui/Music'
import { ListsScreen } from './ui/Lists'
import { RestScreen } from './ui/Rest'
import { FirstScreen, FoldersPage } from './ui/First'
import { EasyScreen } from './ui/Easy'
import { BatteryPage, useBattery } from './ui/Battery'
import { VerseStrip } from './ui/VerseStrip'
import { ReadPage } from './ui/Rest'
import { GoodnightScreen, SleepSheet } from './ui/Sheets'

type Tab = 'now' | 'music' | 'lists' | 'rest'
const TABS: [Tab, string, string][] = [['now', '지금', 'clock'], ['music', '음악', 'search'], ['lists', '내 목록', 'list'], ['rest', '쉼', 'heart']]

export default function App() {
  useDayNight()
  const [raw, setRaw] = useState<ScanResult | null>(null)
  const [hidden, setHidden] = useState<string[]>(() => load('hiddenFolders', []))
  const scan = useMemo<ScanResult | null>(() => raw && { ...raw, tracks: raw.tracks.filter((t) => !hidden.includes(t.folder)) }, [raw, hidden])
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
  const player = usePlayer(tracks)
  // 업데이트 뒤 한 번: 새로워진 점. 처음 쓰는 사람에게는 띄우지 않는다
  const [news, setNews] = useState(false)
  const closeNews = useCallback(() => { setNews(false); save('notesSeen', NOTES.id) }, [])
  useEffect(() => {
    if (!tracks.length || load('notesSeen', '') === NOTES.id) return
    if (Object.keys(player.plays).length) setNews(true)
    else save('notesSeen', NOTES.id)
  }, [tracks.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const output = useOutput(player)
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

  if (!scan || !raw || tracks.length === 0) return <FirstScreen onDone={(r, h) => { setHidden(h); setRaw(r) }} />

  const gn = player.goodnight
  return (
    <div className="app">
      <div className="statusbar" aria-hidden="true" />
      <main className={'main' + (easy ? ' no-tabs' : '') + (!easy && tab === 'now' ? ' with-strip' : '') + (player.current && tab !== 'now' && !easy ? ' with-mini' : '')}>
        {easy ? (
          <EasyScreen tracks={tracks} player={player} vol={vol} loud={loud} onNormal={() => setEasy(false)} onSleep={openSleep} />
        ) : (
          <>
            {tab === 'now' && <NowScreen tracks={tracks} player={player} vol={vol} loud={loud} output={output} lists={lists} onSleep={openSleep} />}
            {tab === 'music' && <MusicScreen tracks={tracks} scan={scan} player={player} lists={lists} onPlayed={() => setTab('now')} onKind={moveKind} />}
            {tab === 'lists' && <ListsScreen tracks={tracks} music={music} player={player} lists={lists} />}
            {tab === 'rest' && <RestScreen easy={easy} setEasy={setEasy} onFolders={() => setFolders(true)} battery={battery} onBattery={() => setBatteryOpen(true)} verseMove={verseMove} setVerseMove={setVerseMove} player={player} onNews={() => setNews(true)} />}
          </>
        )}
      </main>
      {!easy && tab === 'now' && <VerseStrip moving={verseMove} onOpen={() => setReading(true)} />}
      {reading && <ReadPage onClose={closeReading} />}
      {!easy && player.current && tab !== 'now' && <Mini player={player} onOpen={() => setTab('now')} />}
      {!easy && (
        <nav className="tabs" aria-label="주요 메뉴">
          {TABS.map(([id, label, ic]) => (
            <button key={id} className={tab === id ? 'on' : undefined} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              <Icon n={ic} s={24} w={tab === id ? 2.4 : 2} />{label}
            </button>
          ))}
        </nav>
      )}
      {vol.flash && (tab !== 'now' || easy) && (
        <p className={'toast' + (loud ? ' over' : '')} role="status">음량 <span className="num">{vol.percent}%</span>{loud && ' · 권장 음량을 넘었어요'}</p>
      )}
      {sleeping && <SleepSheet player={player} onClose={closeSleep} />}
      {folders && <FoldersPage tracks={raw.tracks} hidden={hidden} setHidden={setHidden} onClose={closeFolders} />}
      {news && !batteryOpen && <WhatsNew onClose={closeNews} />}
      {batteryOpen && <BatteryPage b={battery} onClose={closeBattery} />}
      {gn && <GoodnightScreen g={gn} onClose={player.dismissGoodnight} onResume={() => { player.dismissGoodnight(); player.toggle() }} />}
    </div>
  )
}

/** 다른 탭에서 보이는 작은 재생 막대 */
function Mini({ player, onOpen }: { player: Player; onOpen: () => void }) {
  const t = player.current!
  const x = info(t)
  const soon = player.duration - player.time < 15 && player.next && player.next !== t
  return (
    <div className="mini">
      <button className="mini-open" onClick={onOpen} aria-label={`지금 화면 열기: ${x.song}`}>
        <span className="x1">{x.song}</span>
        <span className="x2">{soon ? `다음 곡 · ${info(player.next!).song}` : x.singer || x.program || ' '}</span>
      </button>
      <button className="mini-play" onClick={player.toggle} aria-label={player.playing ? '일시 정지' : '재생'}>
        <Icon n={player.playing ? 'pause' : 'play'} s={22} />
      </button>
      <span className="mini-bar" aria-hidden="true" style={{ transform: `scaleX(${Math.min(1, player.time / (player.duration || 1))})` }} />
    </div>
  )
}
