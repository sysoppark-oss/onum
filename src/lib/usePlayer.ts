import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from './library'
import { shuffledOrder } from './shuffle'
import { load, save } from './store'
import { setNowPlaying } from './native'

interface Resume { id: string; pos: number }

export function usePlayer(tracks: Track[]) {
  const audio = useRef<HTMLAudioElement>(new Audio())
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [shuffle, setShuffle] = useState<boolean>(() => load('shuffle', false))
  const [resume] = useState<Resume | null>(() => load<Resume | null>('resume', null))
  const byId = useRef(new Map<string, Track>())
  byId.current = new Map(tracks.map((t) => [t.id, t]))

  const current = index >= 0 ? byId.current.get(queue[index]) : undefined

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

  const go = useCallback((step: 1 | -1) => {
    if (!queue.length) return
    const a = audio.current
    if (step === -1 && a.currentTime > 3) { a.currentTime = 0; return }
    let q = queue
    let i = index + step
    if (i >= q.length) {
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

  const toggle = useCallback(() => {
    const a = audio.current
    if (!a.src) return
    if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {})
    else { a.pause(); setPlaying(false) }
  }, [])

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
    const onEnd = () => go(1)
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnd)
    a.addEventListener('pause', onPause)
    a.addEventListener('play', onPlay)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnd)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('play', onPlay)
    }
  }, [go])

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
    current, playing, time, duration, shuffle, resumeTrack, resumePos: resume?.pos ?? 0,
    playFrom, go, toggle, seek, toggleShuffle,
  }
}

export type Player = ReturnType<typeof usePlayer>
