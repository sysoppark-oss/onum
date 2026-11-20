import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from './library'
import { shuffledOrder } from './shuffle'
import { load, save } from './store'
import { onMediaAction, setNowPlaying } from './native'
import { cachedShape, getShape, normGain } from './shape'

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
/** 곡별 시작·끝 지점(초). 없으면 처음·끝 */
export interface Trim { s?: number; e?: number }
/** 곡 사이 넘김: 0은 끊김 없이, 나머지는 겹치는 초 */
export const XFADES = [0, 2, 4, 6]
/** 곡별 소리 크기(dB): 작게 2단계 · 그대로 · 크게 2단계 */
export const LEVELS = [-6, -3, 0, 3, 6]
/** 이 곡 몇 번 듣기 */
export const TIMES = [2, 3, 5, 10]
export interface Times { id: string; n: number; done: number }
const db = (v: number) => Math.pow(10, v / 20)
const FADE_OUT = 200, FADE_IN = 350 // 일시 정지·다시 재생 때 짧게 줄이고 키우기(ms)
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
  // ── 책갈피: 언제든 이 자리로 돌아가기 ──
  const [bookmark, setBookmarkState] = useState<number | null>(null)
  const currentTitle = useRef('')
  // ── 곡별 시작·끝, 앞뒤 무음 건너뛰기, 곡 사이 넘김 ──
  const [trims, setTrims] = useState<Record<string, Trim>>(() => load('trim', {}))
  const trimsRef = useRef(trims)
  trimsRef.current = trims
  const [skipSilence, setSkipSilenceState] = useState<boolean>(() => load('skipSilence', true))
  const skipSilRef = useRef(skipSilence)
  skipSilRef.current = skipSilence
  const [xfade, setXfadeState] = useState<number>(() => load('xfade', 0))
  const xfadeRef = useRef(xfade)
  xfadeRef.current = xfade
  const [elGen, setElGen] = useState(0) // 재생기를 바꿔 탈 때마다 하나씩(이벤트를 새 재생기에 다시 붙인다)
  const spare = useRef<HTMLAudioElement | null>(null)
  const spareFor = useRef('')
  const xfading = useRef(false)
  const endFired = useRef(false)
  const endTimer = useRef(0)
  // ── 목록별 이어 듣기 ──
  const [listPos, setListPos] = useState<Record<string, { id: string; pos: number }>>(() => load('listPos', {}))
  const srcRef = useRef('')
  // 곡마다 소리 크기 맞추기: 큰 곡은 줄인다
  const [normOn, setNormOnState] = useState<boolean>(() => load('norm', true))
  const normRef = useRef(1)
  // 곡별 소리 크기(dB). 맞추기로 줄어든 만큼까지만 키울 수 있다(재생기는 원래보다 크게 못 낸다)
  const [levels, setLevels] = useState<Record<string, number>>(() => load('level', {}))
  // 이 곡 몇 번 듣기: 다른 곡으로 가면 풀린다
  const [times, setTimesState] = useState<Times | null>(null)
  const timesRef = useRef(times)
  timesRef.current = times
  const fadingOut = useRef(false)
  const ppTimer = useRef(0)
  const gainRef = useRef(gain)
  gainRef.current = gain
  const vol = () => gainRef.current * normRef.current

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
    a.volume = vol()
    sleepRef.current = null
    setSleepState(null)
    setPlaying(false)
    setGoodnight({ at: Date.now(), title: currentTitle.current })
  }, [])

  // 끝나기 30초 전부터 소리를 서서히 줄인다
  useEffect(() => {
    if (!sleep || sleep.endOfTrack) return
    const tick = () => {
      const a = audio.current
      const left = sleep.until - Date.now()
      setSleepLeft(Math.max(0, left))
      if (left <= 0) {
        if (a.paused) { sleepRef.current = null; setSleepState(null) } // 이미 멈춰 있으면 조용히 끝낸다
        else finishSleep()
      } else if (sleep.fade && left < SLEEP_FADE_MS) a.volume = vol() * (left / SLEEP_FADE_MS)
    }
    tick()
    const h = setInterval(tick, 500)
    return () => { clearInterval(h); audio.current.volume = vol() }
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

  /** 실제로 들을 범위: 곡별 시작·끝 + (켜져 있으면) 앞뒤 무음 건너뛰기. to가 0이면 아직 모름 */
  const bounds = useCallback((t: Track, dur?: number) => {
    const d = dur && isFinite(dur) ? dur : t.duration || 0
    const tr = trimsRef.current[t.id] || {}
    const sh = skipSilRef.current && !t.talk ? cachedShape(t) : undefined
    let from = Math.max(tr.s ?? 0, sh?.head ?? 0)
    let to = d > 0 ? Math.min(tr.e ?? d, d - (sh?.tail ?? 0)) : tr.e ?? 0
    if (to && to - from < 2) { from = tr.s ?? 0; to = tr.e ?? d } // 너무 짧아지면 무음 건너뛰기는 쓰지 않는다
    return { from, to }
  }, [])

  const count = (t: Track) => {
    setPlays((old) => { const n = { ...old, [t.id]: (old[t.id] ?? 0) + 1 }; save('plays', n); return n })
    setLast((old) => { const n = { ...old, [t.id]: Date.now() }; save('last', n); return n })
  }

  const start = useCallback((t: Track, at?: number) => {
    const a = audio.current
    endFired.current = false
    window.clearTimeout(endTimer.current)
    a.src = t.url
    a.currentTime = at ?? (t.talk && !talkDoneRef.current[t.id] ? talkPosRef.current[t.id] ?? 0 : bounds(t).from)
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    count(t)
    // 처음 듣는 곡은 아직 앞 무음을 모른다: 재고 나서 아직 무음 안이면 건너뛴다
    if (at == null && !t.talk && skipSilRef.current && !cachedShape(t)) {
      getShape(t).then((sh) => {
        const h = sh?.head ?? 0
        if (h > 0.3 && audio.current === a && a.src === t.url && a.currentTime < h - 0.2) a.currentTime = Math.max(h, trimsRef.current[t.id]?.s ?? 0)
      })
    }
  }, [bounds]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 목록에서 곡을 누르면: 그 목록을 대기열로 */
  const playFrom = useCallback((list: Track[], id: string, at?: number, keepOrder = false, src = '') => {
    srcRef.current = src
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
    const tm = timesRef.current
    if (tm && cur && tm.id === cur.id && tm.done + 1 < tm.n && !(r.scope === 'one' && r.limit === 'once')) {
      setTimesState({ ...tm, done: tm.done + 1 })
      const a = audio.current
      a.currentTime = bounds(cur, a.duration).from
      endFired.current = false
      a.play().catch(() => {})
      return
    }
    if (tm) setTimesState(null)
    if (r.scope === 'one') {
      if (r.limit === 'once') { stop(); return }
      const a = audio.current
      const c = byId.current.get(queueRef.current[indexRef.current])
      a.currentTime = c ? bounds(c, a.duration).from : 0
      endFired.current = false
      a.play().catch(() => {})
      return
    }
    go(1, r.limit !== 'once')
  }, [repeat, go, setRepeat, finishSleep, bounds])

  const repeatRef = useRef(repeat)
  repeatRef.current = repeat
  const shuffleRef = useRef(shuffle)
  shuffleRef.current = shuffle
  const peekMemo = useRef<{ key: string; q?: string[] } | null>(null)
  /** 곡이 끝나면 이어서 틀 곡. 멈추거나 같은 곡을 다시 트는 경우는 null(그때는 보통 방식으로 끝낸다) */
  const peekNext = useCallback((): { t: Track; q?: string[]; i: number } | null => {
    const r = repeatRef.current, q = queueRef.current, i = indexRef.current
    const cur = byId.current.get(q[i])
    if (!cur || cur.talk || !q.length) return null
    if (r.scope === 'one' || (r.limit === 'timed' && left.current <= 0)) return null
    if (sleepRef.current?.endOfTrack || abRef.current) return null
    const tm = timesRef.current
    if (tm && tm.id === cur.id && tm.done + 1 < tm.n) return null
    let ni = i + 1, nq: string[] | undefined
    if (ni >= q.length) {
      if (r.limit === 'once') return null
      ni = 0
      if (shuffleRef.current) {
        const key = cur.id + ':' + q.length
        if (peekMemo.current?.key !== key) peekMemo.current = { key, q: shuffledOrder(q, q[i]) }
        nq = peekMemo.current.q
      }
    }
    const t = byId.current.get((nq ?? q)[ni])
    return t ? { t, q: nq, i: ni } : null
  }, [])

  /** 다음 곡을 미리 불러 둔다(끊김 없이 넘어가려고) */
  const preload = useCallback((t: Track) => {
    if (spareFor.current === t.id) return
    let sp = spare.current
    if (!sp) { sp = new Audio(); spare.current = sp }
    sp.preload = 'auto'
    sp.src = t.url
    sp.currentTime = bounds(t).from
    spareFor.current = t.id
  }, [bounds])

  /** 미리 불러 둔 재생기로 바꿔 탄다. 겹치기가 있으면 그만큼 서로 소리를 바꿔 준다 */
  const transition = useCallback((p: { t: Track; q?: string[]; i: number }) => {
    const old = audio.current
    let nx = spare.current
    if (!nx) { nx = new Audio(); spare.current = nx }
    const b = bounds(p.t)
    if (spareFor.current !== p.t.id) { nx.src = p.t.url; nx.currentTime = b.from }
    spareFor.current = ''
    const xf = xfadeRef.current
    const nxa = nx as HTMLAudioElement & { preservesPitch?: boolean }
    nxa.preservesPitch = true
    nx.defaultPlaybackRate = 1
    nx.playbackRate = 1
    nx.volume = xf > 0 ? 0 : vol()
    nx.play().then(() => setPlaying(true)).catch(() => {})
    audio.current = nx
    spare.current = old
    endFired.current = false
    if (timesRef.current) setTimesState(null) // 몇 번 듣기를 다 마치고 넘어간다
    if (p.q) setQueue(p.q)
    setIndex(p.i)
    count(p.t)
    setElGen((g) => g + 1)
    if (xf > 0) {
      xfading.current = true
      const steps = Math.max(1, Math.round((xf * 1000) / 50))
      const ov = old.volume
      let k = 0
      const h = window.setInterval(() => {
        k++
        const f = k / steps
        old.volume = Math.max(0, ov * (1 - f))
        if (audio.current === nx) nx.volume = Math.min(1, vol() * f)
        if (k >= steps) { window.clearInterval(h); old.pause(); xfading.current = false; if (audio.current === nx) nx.volume = vol() }
      }, 50)
    } else old.pause()
  }, [bounds]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 일시 정지: 0.2초 동안 소리를 줄이고 멈춘다(뚝 끊기지 않게) */
  const softPause = useCallback(() => {
    const a = audio.current
    window.clearInterval(ppTimer.current)
    setPlaying(false)
    if (a.paused) return
    if (xfading.current || a.volume < 0.02 || document.visibilityState === 'hidden') { a.pause(); fadingOut.current = false; return }
    fadingOut.current = true
    const v0 = a.volume, t0 = performance.now()
    ppTimer.current = window.setInterval(() => {
      const f = Math.min(1, (performance.now() - t0) / FADE_OUT)
      a.volume = v0 * (1 - f)
      if (f >= 1) { window.clearInterval(ppTimer.current); a.pause(); a.volume = vol(); fadingOut.current = false }
    }, 25)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** 다시 재생: 0.35초 동안 소리를 키운다 */
  const softPlay = useCallback(() => {
    const a = audio.current
    if (!a.src) return
    window.clearInterval(ppTimer.current)
    const wasFading = fadingOut.current
    fadingOut.current = false
    if (!a.paused && !wasFading) return
    const target = () => vol()
    const v0 = wasFading ? a.volume : 0
    a.volume = v0
    const t0 = performance.now()
    a.play().then(() => {
      setPlaying(true)
      ppTimer.current = window.setInterval(() => {
        if (audio.current !== a) { window.clearInterval(ppTimer.current); return }
        const f = Math.min(1, (performance.now() - t0) / FADE_IN)
        a.volume = v0 + (target() - v0) * f
        if (f >= 1) window.clearInterval(ppTimer.current)
      }, 25)
    }).catch(() => { a.volume = target(); setPlaying(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(() => {
    const a = audio.current
    if (!a.src) return
    if (a.paused || fadingOut.current) softPlay()
    else softPause()
  }, [softPlay, softPause])

  const pause = softPause

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
      // 곡별 끝 지점·뒤 무음에 닿으면 다음 곡으로(겹치기가 있으면 그만큼 일찍)
      const cur = byId.current.get(queueRef.current[indexRef.current])
      if (cur && !abRef.current && !xfading.current && !a.paused) {
        const { to } = bounds(cur, a.duration)
        const xf = xfadeRef.current
        if (to > 0) {
          const at = to - Math.max(xf, 0.06)
          const rate = a.playbackRate || 1
          if (a.currentTime < at - 1) endFired.current = false
          if (a.currentTime >= to - xf - 15 && !spareFor.current) { const p = peekNext(); if (p) preload(p.t) }
          const fire = () => {
            if (endFired.current || audio.current !== a) return
            endFired.current = true
            const p = peekNext()
            if (p) transition(p)
            else if (to < (a.duration || Infinity) - 0.3) onEnded() // 끝 지점을 정한 곡: 파일 끝까지 가지 않고 끝낸다
            else endFired.current = false // 파일 끝이면 'ended'가 처리한다
          }
          const rest = (at - a.currentTime) / rate
          if (!endFired.current && rest <= 0) fire()
          else if (!endFired.current && rest < 1.2) { window.clearTimeout(endTimer.current); endTimer.current = window.setTimeout(fire, rest * 1000) }
        }
      }
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
  }, [onEnded, elGen, bounds, peekNext, preload, transition])

  // 화면을 실제 재생과 맞춘다. 블루투스·차량 연결, 내비 안내 같은 소리 끼어들기 뒤에
  // 재생기 알림(timeupdate·play)이 빠지는 휴대폰이 있어, 알림에만 기대지 않고 0.5초마다 직접 읽는다.
  useEffect(() => {
    const a = audio.current
    const sync = () => {
      if (!a.src) return
      const on = !a.paused && !a.ended && !fadingOut.current
      setPlaying((p) => (p === on ? p : on))
      setTime((t) => (Math.abs(t - a.currentTime) < 0.2 ? t : a.currentTime))
      if (a.duration && isFinite(a.duration)) setDuration((d) => (d === a.duration ? d : a.duration))
    }
    sync()
    const h = setInterval(sync, 500)
    const vis = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', vis)
    a.addEventListener('playing', sync)
    a.addEventListener('durationchange', sync)
    return () => {
      clearInterval(h)
      document.removeEventListener('visibilitychange', vis)
      a.removeEventListener('playing', sync)
      a.removeEventListener('durationchange', sync)
    }
  }, [elGen])

  // 이어 듣기: 5초마다 위치 저장
  useEffect(() => {
    if (!current) return
    const keep = () => {
      const pos = audio.current.currentTime
      save('resume', { id: current.id, pos })
      if (srcRef.current) {
        const key = srcRef.current
        setListPos((old) => { const n = { ...old, [key]: { id: current.id, pos: Math.floor(pos) } }; save('listPos', n); return n })
      }
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
  useEffect(() => { setAb(null); setBookmarkState(null) }, [curId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 빠르기: 강의에만. 목소리 높이는 그대로.
  const curRate = current?.talk ? (rateEach ? rateById[current.id] ?? rate : rate) : 1
  useEffect(() => {
    const a = audio.current as HTMLAudioElement & { preservesPitch?: boolean }
    a.preservesPitch = true
    a.defaultPlaybackRate = curRate
    a.playbackRate = curRate
  }, [curRate, curId])

  // 설치형 앱: 알림·잠금 화면을 지금 상태로(재생 중이면 화면이 꺼져도 멈추지 않게 붙잡는다)
  const notify = useCallback(() => {
    const a = audio.current
    setNowPlaying(!a.paused && !a.ended, byId.current.get(queueRef.current[indexRef.current]), a.currentTime || 0, isFinite(a.duration) ? a.duration : 0, a.playbackRate || 1)
  }, [])
  useEffect(() => { notify() }, [playing, current, notify])
  useEffect(() => {
    const a = audio.current
    a.addEventListener('seeked', notify)
    a.addEventListener('ratechange', notify)
    a.addEventListener('loadedmetadata', notify)
    return () => { a.removeEventListener('seeked', notify); a.removeEventListener('ratechange', notify); a.removeEventListener('loadedmetadata', notify) }
  }, [notify, elGen])

  // 알림·잠금 화면·차 버튼에서 온 명령
  const goRef = useRef(go)
  goRef.current = go
  const softPlayRef = useRef(softPlay)
  softPlayRef.current = softPlay
  const softPauseRef = useRef(softPause)
  softPauseRef.current = softPause
  useEffect(() => onMediaAction((m) => {
    const a = audio.current
    if (m.action === 'play') softPlayRef.current()
    else if (m.action === 'pause') softPauseRef.current()
    else if (m.action === 'next') goRef.current(1)
    else if (m.action === 'prev') goRef.current(-1)
    else if (m.action === 'seek' && m.pos != null) a.currentTime = m.pos
  }), [])

  // 잠금 화면·이어폰 버튼
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: current.art ? [{ src: current.art }] : [],
    })
    // 차·이어폰 버튼: '재생'은 늘 재생, '멈춤'은 늘 멈춤(뒤집기로 하면 이미 재생 중일 때 '재생'이 멈춰 버린다)
    navigator.mediaSession.setActionHandler('play', () => softPlayRef.current())
    navigator.mediaSession.setActionHandler('pause', () => softPauseRef.current())
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
    if (!queue.length) { playFrom(list, list[0].id, undefined, true); return }
    setQueue([...queue, ...add])
  }, [queue, playFrom])

  const skip = useCallback((sec: number) => {
    const a = audio.current
    a.currentTime = Math.min(Math.max(0, a.currentTime + sec), Math.max(0, (a.duration || 0) - 0.5))
  }, [])

  /** 여기부터 / 여기까지 / 1초씩 다듬기 / 끝내기 */
  const abStart = useCallback(() => { setBookmarkState(null); setAb({ a: audio.current.currentTime, b: null, n: 1 }) }, [])
  /** 시작부터 sec초만큼을 바로 반복 */
  const abSpan = useCallback((sec: number) => {
    const g = abRef.current
    const a = audio.current
    const from = g ? g.a : a.currentTime
    const d = isFinite(a.duration) ? a.duration : from + sec
    const to = Math.min(d - 0.2, from + sec)
    if (to <= from + 1) return false
    setBookmarkState(null)
    setAb({ a: from, b: to, n: 1 })
    a.currentTime = from
    return true
  }, [])
  const setBookmark = useCallback((sec: number | null) => setBookmarkState(sec), [])
  const backToMark = useCallback(() => {
    if (bookmark == null) return
    const a = audio.current
    a.currentTime = bookmark
    if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {})
  }, [bookmark])
  const play = useCallback(() => { if (audio.current.paused || fadingOut.current) softPlay() }, [softPlay])
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
    audio.current.volume = g * normRef.current
    setGainState(g)
    save('gain', g)
  }, [])
  useEffect(() => { audio.current.volume = gain }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 곡이 바뀌면 소리 크기를 맞춘다. 아직 안 잰 곡은 재고 나서 0.6초 동안 천천히 바꾼다.
  const fadeTimer = useRef(0)
  useEffect(() => {
    if (!current) return
    const apply = (k: number, smooth: boolean) => {
      window.clearInterval(fadeTimer.current)
      if (xfading.current) { normRef.current = k; return } // 겹치기 중에는 겹치기가 소리를 맞춘다
      if (sleepRef.current && !sleepRef.current.endOfTrack && sleepRef.current.until - Date.now() < SLEEP_FADE_MS) { normRef.current = k; return }
      const from = normRef.current
      if (!smooth || Math.abs(from - k) < 0.01) { normRef.current = k; audio.current.volume = vol(); return }
      let i = 0
      fadeTimer.current = window.setInterval(() => {
        i++
        normRef.current = from + (k - from) * (i / 12)
        audio.current.volume = vol()
        if (i >= 12) window.clearInterval(fadeTimer.current)
      }, 50)
    }
    const lv = db(levels[current.id] ?? 0)
    const k = (base: number) => Math.min(1, base * lv)
    if (!normOn) { apply(k(1), true); return }
    const hit = cachedShape(current)
    if (hit) { apply(k(normGain(hit.lufs)), lvChanged.current); lvChanged.current = false; return }
    let alive = true
    getShape(current).then((sh) => { if (alive) apply(k(normGain(sh?.lufs)), true) })
    return () => { alive = false }
  }, [current, normOn, current ? levels[current.id] : 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const lvChanged = useRef(false)
  /** 이 곡을 얼마나 더 키울 수 있나(dB). 맞추기로 줄인 만큼 */
  const headroom = useCallback((t: Track) => {
    const sh = cachedShape(t)
    const base = normOn ? normGain(sh?.lufs) : 1
    return -20 * Math.log10(base)
  }, [normOn])
  const setLevel = useCallback((id: string, v: number) => {
    lvChanged.current = true
    setLevels((old) => { const n = { ...old }; if (v) n[id] = v; else delete n[id]; save('level', n); return n })
  }, [])
  // 다른 곡으로 가면 '몇 번 듣기'는 풀린다
  useEffect(() => { if (times && current?.id !== times.id) setTimesState(null) }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const setTimes = useCallback((n: number | null) => {
    const id = queueRef.current[indexRef.current]
    setTimesState(n && id ? { id, n, done: 0 } : null)
  }, [])

  const setNorm = useCallback((v: boolean) => { setNormOnState(v); save('norm', v) }, [])
  const setTrim = useCallback((id: string, tr: Trim | null) => {
    setTrims((old) => { const n = { ...old }; if (tr && (tr.s != null || tr.e != null)) n[id] = tr; else delete n[id]; save('trim', n); return n })
    spareFor.current = '' // 미리 불러 둔 곡의 시작 자리가 바뀌었을 수 있다
  }, [])
  const setSkipSilence = useCallback((v: boolean) => { setSkipSilenceState(v); save('skipSilence', v); spareFor.current = '' }, [])
  const setXfade = useCallback((v: number) => { setXfadeState(v); save('xfade', v) }, [])

  // ── 다음 곡 미리 알림 ──
  let next: Track | undefined
  let nextNote = ''
  const timeUp = repeat.limit === 'timed' && repeatLeft <= 0
  if (current) {
    if (timeUp || (repeat.scope === 'one' && repeat.limit === 'once')) nextNote = '이 곡이 끝나면 멈춰요'
    else if (repeat.scope === 'one') { next = current; nextNote = '같은 곡을 다시 틀어요' }
    else if (times && times.id === current.id && times.done + 1 < times.n) { next = current; nextNote = `같은 곡을 한 번 더(${times.done + 2}/${times.n}번째)` }
    else if (index + 1 < queue.length) next = byId.current.get(queue[index + 1])
    else if (repeat.limit === 'once') nextNote = '마지막 곡이에요'
    else if (shuffle && queue.length > 1) nextNote = '다시 섞어서 이어 틀어요'
    else next = byId.current.get(queue[0])
  }

  const resumeTrack = resume ? byId.current.get(resume.id) : undefined
  // 다음 곡을 미리 재 두면 넘어갈 때 소리가 바로 맞는다
  const nextId = next?.id
  useEffect(() => { if (normOn && next && next.id !== current?.id) getShape(next) }, [nextId, normOn]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    current, playing, time, duration, shuffle, repeat, repeatLeft,
    resumeTrack, resumePos: resume?.pos ?? 0,
    queueTracks, index, next, nextNote, gain, plays, last, sleep, sleepLeft, goodnight,
    setSleep, dismissGoodnight: () => setGoodnight(null),
    playFrom, go, toggle, pause, seek, toggleShuffle, setRepeat, jump, removeAt, move, enqueue, setGain,
    talkPos, talkDone, markDone, rate: curRate, rateEach, setRate, skip, SKIP,
    ab, abStart, abEnd, abSet, abClear, abSpan, bookmark, setBookmark, backToMark, play, normOn, setNorm,
    bounds, trims, setTrim, skipSilence, setSkipSilence, xfade, setXfade, listPos,
    levels, setLevel, headroom, times, setTimes,
  }
}

export type Player = ReturnType<typeof usePlayer>
