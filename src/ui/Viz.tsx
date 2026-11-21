// 실시간 소리 모양: 음향 콘솔처럼 지금 나오는 소리에 바로 반응한다.
//  · 스펙트럼: 31칸(1/3옥타브, 20Hz~20kHz) 막대 + 잠깐 머무는 피크 표시
//  · 레벨 미터: 왼쪽·오른쪽 LED 막대, −48~0 dB, 피크 홀드, 넘칠 때만 붉게
//  · 물결: 소리 그 자체의 출렁임(오실로스코프)
//  · 고리: 둥글게 펼친 스펙트럼
// 색은 글자색 계열로 차분하게, 파란색은 진행 위치에만. 화면이 가려지면 그리지 않는다(배터리).
import { useEffect, useRef } from 'react'
import { metersOf } from '../lib/monofix'
import type { Viz } from '../lib/viz'

const BANDS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]

interface Props { kind: Viz; el: () => HTMLAudioElement | null; playing: boolean; ratio: number }

export function LiveViz({ kind, el, playing, ratio }: Props) {
  const cv = useRef<HTMLCanvasElement>(null)
  const ratioRef = useRef(ratio)
  ratioRef.current = ratio
  const playRef = useRef(playing)
  playRef.current = playing

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const x = c.getContext('2d')!
    let raf = 0, last = 0, W = 0, H = 0, dpr = 1
    let col = { ink: '#111', ink3: '#bbb', line: '#ddd', now: '#2563eb', warn: '#e5484d' }
    let colAt = 0
    const fit = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = c.clientWidth; H = c.clientHeight
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr)
      x.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const colors = () => {
      const st = getComputedStyle(c)
      const v = (n: string, d: string) => st.getPropertyValue(n).trim() || d
      col = { ink: v('--ink', col.ink), ink3: v('--ink3', col.ink3), line: v('--line', col.line), now: v('--now', col.now), warn: v('--warn', col.warn) }
    }
    fit(); colors()
    const ro = new ResizeObserver(fit)
    ro.observe(c)

    // 소리 값(잦아들 때 부드럽게)
    const lvl = new Float32Array(72)
    const peak = new Float32Array(72)
    const hold = new Float32Array(72)
    let freq: Uint8Array<ArrayBuffer> | null = null
    let td: Float32Array<ArrayBuffer> | null = null
    let tdL: Float32Array<ArrayBuffer> | null = null
    let tdR: Float32Array<ArrayBuffer> | null = null

    const bandsOf = (an: AnalyserNode, sr: number, n: number, out: Float32Array) => {
      if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount)
      an.getByteFrequencyData(freq)
      const hz = sr / an.fftSize
      for (let i = 0; i < n; i++) {
        const fc = n === BANDS.length ? BANDS[i] : 25 * Math.pow(800, i / (n - 1))
        const lo = Math.max(1, Math.floor(fc / 1.122 / hz)), hi = Math.min(freq.length - 1, Math.ceil(fc * 1.122 / hz))
        let m = 0
        for (let k = lo; k <= hi; k++) if (freq[k] > m) m = freq[k]
        out[i] = m / 255
      }
    }
    const dbOf = (an: AnalyserNode, buf: Float32Array<ArrayBuffer>) => {
      an.getFloatTimeDomainData(buf)
      let p = 0
      for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a }
      return p > 0 ? 20 * Math.log10(p) : -100
    }

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      if (t - last < 30) return // 초당 30번이면 충분하다
      last = t
      if (t - colAt > 1000) { colAt = t; colors() }
      const m = metersOf(el())
      const on = playRef.current && !!m
      x.clearRect(0, 0, W, H)
      const n = kind === 'spec' ? BANDS.length : kind === 'ring' ? 36 : kind === 'meter' ? 2 : 0
      const target = new Float32Array(Math.max(n, 1))
      if (on && m) {
        const sr = m.ctx?.sampleRate ?? 48000
        if (kind === 'spec' || kind === 'ring') bandsOf(m.an, sr, n, target)
        if (kind === 'meter') {
          if (!tdL) { tdL = new Float32Array(m.l.fftSize); tdR = new Float32Array(m.r.fftSize) }
          const dl = dbOf(m.l, tdL), dr = dbOf(m.r, tdR!)
          const r = dr < -90 && dl > -90 ? dl : dr // 한쪽만 있는 곡은 같은 값으로
          target[0] = Math.max(0, Math.min(1, (dl + 48) / 48))
          target[1] = Math.max(0, Math.min(1, (r + 48) / 48))
        }
      }
      // 오를 때는 바로, 내릴 때는 천천히(콘솔 바늘처럼)
      for (let i = 0; i < n; i++) {
        lvl[i] = target[i] > lvl[i] ? target[i] : lvl[i] * 0.86 + target[i] * 0.14
        if (lvl[i] >= peak[i]) { peak[i] = lvl[i]; hold[i] = 24 } else if (hold[i] > 0) { hold[i]-- } else { peak[i] = Math.max(0, peak[i] - 0.018) }
      }
      const r = ratioRef.current
      const base = H - 3 // 아래 진행 줄 자리

      if (kind === 'spec') {
        const gap = 2, bw = (W - gap * (n - 1)) / n, top = base - 6, room = top - 5 // 피크 표시가 위로 잘리지 않게
        for (let i = 0; i < n; i++) {
          const h = Math.max(2, lvl[i] * room)
          const bx = i * (bw + gap)
          x.fillStyle = col.ink; x.fillRect(bx, top - h, bw, h)
          if (peak[i] > 0.02) { x.fillStyle = col.ink; x.fillRect(bx, top - peak[i] * room - 4, bw, 2) }
        }
      } else if (kind === 'meter') {
        const seg = 40, gap = 2, sw = (W - 22 - gap * (seg - 1)) / seg, rowH = Math.min(18, (base - 26) / 2)
        x.font = '600 13px Pretendard, system-ui, sans-serif'; x.textBaseline = 'middle'
        for (let ch = 0; ch < 2; ch++) {
          const y = 4 + ch * (rowH + 8)
          x.fillStyle = col.ink3; x.fillText(ch ? 'R' : 'L', 0, y + rowH / 2)
          const litN = Math.round(lvl[ch] * seg), pk = Math.min(seg - 1, Math.round(peak[ch] * seg) - 1)
          for (let k = 0; k < seg; k++) {
            const sx = 22 + k * (sw + gap)
            const hot = k >= seg - 2 // −2.4 dB 위: 넘치기 직전
            x.fillStyle = k < litN ? (hot ? col.warn : col.ink) : col.line
            if (k === pk && peak[ch] > 0.02) x.fillStyle = hot ? col.warn : col.ink
            x.fillRect(sx, y, sw, rowH)
          }
        }
        // dB 눈금
        x.fillStyle = col.ink3; x.font = '500 13px Pretendard, system-ui, sans-serif'; x.textBaseline = 'alphabetic'
        for (const db of [-40, -20, -10, -6, 0]) {
          const k = Math.round(((db + 48) / 48) * seg) - 1, sx = 22 + Math.max(0, k) * (sw + gap) + sw / 2
          const s = String(db), tw = x.measureText(s).width
          x.fillText(s, Math.min(W - tw, Math.max(22, sx - tw / 2)), base - 6)
        }
      } else if (kind === 'wave') {
        x.strokeStyle = col.line; x.lineWidth = 1
        x.beginPath(); x.moveTo(0, base / 2); x.lineTo(W, base / 2); x.stroke()
        if (on && m) {
          if (!td || td.length !== m.an.fftSize) td = new Float32Array(m.an.fftSize)
          m.an.getFloatTimeDomainData(td)
          // 가장 처음 0을 위로 지나는 곳부터 그려서 출렁임이 흔들리지 않게
          let s0 = 0
          for (let i = 1; i < td.length / 2; i++) if (td[i - 1] < 0 && td[i] >= 0) { s0 = i; break }
          const span = Math.min(td.length - s0, 1024)
          x.strokeStyle = col.ink; x.lineWidth = 2; x.lineJoin = 'round'
          x.beginPath()
          for (let i = 0; i < span; i += 4) {
            const px = (i / span) * W, py = base / 2 - Math.max(-1, Math.min(1, td[s0 + i] * 1.6)) * (base / 2 - 4)
            if (i) x.lineTo(px, py); else x.moveTo(px, py)
          }
          x.stroke()
        }
      } else if (kind === 'ring') {
        const cx = W / 2, cy = base / 2, r0 = Math.min(base / 2 - 14, 34)
        x.strokeStyle = col.line; x.lineWidth = 3
        x.beginPath(); x.arc(cx, cy, r0 - 7, 0, Math.PI * 2); x.stroke()
        x.strokeStyle = col.now; x.lineCap = 'round'
        x.beginPath(); x.arc(cx, cy, r0 - 7, -Math.PI / 2, -Math.PI / 2 + r * Math.PI * 2); x.stroke(); x.lineCap = 'butt'
        x.strokeStyle = col.ink; x.lineWidth = 2; x.lineJoin = 'round'
        x.beginPath()
        const pts = n * 2 // 좌우 대칭
        for (let k = 0; k <= pts; k++) {
          const i = k < n ? k : pts - k - 1
          const a = -Math.PI / 2 + (k / pts) * Math.PI * 2
          const rr = r0 + Math.max(0, lvl[Math.max(0, Math.min(n - 1, i))]) * (base / 2 - r0 - 1)
          const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr
          if (k) x.lineTo(px, py); else x.moveTo(px, py)
        }
        x.closePath(); x.stroke()
      }

      // 아래 진행 줄(고리는 가운데 원이 진행이라 생략)
      if (kind !== 'ring') {
        x.fillStyle = col.line; x.fillRect(0, H - 2, W, 2)
        x.fillStyle = col.now; x.fillRect(0, H - 2, W * r, 2)
      }
      // 멈춰 있고 다 잦아들었으면 쉰다(다시 재생하면 이어서)
      if (!on && (kind === 'wave' || (lvl.slice(0, n).every((v) => v < 0.005) && peak.slice(0, n).every((v) => v < 0.005)))) { cancelAnimationFrame(raf); raf = 0 }
    }
    const start = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame) }
    const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0 } else start() }
    document.addEventListener('visibilitychange', vis)
    start()
    const kick = window.setInterval(start, 500) // 재생을 다시 시작하면 깨운다
    return () => { cancelAnimationFrame(raf); clearInterval(kick); ro.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [kind, el])

  return <canvas ref={cv} className={'lviz ' + kind} aria-hidden="true" />
}
