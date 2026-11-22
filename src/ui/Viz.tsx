// 콘솔식 소리 모양: 고급 음향 콘솔의 LED 화면처럼, 지금 나오는 소리를 실시간으로 잰다.
//  · 레벨 미터: L/R 60칸 LED, IEC 눈금(0 dB 가까이를 넓게), RMS 막대 + 피크 점(1.5초 머묾), PEAK 숫자, CLIP 불
//  · 스펙트럼: 1/3옥타브 31칸(20Hz~20kHz) LED 점 막대, dB 격자, 피크 점
//  · 스테레오 위상: 고니오미터 점구름 + 상관 막대(−1~+1)
// 낮·밤과 상관없이 검은 장비 화면에 그린다. 색은 콘솔 표준(초록→노랑→빨강).
// 오르내림은 계측기 규격: 피크는 바로 오르고 1.5초에 20 dB 떨어짐, RMS는 0.3초 평균.
import { useEffect, useRef } from 'react'
import { metersOf } from '../lib/monofix'
import { tx } from '../lib/i18n'
import type { Viz } from '../lib/viz'
import { Icon } from './common'
import { Page } from './Sheets'
import { Floaters } from './Floaters'
import { getGlyph } from '../lib/glyph'
import { cardName } from '../lib/church'
import { useFlag } from '../lib/flag'

const BANDS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]
const BG = '#07080a', FRAME = '#1c2026', TXT = '#8b939d', HI = '#e6edf3'
type RGB = [number, number, number]
const GREEN: RGB = [52, 211, 120], AMBER: RGB = [245, 196, 66], RED: RGB = [255, 82, 82]
/** 카드 이름 색: 화면의 청동색(낮)·금빛(밤)을 그대로 */
const brandRGB = (): RGB => {
  const h = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().replace('#', '')
  return h.length === 6 ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : AMBER
}
const zone = (db: number): RGB => (db < -18 ? GREEN : db < -6 ? AMBER : RED)
const rgb = ([r, g, b]: RGB, a = 1) => (a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`)
const FONT = 'Pretendard, system-ui, sans-serif'

/** IEC 60268-18 눈금: dB → 0~1 (0 dB 가까이를 넓게) */
function iec(db: number): number {
  let p: number
  if (db < -70) p = 0
  else if (db < -60) p = (db + 70) * 0.25
  else if (db < -50) p = (db + 60) * 0.5 + 2.5
  else if (db < -40) p = (db + 50) * 0.75 + 7.5
  else if (db < -30) p = (db + 40) * 1.5 + 15
  else if (db < -20) p = (db + 30) * 2 + 30
  else if (db < 0) p = (db + 20) * 2.5 + 50
  else p = 100
  return p / 100
}
const SEG = 60
// 칸마다 dB(눈금의 거꾸로)를 미리 구해 둔다
const SEG_DB = Array.from({ length: SEG }, (_, k) => { for (let d = -70; d <= 0; d += 0.25) if (iec(d) >= (k + 0.5) / SEG) return d; return 0 })

interface Meter {
  rms: number[]; pk: number[]; hold: number[]; ht: number[]; clip: number[]
  band: Float32Array; bpk: Float32Array; bht: Float32Array; corr: number; gain: number
}
const fresh = (): Meter => ({ rms: [-90, -90], pk: [-90, -90], hold: [-90, -90], ht: [0, 0], clip: [0, 0], band: new Float32Array(31).fill(-90), bpk: new Float32Array(31).fill(-90), bht: new Float32Array(31), corr: 1, gain: 1 })

type Get = () => HTMLAudioElement | null
export type ConsoleKind = Exclude<Viz, 'shape'>

/** 한 캔버스에 한 가지 */
export function ConsoleViz({ kind, el, playing, className }: { kind: ConsoleKind; el: Get; playing: boolean; className?: string }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const playRef = useRef(playing)
  playRef.current = playing
  const fxc = useRef<HTMLCanvasElement>(null)
  const notesOn = useFlag('notes', true)
  const notesRef = useRef(notesOn)
  notesRef.current = notesOn
  const big = !!className?.includes('big')
  const UP = big ? 56 : 64 // 그림 위로 떠오를 여유

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const x = c.getContext('2d')!
    let raf = 0, last = 0, W = 0, H = 0
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      W = c.clientWidth; H = c.clientHeight
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr)
      x.setTransform(dpr, 0, 0, dpr, 0, 0)
      x.fillStyle = BG; x.fillRect(0, 0, W, H)
    }
    fit()
    const fx = fxc.current ? new Floaters(fxc.current, UP, H < 110) : null
    fx?.fit()
    // 다른 탭에 있다가 돌아오면(크기가 생기면) 다시 그린다
    const ro = new ResizeObserver(() => { fit(); fx?.fit(); idle = 0; start() })
    ro.observe(c)
    // 박자 찾기: 짧은 순간의 세기가 최근 평균보다 확 커지면
    const bt = { fast: 0, slow: 0, last: -9, clock: 0, gaps: [] as number[], bright: 0.4, ip: [-90, -90], e: 0, d: 0, prev: new Float32Array(31).fill(-90), side: 0, ended: false, name: -99 }
    const m: Meter = fresh()
    let tdL: Float32Array<ArrayBuffer> | null = null, tdR: Float32Array<ArrayBuffer> | null = null
    let fq: Float32Array<ArrayBuffer> | null = null

    const panel = () => {
      x.fillStyle = BG; x.fillRect(0, 0, W, H)
      x.strokeStyle = FRAME; x.lineWidth = 1; x.strokeRect(0.5, 0.5, W - 1, H - 1)
    }

    const measure = (dt: number) => {
      const g = metersOf(el())
      const on = playRef.current && !!g
      if (on && g) {
        if (!tdL || tdL.length !== g.l.fftSize) { tdL = new Float32Array(g.l.fftSize); tdR = new Float32Array(g.r.fftSize) }
        g.l.getFloatTimeDomainData(tdL); g.r.getFloatTimeDomainData(tdR!)
        // 한쪽만 소리가 있는 곡(모노)은 오른쪽을 왼쪽으로
        let sR = 0
        for (let i = 0; i < tdR!.length; i += 8) sR += Math.abs(tdR![i])
        if (sR < 1e-6) tdR!.set(tdL)
        const lvl = (b: Float32Array) => {
          let p = 0, s = 0
          for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a; s += b[i] * b[i] }
          return [p > 0 ? 20 * Math.log10(p) : -90, s > 0 ? 10 * Math.log10(s / b.length) : -90]
        }
        let e = 0, d = 0, aL = 0, aR = 0
        for (let i = 1; i < tdL.length; i += 2) {
          const l = tdL[i], r = tdR![i], mm = (l + r) * 0.5, pm = (tdL[i - 1] + tdR![i - 1]) * 0.5
          e += mm * mm; d += (mm - pm) * (mm - pm); aL += Math.abs(l); aR += Math.abs(r)
        }
        bt.e = e / (tdL.length / 2); bt.d = d / (tdL.length / 2); bt.side = aL + aR > 1e-6 ? (aL - aR) / (aL + aR) : 0
        ;[tdL, tdR!].forEach((b, ch) => {
          const [p, r] = lvl(b)
          bt.ip[ch] = p
          m.rms[ch] += (r - m.rms[ch]) * (1 - Math.exp(-dt / 0.3))
          m.pk[ch] = p > m.pk[ch] ? p : m.pk[ch] - 13.3 * dt
          if (p > m.hold[ch]) { m.hold[ch] = p; m.ht[ch] = 1.5 } else if ((m.ht[ch] -= dt) < 0) m.hold[ch] -= 13.3 * dt
          if (p >= -0.1) m.clip[ch] = 2.5
        })
        if (kind === 'spec') {
          bt.prev.set(m.band)
          if (!fq || fq.length !== g.an.frequencyBinCount) fq = new Float32Array(g.an.frequencyBinCount)
          g.an.getFloatFrequencyData(fq)
          const hz = (g.ctx?.sampleRate ?? 48000) / g.an.fftSize
          for (let i = 0; i < 31; i++) {
            const lo = Math.max(1, Math.floor(BANDS[i] / 1.122 / hz)), hi = Math.min(fq.length - 1, Math.max(lo, Math.ceil((BANDS[i] * 1.122) / hz)))
            let pw = 0
            for (let k = lo; k <= hi; k++) pw += Math.pow(10, fq[k] / 10)
            const v = pw > 0 ? 10 * Math.log10(pw) + 6 : -90 // 6 dB: 창 함수로 줄어든 만큼
            const a = v > m.band[i] ? 1 - Math.exp(-dt / 0.01) : 1 - Math.exp(-dt / 0.3)
            m.band[i] += (v - m.band[i]) * a
            if (m.band[i] > m.bpk[i]) { m.bpk[i] = m.band[i]; m.bht[i] = 1.2 } else if ((m.bht[i] -= dt) < 0) m.bpk[i] -= 13.3 * dt
          }
        }
      } else {
        // 멈추면 바늘이 규격대로 내려온다
        for (let ch = 0; ch < 2; ch++) { m.rms[ch] += (-90 - m.rms[ch]) * (1 - Math.exp(-dt / 0.3)); m.pk[ch] -= 13.3 * dt; m.hold[ch] -= 13.3 * dt }
        for (let i = 0; i < 31; i++) { m.band[i] -= 40 * dt; m.bpk[i] -= 13.3 * dt }
      }
      for (let ch = 0; ch < 2; ch++) m.clip[ch] -= dt
      return on
    }

    const drawMeter = () => {
      panel()
      const small = H < 110 // 지금 화면: 파형과 비슷한 높이
      const L = 30, Rr = W - 52, gw = (Rr - L) / SEG
      const rowH = small ? 13 : Math.max(16, Math.min(26, (H - 70) / 2)), gap = small ? 5 : 10, y0 = small ? 8 : 12
      x.textBaseline = 'middle'
      for (let ch = 0; ch < 2; ch++) {
        const y = y0 + ch * (rowH + gap)
        x.font = `700 13px ${FONT}`; x.fillStyle = TXT; x.fillText(ch ? 'R' : 'L', 12, y + rowH / 2)
        const lit = iec(m.rms[ch]), pk = Math.min(SEG - 1, Math.floor(iec(m.hold[ch]) * SEG))
        for (let k = 0; k < SEG; k++) {
          const col = zone(SEG_DB[k]), sx = L + k * gw
          if ((k + 0.5) / SEG <= lit) { x.shadowColor = rgb(col); x.shadowBlur = 6; x.fillStyle = rgb(col) }
          else if (k === pk && m.hold[ch] > -69) { x.shadowBlur = 0; x.fillStyle = rgb(col) }
          else { x.shadowBlur = 0; x.fillStyle = rgb(col, 0.09) }
          x.fillRect(sx, y, gw - 1.5, rowH)
        }
        x.shadowBlur = 0
        const clip = m.clip[ch] > 0
        x.fillStyle = clip ? rgb(RED) : rgb(RED, 0.12); x.fillRect(Rr + 8, y, 36, rowH)
        x.fillStyle = clip ? '#1a0000' : rgb(RED, 0.5); x.font = `800 ${small ? 11 : 12}px ${FONT}`; x.textAlign = 'center'; x.fillText('CLIP', Rr + 26, y + rowH / 2 + 0.5); x.textAlign = 'left'
      }
      // 눈금: 막대 바로 아래
      const sy = y0 + 2 * rowH + gap + (small ? 10 : 14)
      x.font = `600 ${small ? 12 : 13}px ${FONT}`; x.fillStyle = TXT
      for (const d of [-50, -30, -20, -10, -5, 0]) {
        const px = L + iec(d) * (Rr - L), s0 = String(d), tw = x.measureText(s0).width
        x.fillText(s0, Math.min(Rr - tw, Math.max(L, px - tw / 2)), sy)
      }
      // 숫자: 맨 아래 한 줄(오른쪽 끝은 「콘솔 보기」 단추 자리)
      const pk = Math.max(m.hold[0], m.hold[1]), rms = Math.max(m.rms[0], m.rms[1])
      const ny = H - (small ? 11 : 16)
      x.font = `700 ${small ? 13 : 15}px ui-monospace, Menlo, monospace`; x.fillStyle = HI
      const ptxt = `PEAK ${pk < -69 ? '-inf' : (pk > 0 ? '+' : '') + pk.toFixed(1)} dB`
      x.fillText(ptxt, 12, ny)
      x.font = `600 13px ${FONT}`; x.fillStyle = TXT
      x.fillText(`RMS ${rms < -69 ? '-inf' : rms.toFixed(1)}`, 12 + x.measureText(ptxt).width * 1.15 + 18, ny)
    }

    const drawSpec = () => {
      panel()
      const small = H < 110
      const n = 31, L = 34, top = small ? 8 : 12, bot = H - (small ? 20 : 26), cw = (W - L - 10) / n
      const rows = Math.max(12, Math.min(30, Math.floor((bot - top) / 5))), rh = (bot - top) / rows
      const FLOOR = -72 // 맨 아래 칸
      x.font = `600 12px ${FONT}`; x.fillStyle = TXT; x.textBaseline = 'middle'
      for (const d of small ? [0, -36] : [0, -18, -36, -54]) {
        const y = top + (d / FLOOR) * (bot - top)
        x.fillText(String(d), 4, y)
        x.strokeStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.moveTo(L, y); x.lineTo(W - 10, y); x.stroke()
      }
      for (let i = 0; i < n; i++) {
        const lv = Math.max(0, Math.min(1, (m.band[i] - FLOOR) / -FLOOR)), pv = Math.max(0, Math.min(1, (m.bpk[i] - FLOOR) / -FLOOR))
        const lit = Math.round(lv * rows), pr = Math.min(rows - 1, Math.round(pv * rows) - 1), sx = L + i * cw
        for (let r = 0; r < rows; r++) {
          const y = bot - (r + 1) * rh, col = zone(FLOOR + ((r + 0.5) / rows) * -FLOOR)
          if (r < lit) { x.fillStyle = rgb(col); x.shadowColor = x.fillStyle; x.shadowBlur = 4 }
          else if (r === pr && pv > 0.03) { x.shadowBlur = 0; x.fillStyle = rgb(col) }
          else { x.shadowBlur = 0; x.fillStyle = rgb(col, 0.08) }
          x.fillRect(sx + 1, y + 1, cw - 2.5, rh - 2)
        }
        x.shadowBlur = 0
      }
      x.fillStyle = TXT; x.textAlign = 'center'; x.font = `600 13px ${FONT}`
      for (const [i, l] of [[5, '63'], [11, '250'], [17, '1k'], [23, '4k'], [29, '16k']] as const) x.fillText(l, L + i * cw + cw / 2, H - (small ? 9 : 12))
      x.textAlign = 'left'
    }

    const drawPhase = (on: boolean) => {
      const small = H < 110
      // 잔상이 남게 조금씩만 지운다
      x.fillStyle = 'rgba(7,8,10,.35)'; x.fillRect(0, 0, W, H)
      const cy = small ? H / 2 : (H - 24) / 2 + 2, cx = small ? Math.min(W * 0.3, 70) + 10 : W / 2
      const r = small ? H / 2 - 8 : Math.min(cx - 14, cy - 10)
      x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1; x.beginPath()
      x.moveTo(cx - r, cy); x.lineTo(cx + r, cy); x.moveTo(cx, cy - r); x.lineTo(cx, cy + r)
      x.moveTo(cx - r * 0.7, cy - r * 0.7); x.lineTo(cx + r * 0.7, cy + r * 0.7); x.moveTo(cx + r * 0.7, cy - r * 0.7); x.lineTo(cx - r * 0.7, cy + r * 0.7); x.stroke()
      x.fillStyle = TXT; x.font = `700 ${small ? 12 : 13}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'
      x.fillText('L', cx - r * 0.74 - 7, cy - r * 0.74); x.fillText('R', cx + r * 0.74 + 7, cy - r * 0.74)
      x.textAlign = 'left'
      if (on && tdL && tdR) {
        let sl = 0, sr = 0, slr = 0
        for (let i = 0; i < tdL.length; i++) { sl += tdL[i] * tdL[i]; sr += tdR[i] * tdR[i]; slr += tdL[i] * tdR[i] }
        const e = Math.sqrt((sl + sr) / (2 * tdL.length))
        const corr = sl > 0 && sr > 0 ? slr / Math.sqrt(sl * sr) : 1
        m.corr += (corr - m.corr) * 0.15
        // 작은 소리도 보이게 저절로 키운다(장비의 AGC처럼)
        const want = e > 1e-5 ? Math.min(12, 0.2 / e) : 1
        m.gain += (want - m.gain) * 0.08
        x.globalCompositeOperation = 'lighter'
        x.fillStyle = 'rgba(80,230,150,.22)'
        const k = r * m.gain * 0.7071, maxY = small ? H - 2 : H - 26, maxX = small ? cx + r + 6 : W - 2
        for (let i = 0; i < tdL.length; i += 2) {
          const px = cx + (tdR[i] - tdL[i]) * k, py = cy - (tdL[i] + tdR[i]) * k
          if (px > 2 && px < maxX && py > 2 && py < maxY) x.fillRect(px, py, 1.6, 1.6)
        }
        x.globalCompositeOperation = 'source-over'
      }
      // 상관 막대(작을 때는 오른쪽, 클 때는 아래)
      const mid0 = (bx: number, bw: number, y: number) => {
        x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(bx, y, bw, 6)
        const mid = bx + bw / 2, cp = bx + (bw * (m.corr + 1)) / 2
        x.fillStyle = m.corr >= 0 ? rgb(GREEN) : rgb(RED); x.fillRect(Math.min(mid, cp), y, Math.abs(cp - mid), 6)
        x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(mid - 0.5, y - 3, 1, 12)
        x.fillStyle = TXT; x.font = `600 ${small ? 12 : 13}px ${FONT}`; x.fillText('−1', bx - 22, y + 3); x.fillText('+1', bx + bw + 6, y + 3)
      }
      if (small) {
        const bx = cx + r + 40, bw = Math.max(40, W - bx - 30 - 48)
        x.fillStyle = BG; x.fillRect(cx + r + 8, 0, W - cx - r - 9, H)
        x.fillStyle = TXT; x.font = `600 12px ${FONT}`; x.fillText(tx("좌우 닮음"), bx, H / 2 - 16)
        mid0(bx, bw, H / 2)
      } else {
        x.fillStyle = BG; x.fillRect(0, H - 24, W, 24)
        mid0(34, W - 68, H - 15)
      }
      x.strokeStyle = FRAME; x.strokeRect(0.5, 0.5, W - 1, H - 1)
    }

    const beat = (dt: number) => {
      if (!fx) return
      bt.clock += dt
      const e = bt.e
      bt.fast += (e - bt.fast) * (1 - Math.exp(-dt / 0.04))
      bt.slow += (e - bt.slow) * (1 - Math.exp(-dt / 0.9))
      const br = bt.e > 1e-7 ? Math.max(0, Math.min(1, (Math.log10(bt.d / bt.e) + 2.2) / 2)) : bt.bright
      bt.bright += (br - bt.bright) * (1 - Math.exp(-dt / 0.5))
      const gap = bt.clock - bt.last
      if (bt.fast < 3e-5 || gap < 0.2 || bt.fast < bt.slow * 1.45) return
      // 곡 빠르기: 최근 박자 사이의 가운뎃값
      if (gap < 1.6) { bt.gaps.push(gap); if (bt.gaps.length > 9) bt.gaps.shift() }
      bt.last = bt.clock
      const g = [...bt.gaps].sort((a, b) => a - b), med = g.length >= 3 ? g[g.length >> 1] : 0.55
      const tempo = Math.max(0.8, Math.min(1.25, 0.55 / med))
      const power = Math.max(0, Math.min(1, Math.log10(bt.fast / Math.max(bt.slow, 1e-7)) / 0.6))
      const small = H < 110
      let ox = W / 2, oy = H / 2, col: RGB = GREEN, side = 0
      if (kind === 'meter') {
        const L = 30, Rr = W - 52, rowH = small ? 13 : Math.max(16, Math.min(26, (H - 70) / 2)), gap2 = small ? 5 : 10, y0 = small ? 8 : 12
        const ch = bt.ip[1] > bt.ip[0] ? 1 : 0, p = bt.ip[ch]
        ox = L + iec(m.rms[ch] + 3) * (Rr - L); oy = y0 + ch * (rowH + gap2) + rowH / 2
        col = p > -3 ? RED : zone(m.rms[ch] + 3); side = (ox / W - 0.5) * 0.6
      } else if (kind === 'spec') {
        const n = 31, L = 34, top = small ? 8 : 12, bot = H - (small ? 20 : 26), cw = (W - L - 10) / n
        let bi = 0, bv = -1e9
        for (let i = 0; i < n; i++) { const v = (m.band[i] - bt.prev[i]) * 2 + m.band[i] * 0.15; if (v > bv) { bv = v; bi = i } }
        const lv = Math.max(0, Math.min(1, (m.band[bi] + 72) / 72))
        ox = L + bi * cw + cw / 2; oy = bot - lv * (bot - top); col = zone(m.band[bi]); side = (bi / (n - 1) - 0.5) * 0.8
      } else {
        const cy = small ? H / 2 : (H - 24) / 2 + 2, cx = small ? Math.min(W * 0.3, 70) + 10 : W / 2, r = small ? H / 2 - 8 : Math.min(cx - 14, cy - 10)
        side = -bt.side // 왼쪽 소리면 왼쪽으로
        ox = cx + side * r * 0.6; oy = cy - r * 0.35; col = m.corr < 0 ? RED : GREEN
      }
      // 아주 가끔, 가장 큰 순간에 카드 이름이 은은하게 떠오른다
      const nm = cardName()
      if (nm && power > 0.8 && bt.clock - bt.name > 45 && Math.random() < 0.3) { bt.name = bt.clock; fx.emitText(nm, ox, oy - 6, brandRGB()); return }
      fx.emit({ x: ox, y: oy, col, power, side, bright: bt.bright, tempo }, getGlyph())
    }

    // 누르면 톡: 모양이 있는 자리만 가로챈다(그 밑의 단추·진행 줄은 그대로)
    let swallow = false
    const down = (e: PointerEvent) => {
      if (!(fx && notesRef.current && fx.hit(e.clientX, e.clientY))) return
      idle = 0; start()
      // 밑에 단추·진행 줄이 있을 때만 가로챈다(그림 위 쓸어 넘기기는 그대로 되게)
      if ((e.target as Element | null)?.closest?.('button, input, a, [role=button]')) { e.preventDefault(); e.stopPropagation(); swallow = true }
    }
    const click = (e: MouseEvent) => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation() } }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('click', click, true)

    let idle = 0
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60
      last = t
      const on = measure(dt)
      if (!W || !H) { idle += dt; if (idle > 2.5) { cancelAnimationFrame(raf); raf = 0; last = 0 } return }
      if (kind === 'meter') drawMeter()
      else if (kind === 'spec') drawSpec()
      else drawPhase(on)
      let alive = false
      if (fx) {
        if (on && notesRef.current) beat(dt)
        const a = el()
        if (a && a.duration > 0) {
          const end = a.ended || (!a.paused && a.duration - a.currentTime < 0.3)
          if (end && !bt.ended) { bt.ended = true; fx.finale() }
          else if (!end && a.currentTime < a.duration - 1) bt.ended = false
        }
        if (!notesRef.current && fx.busy) fx.clear()
        alive = fx.step(dt)
      }
      // 멈춘 채 다 내려왔으면 쉰다
      idle = on || alive ? 0 : idle + dt
      if (idle > 2.5) { cancelAnimationFrame(raf); raf = 0; last = 0 }
    }
    const start = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame) }
    const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0 } else start() }
    document.addEventListener('visibilitychange', vis)
    start()
    const kick = window.setInterval(() => { if (playRef.current) start() }, 400)
    return () => { cancelAnimationFrame(raf); clearInterval(kick); ro.disconnect(); document.removeEventListener('visibilitychange', vis); document.removeEventListener('pointerdown', down, true); document.removeEventListener('click', click, true) }
  }, [kind, el, UP])

  return (
    <div className={'cvbox ' + kind + (className ? ' ' + className : '')}>
      <canvas ref={cv} className="cviz" aria-hidden="true" />
      <canvas ref={fxc} className="cv-fx" style={{ top: -UP, height: `calc(100% + ${UP}px)` }} aria-hidden="true" />
    </div>
  )
}

/** 「콘솔 보기」: 세 가지를 크게(가로로 돌리면 나란히) */
export function ConsolePage({ el, playing, onClose }: { el: Get; playing: boolean; onClose: () => void }) {
  return (
    <Page label={tx("콘솔 보기")} onClose={onClose}>
      <div className="cpage">
        <section><h2 className="sub">{tx("레벨 미터")}</h2><ConsoleViz kind="meter" el={el} playing={playing} className="big" /></section>
        <section><h2 className="sub">{tx("스펙트럼")}</h2><ConsoleViz kind="spec" el={el} playing={playing} className="big" /></section>
        <section><h2 className="sub">{tx("스테레오 위상")}</h2><ConsoleViz kind="phase" el={el} playing={playing} className="big" /></section>
        <p className="chv-note">{tx("지금 나오는 소리를 실시간으로 재요. 소리에는 손대지 않아요.")}</p>
      </div>
    </Page>
  )
}

/** 지금 화면의 작은 「크게 보기」 단추 */
export function ConsoleOpen({ onOpen }: { onOpen: () => void }) {
  return <button className="cv-open" onClick={onOpen} aria-label={tx("콘솔 보기")}><Icon n="expand" s={18} /></button>
}
