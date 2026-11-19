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
const DEFAULT_REPEAT: Repeat = { scope: 'all', limit: 'forever', minutes: 60 }

export function usePlayer(tracks: Track[]) {
  const audio = useRef<HTMLAudioElement>(new Audio())
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [shuffle, setShuffle] = useState<boolean>(() => load('shuffle', false))
  const [resume] = useState<Resume | null>(() => load<Resume | null>('resume', null))
  // "시간 동안"은 앱을 다시 켜면 "계속"으로 시작한다. 예전 저장값(끄기)은 "모두 한 번만"으로 읽는다.
  const [repeat, setRepeatState] = useState<Repeat>(() => {
    const r = load<Repeat & { scope: string }>('repeat', DEFAULT_REPEAT)
    if (r.scope !== 'one' && r.scope !== 'all') return { scope: 'all', limit: 'once', minutes: r.minutes || 60 }
    return r.limit === 'timed' ? { ...r, limit: 'forever' } : r
  })
  const [repeatUntil, setRepeatUntil] = useState(0)
  const byId = useRef(new Map<string, Track>())
  byId.current = new Map(tracks.map((t) => [t.id, t]))

  const current = index >= 0 ? byId.current.get(queue[index]) : undefined

  const setRepeat = useCallback((r: Repeat) => {
    setRepeatUntil(r.limit === 'timed' ? Date.now() + r.minutes * 60000 : 0)
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
  const playFrom = useCallback((list: Track[], id: string, at = 0) => {
    const ids = list.map((t) => t.id)
    let q = ids
    let i = ids.indexOf(id)
    if (shuffle) {
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
    // 정한 시간이 지났으면 듣던 곡까지만 틀고 멈춘다
    if (r.limit === 'timed' && Date.now() >= repeatUntil) {
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
  }, [repeat, repeatUntil, go, setRepeat])

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
    const onTime = () => setTime(a.currentTime)
    const onMeta = () => setDuration(a.duration)
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
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

  const resumeTrack = resume ? byId.current.get(resume.id) : undefined

  return {
    current, playing, time, duration, shuffle, repeat, repeatUntil,
    resumeTrack, resumePos: resume?.pos ?? 0,
    playFrom, go, toggle, pause, seek, toggleShuffle, setRepeat,
  }
}

export type Player = ReturnType<typeof usePlayer>
