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
interface Sleep { until: number; endOfTrack: boolean }
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
  const [goodnight, setGoodnight] = useState(false)
  const sleepRef = useRef<Sleep | null>(null)
  const gainRef = useRef(gain)
  gainRef.current = gain

  /** minutes: 몇 분 뒤 / 'track': 이 곡까지 / null: 끄기 */
  const setSleep = useCallback((v: number | 'track' | null) => {
    const next: Sleep | null = v == null ? null : v === 'track' ? { until: 0, endOfTrack: true } : { until: Date.now() + v * 60000, endOfTrack: false }
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
    setGoodnight(true)
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
      } else if (left < SLEEP_FADE_MS) a.volume = gainRef.current * (left / SLEEP_FADE_MS)
    }
    tick()
    const h = setInterval(tick, 500)
    return () => { clearInterval(h); a.volume = gainRef.current }
  }, [sleep, finishSleep])
  const byId = useRef(new Map<string, Track>())
  byId.current = new Map(tracks.map((t) => [t.id, t]))

  const current = index >= 0 ? byId.current.get(queue[index]) : undefined

  const setRepeat = useCallback((r: Repeat) => {
    left.current = r.limit === 'timed' ? r.minutes * 60000 : 0
    lastTick.current = Date.now()
    setRepeatLeft(left.current)
    setRepeatState(r)
    save('repeat', r)
  }, [])

  const start = useCallback((t: Track, at = 0) => {
    const a = audio.current
    a.src = t.url
    a.currentTime = at
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [])

  /** 목록에서 곡을 누르면: 그 목록을 대기열로 */
  const playFrom = useCallback((list: Track[], id: string, at = 0, keepOrder = false) => {
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
    const h = setInterval(() => save('resume', { id: current.id, pos: audio.current.currentTime }), 5000)
    save('resume', { id: current.id, pos: audio.current.currentTime })
    return () => clearInterval(h)
  }, [current])

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
    queueTracks, index, next, nextNote, gain, sleep, sleepLeft, goodnight,
    setSleep, dismissGoodnight: () => setGoodnight(false),
    playFrom, go, toggle, pause, seek, toggleShuffle, setRepeat, jump, removeAt, move, enqueue, setGain,
  }
}

export type Player = ReturnType<typeof usePlayer>
