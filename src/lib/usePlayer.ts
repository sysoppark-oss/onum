import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from './library'
import { shuffledOrder } from './shuffle'
import { load, save } from './store'
import { setNowPlaying } from './native'

interface Resume { id: string; pos: number }

/** 반복: 무엇을(한 곡·모두) × 얼마나(한 번만·계속·정한 시간 동안) */
export interface Repeat {
  scope: 'one' | 'all'
  limit: 'once' | 'forever' | 'timed'
  minutes: number
}
export interface Sleep { until: number; endOfTrack: boolean; fade: boolean }
export interface Goodnight { at: number; title: string }
/** 구간 반복: a부터 b까지(초). b가 없으면 끝 지점을 고르는 중 */
export interface AB { a: number; b: number | null; n: number }
export const RATES = [0.8, 1, 1.2, 1.5, 2]
const SKIP = 10 // 강의 건너뛰기(초)
const SLEEP_FADE_MS = 30000
const DEFAULT_REPEAT: Repeat = { scope: 'all', limit: 'forever', minutes: 60 }

export function usePlayer(tracks: Track[]) {
  // 재생기는 한 번만 만든다
  const audio = useRef<HTMLAudioElement>(null as unknown as HTMLAudioElement)
  if (!audio.current) audio.current = new Audio()
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [shuffle, setShuffle] = useState<boolean>(() => load('shuffle', false))
  const [gain, setGainState] = useState<number>(() => load('gain', 1)) // PC·브라우저용 앱 자체 음량
  const [plays, setPlays] = useState<Record<string, number>>(() => load('plays', {})) // 곡마다 들은 횟수
  const [resume] = useState<Resume | null>(() => load<Resume | null>('resume', null))
  // "시간 동안"은 앱을 다시 켜면 "계속"으로 시작한다. 예전 저장값(끄기)은 "모두 한 번만"으로 읽는다.
  const [repeat, setRepeatState] = useState<Repeat>(() => {
    const r = load<Repeat & { scope: string }>('repeat', DEFAULT_REPEAT)
    if (r.scope !== 'one' && r.scope !== 'all') return { scope: 'all', limit: 'once', minutes: r.minutes || 60 }
    return r.limit === 'timed' ? { ...r, limit: 'forever' } : r
  })
  // 시간 반복의 남은 시간(ms). 재생 중일 때만 줄어든다.
  const [repeatLeft, setRepeatLeft] = useState(0)
  const left = useRef(0)
  const lastTick = useRef(0)

  // ── 잠들기 예약 ──
  const [sleep, setSleepState] = useState<Sleep | null>(null)
  const [sleepLeft, setSleepLeft] = useState(0)
  const [goodnight, setGoodnight] = useState<Goodnight | null>(null)
  const [last, setLast] = useState<Record<string, number>>(() => load('last', {})) // 곡마다 마지막으로 들은 때
  const sleepRef = useRef<Sleep | null>(null)
  // ── 강의: 들은 자리·다 들음·빠르기 ──
  const [talkPos, setTalkPos] = useState<Record<string, number>>(() => load('talkPos', {}))
  const [talkDone, setTalkDone] = useState<Record<string, boolean>>(() => load('talkDone', {}))
  const talkPosRef = useRef(talkPos)
  talkPosRef.current = talkPos
  const talkDoneRef = useRef(talkDone)
  talkDoneRef.current = talkDone
  const [rate, setRateState] = useState<number>(() => load('rate', 1))
  const [rateEach, setRateEachState] = useState<boolean>(() => load('rateEach', false))
  const [rateById, setRateById] = useState<Record<string, number>>(() => load('rateById', {}))
  // ── 구간 반복 ──
  const [ab, setAbState] = useState<AB | null>(null)
  const abRef = useRef<AB | null>(null)
  const setAb = (v: AB | null) => { abRef.current = v; setAbState(v) }
  const currentTitle = useRef('')
  const gainRef = useRef(gain)
  gainRef.current = gain

  /** minutes: 몇 분 뒤 / 'track': 이 곡까지 / null: 끄기. fade: 끝날 때 30초 동안 소리 줄이기 */
  const setSleep = useCallback((v: number | 'track' | null, fade = true) => {
    const next: Sleep | null = v == null ? null : v === 'track' ? { until: 0, endOfTrack: true, fade } : { until: Date.now() + v * 60000, endOfTrack: false, fade }
    sleepRef.current = next
    setSleepState(next)
    setSleepLeft(next && !next.endOfTrack ? next.until - Date.now() : 0)
  }, [])

  /** 음악을 멈추고 밤 인사를 띄운다 */
  const finishSleep = useCallback(() => {
    const a = audio.current
    a.pause()
    a.volume = gainRef.current
    sleepRef.current = null
    setSleepState(null)
    setPlaying(false)
    setGoodnight({ at: Date.now(), title: currentTitle.current })
  }, [])

  // 끝나기 30초 전부터 소리를 서서히 줄인다
  useEffect(() => {
    if (!sleep || sleep.endOfTrack) return
    const a = audio.current
    const tick = () => {
      const left = sleep.until - Date.now()
      setSleepLeft(Math.max(0, left))
      if (left <= 0) {
        if (a.paused) { sleepRef.current = null; setSleepState(null) } // 이미 멈춰 있으면 조용히 끝낸다
        else finishSleep()
      } else if (sleep.fade && left < SLEEP_FADE_MS) a.volume = gainRef.current * (left / SLEEP_FADE_MS)
    }
    tick()
    const h = setInterval(tick, 500)
    return () => { clearInterval(h); a.volume = gainRef.current }
  }, [sleep, finishSleep])
  const byId = useRef(new Map<string, Track>())
  byId.current = new Map(tracks.map((t) => [t.id, t]))

  const queueRef = useRef(queue)
  queueRef.current = queue
  const indexRef = useRef(index)
  indexRef.current = index
  const current = index >= 0 ? byId.current.get(queue[index]) : undefined
  currentTitle.current = current?.title ?? ''

  const setRepeat = useCallback((r: Repeat) => {
    left.current = r.limit === 'timed' ? r.minutes * 60000 : 0
    lastTick.current = Date.now()
    setRepeatLeft(left.current)
    setRepeatState(r)
    save('repeat', r)
  }, [])

  const start = useCallback((t: Track, at?: number) => {
    const a = audio.current
    a.src = t.url
    a.currentTime = at ?? (t.talk && !talkDoneRef.current[t.id] ? talkPosRef.current[t.id] ?? 0 : 0)
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    setPlays((old) => { const n = { ...old, [t.id]: (old[t.id] ?? 0) + 1 }; save('plays', n); return n })
    setLast((old) => { const n = { ...old, [t.id]: Date.now() }; save('last', n); return n })
  }, [])

  /** 목록에서 곡을 누르면: 그 목록을 대기열로 */
  const playFrom = useCallback((list: Track[], id: string, at?: number, keepOrder = false) => {
    const ids = list.map((t) => t.id)
    let q = ids
    let i = ids.indexOf(id)
    if (keepOrder && shuffle) { setShuffle(false); save('shuffle', false) } // 고른 순서대로
    else if (shuffle) {
      q = [id, ...shuffledOrder(ids.filter((x) => x !== id))]
      i = 0
    }
    setQueue(q)
    setIndex(i)
    const t = byId.current.get(id)
    if (t) start(t, at)
  }, [shuffle, start])

  /** wrap: 마지막 곡 다음에 처음으로 돌아갈지. 손으로 누를 때는 늘 돌아간다. */
  const go = useCallback((step: 1 | -1, wrap = true) => {
    if (!queue.length) return
    const a = audio.current
    if (step === -1 && a.currentTime > 3) { a.currentTime = 0; return }
    let q = queue
    let i = index + step
    if (i >= q.length) {
      if (!wrap) { a.pause(); setPlaying(false); return }
      // 한 바퀴 다 돌았으면 다시 섞어서 이어 간다
      q = shuffle ? shuffledOrder(queue, queue[index]) : queue
      i = 0
      setQueue(q)
    }
    if (i < 0) i = 0
    setIndex(i)
    const t = byId.current.get(q[i])
    if (t) start(t)
  }, [queue, index, shuffle, start])

  /** 곡이 끝났을 때: 반복 설정에 따라 다시 틀거나 넘어가거나 멈춘다 */
  const onEnded = useCallback(() => {
    const r = repeat
    const stop = () => { audio.current.pause(); setPlaying(false) }
    if (sleepRef.current?.endOfTrack) { finishSleep(); return } // "이 곡까지" 잠들기
    const cur = byId.current.get(queueRef.current[indexRef.current])
    if (cur?.talk) {
      setTalkDone((old) => { const n = { ...old, [cur.id]: true }; save('talkDone', n); return n })
      setTalkPos((old) => { const n = { ...old }; delete n[cur.id]; save('talkPos', n); return n })
      go(1, false)
      return
    }
    // 정한 시간이 지났으면 듣던 곡까지만 틀고 멈춘다
    if (r.limit === 'timed' && left.current <= 0) {
      setRepeat({ ...r, limit: 'once' })
      stop()
      return
    }
    if (r.scope === 'one') {
      if (r.limit === 'once') { stop(); return }
      const a = audio.current
      a.currentTime = 0
      a.play().catch(() => {})
      return
    }
    go(1, r.limit !== 'once')
  }, [repeat, go, setRepeat, finishSleep])

  const toggle = useCallback(() => {
    const a = audio.current
    if (!a.src) return
    if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {})
    else { a.pause(); setPlaying(false) }
  }, [])

  const pause = useCallback(() => { audio.current.pause(); setPlaying(false) }, [])

  const seek = useCallback((sec: number) => { audio.current.currentTime = sec }, [])

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      const next = !s
      save('shuffle', next)
      if (queue.length && index >= 0) {
        const cur = queue[index]
        const rest = queue.filter((x) => x !== cur)
        setQueue(next ? [cur, ...shuffledOrder(rest)] : [cur, ...rest])
        setIndex(0)
      }
      return next
    })
  }, [queue, index])

  // 오디오 이벤트
  useEffect(() => {
    const a = audio.current
    const onTime = () => {
      const g = abRef.current
      if (g && g.b != null && a.currentTime >= g.b) {
        a.currentTime = g.a
        setAb({ ...g, n: g.n + 1 })
      }
      setTime(a.currentTime)
      // 재생된 시간만큼만 남은 시간을 줄인다(멈춰 있던 동안은 세지 않는다)
      if (left.current > 0) {
        const now = Date.now()
        left.current = Math.max(0, left.current - Math.min(1500, now - lastTick.current))
        lastTick.current = now
        setRepeatLeft(left.current)
      }
    }
    const onMeta = () => setDuration(a.duration)
    const onPause = () => setPlaying(false)
    const onPlay = () => { lastTick.current = Date.now(); setPlaying(true) }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnded)
    a.addEventListener('pause', onPause)
    a.addEventListener('play', onPlay)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('play', onPlay)
    }
  }, [onEnded])

  // 이어 듣기: 5초마다 위치 저장
  useEffect(() => {
    if (!current) return
    const keep = () => {
      const pos = audio.current.currentTime
      save('resume', { id: current.id, pos })
      if (current.talk && pos > 5 && !talkDoneRef.current[current.id]) {
        setTalkPos((old) => { const n = { ...old, [current.id]: Math.floor(pos) }; save('talkPos', n); return n })
      }
    }
    const h = setInterval(keep, 5000)
    keep()
    return () => { clearInterval(h); keep() }
  }, [current])

  // 다른 곡으로 넘어가면 구간 반복은 저절로 풀린다
  const curId = current?.id
  useEffect(() => { setAb(null) }, [curId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 빠르기: 강의에만. 목소리 높이는 그대로.
  const curRate = current?.talk ? (rateEach ? rateById[current.id] ?? rate : rate) : 1
  useEffect(() => {
    const a = audio.current as HTMLAudioElement & { preservesPitch?: boolean }
    a.preservesPitch = true
    a.defaultPlaybackRate = curRate
    a.playbackRate = curRate
  }, [curRate, curId])

  // 설치형 앱: 재생 중에는 알림을 띄워 화면이 꺼져도 멈추지 않게
  useEffect(() => { setNowPlaying(playing, current) }, [playing, current])

  // 잠금 화면·이어폰 버튼
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: current.art ? [{ src: current.art }] : [],
    })
    navigator.mediaSession.setActionHandler('play', toggle)
    navigator.mediaSession.setActionHandler('pause', toggle)
    navigator.mediaSession.setActionHandler('nexttrack', () => go(1))
    navigator.mediaSession.setActionHandler('previoustrack', () => go(-1))
  }, [current, toggle, go])

  // ── 재생 목록(대기열) 고치기 ──
  const queueTracks = queue.map((id) => byId.current.get(id)).filter((t): t is Track => !!t)

  const jump = useCallback((i: number) => {
    const t = byId.current.get(queue[i])
    if (!t) return
    setIndex(i)
    start(t)
  }, [queue, start])

  /** 지금 듣는 곡은 뺄 수 없다 */
  const removeAt = useCallback((i: number) => {
    if (i === index || i < 0 || i >= queue.length) return
    setQueue(queue.filter((_, k) => k !== i))
    if (i < index) setIndex(index - 1)
  }, [queue, index])

  const move = useCallback((i: number, dir: 1 | -1) => {
    const j = i + dir
    if (j < 0 || j >= queue.length) return
    const q = [...queue]
    ;[q[i], q[j]] = [q[j], q[i]]
    setQueue(q)
    if (index === i) setIndex(j)
    else if (index === j) setIndex(i)
  }, [queue, index])

  /** 맨 뒤에 붙인다. 이미 있는 곡은 다시 넣지 않는다. */
  const enqueue = useCallback((list: Track[]) => {
    const add = list.map((t) => t.id).filter((id) => !queue.includes(id))
    if (!add.length) return
    if (!queue.length) { playFrom(list, list[0].id, 0, true); return }
    setQueue([...queue, ...add])
  }, [queue, playFrom])

  const skip = useCallback((sec: number) => {
    const a = audio.current
    a.currentTime = Math.min(Math.max(0, a.currentTime + sec), Math.max(0, (a.duration || 0) - 0.5))
  }, [])

  /** 여기부터 / 여기까지 / 1초씩 다듬기 / 끝내기 */
  const abStart = useCallback(() => setAb({ a: audio.current.currentTime, b: null, n: 1 }), [])
  const abEnd = useCallback(() => {
    const g = abRef.current
    const t = audio.current.currentTime
    if (!g || t < g.a + 1) return false
    setAb({ ...g, b: t })
    audio.current.currentTime = g.a
    return true
  }, [])
  const abSet = useCallback((which: 'a' | 'b', sec: number) => {
    const g = abRef.current
    if (!g) return
    const d = audio.current.duration || Infinity
    if (which === 'a') setAb({ ...g, a: Math.max(0, Math.min(sec, (g.b ?? d) - 1)) })
    else if (g.b != null) setAb({ ...g, b: Math.min(d - 0.2, Math.max(sec, g.a + 1)) })
  }, [])
  const abClear = useCallback(() => setAb(null), [])

  const setRate = useCallback((v: number, each: boolean) => {
    setRateEachState(each); save('rateEach', each)
    if (each && current) setRateById((old) => { const n = { ...old, [current.id]: v }; save('rateById', n); return n })
    else { setRateState(v); save('rate', v) }
  }, [current])

  const markDone = useCallback((id: string, done: boolean) => {
    setTalkDone((old) => { const n = { ...old }; if (done) n[id] = true; else delete n[id]; save('talkDone', n); return n })
    setTalkPos((old) => { const n = { ...old }; delete n[id]; save('talkPos', n); return n })
  }, [])

  const setGain = useCallback((v: number) => {
    const g = Math.min(1, Math.max(0, v))
    audio.current.volume = g
    setGainState(g)
    save('gain', g)
  }, [])
  useEffect(() => { audio.current.volume = gain }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 다음 곡 미리 알림 ──
  let next: Track | undefined
  let nextNote = ''
  const timeUp = repeat.limit === 'timed' && repeatLeft <= 0
  if (current) {
    if (timeUp || (repeat.scope === 'one' && repeat.limit === 'once')) nextNote = '이 곡이 끝나면 멈춰요'
    else if (repeat.scope === 'one') { next = current; nextNote = '같은 곡을 다시 틀어요' }
    else if (index + 1 < queue.length) next = byId.current.get(queue[index + 1])
    else if (repeat.limit === 'once') nextNote = '마지막 곡이에요'
    else if (shuffle && queue.length > 1) nextNote = '다시 섞어서 이어 틀어요'
    else next = byId.current.get(queue[0])
  }

  const resumeTrack = resume ? byId.current.get(resume.id) : undefined

  return {
    current, playing, time, duration, shuffle, repeat, repeatLeft,
    resumeTrack, resumePos: resume?.pos ?? 0,
    queueTracks, index, next, nextNote, gain, plays, last, sleep, sleepLeft, goodnight,
    setSleep, dismissGoodnight: () => setGoodnight(null),
    playFrom, go, toggle, pause, seek, toggleShuffle, setRepeat, jump, removeAt, move, enqueue, setGain,
    talkPos, talkDone, markDone, rate: curRate, rateEach, setRate, skip, SKIP,
    ab, abStart, abEnd, abSet, abClear,
  }
}

export type Player = ReturnType<typeof usePlayer>
