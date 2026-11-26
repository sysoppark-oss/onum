// 콘솔 그림 위로 떠오르는 모양들. 소리가 갑자기 커지는 순간(박자·강세)에 그 자리에서 솟는다.
//  · 세기 → 크기, 곡 빠르기 → 떠오르는 속도, 고음 → 살랑살랑 흔들림, 저음 → 묵직하게 솟음
//  · 몇 개는 그림 바로 위에 남아 맴돌다가, 곡이 끝나는 순간 한꺼번에 흩어진다
//  · 누르면 톡 터진다(재생에는 영향 없음)
import { NOTE_AMOUNTS, NOTE_COLORS, PATH, getNoteAmount, getNoteColor, getWordColor, getWords, shapeFor, wordFor, type Glyph, type NoteColor } from '../lib/glyph'
import { tx } from '../lib/i18n'

/** 설정에서 고른 선 색(여러 색이면 null: 그림이 준 색을 그대로) */
function pickColor(id: NoteColor = getNoteColor()): [number, number, number] | null {
  const c = NOTE_COLORS.find((x) => x.id === id)
  if (!c || !c.v) return null
  const name = c.v.slice(4, -1) // var(--x) → --x
  const h = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

type RGB = [number, number, number]
export interface Burst { x: number; y: number; col: RGB; power: number; side: number; bright: number; tempo: number }
interface P {
  k: string; x: number; y: number; vx: number; vy: number; s: number; rot: number; vr: number; col: RGB
  age: number; life: number; sway: number; w: number; ph: number; kind: 'fly' | 'keep' | 'bit' | 'text'; tx: number; ty: number; t?: string; wd?: string; rise?: boolean
}
const paths = new Map<string, Path2D>()
const pathOf = (k: string) => { let p = paths.get(k); if (!p) { p = new Path2D(PATH[k]); paths.set(k, p) } return p }

export class Floaters {
  private x: CanvasRenderingContext2D
  private W = 0
  private H = 0
  private ps: P[] = []
  private n = 0
  private lastBig = 0
  private lastEmit = 0
  readonly reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  private cv: HTMLCanvasElement
  up: number
  /** 그림 위 여유를 바꾼다(화면 맨 위까지 떠오르게 맞출 때). 떠 있는 것들은 제자리에 보이게 옮긴다 */
  setUp(up: number) { const d = up - this.up; for (const p of this.ps) { p.y += d; p.ty += d } this.up = up }
  private small: boolean
  constructor(cv: HTMLCanvasElement, up: number, small: boolean) {
    this.cv = cv; this.up = up; this.small = small
    this.x = cv.getContext('2d')!
  }
  fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.W = this.cv.clientWidth; this.H = this.cv.clientHeight
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr)
    this.x.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  get busy() { return this.ps.length > 0 }

  /** 박자 하나: 그림 칸 기준 좌표(b.x, b.y) */
  emit(b: Burst, g: Glyph) {
    if (this.reduce && Math.random() > 0.35) return
    // 떠오르는 수: 적게·보통·많이(보통이 예전과 같다)
    const am = NOTE_AMOUNTS.find((x) => x.id === getNoteAmount()) ?? NOTE_AMOUNTS[1]
    if (am.k < 1 && Math.random() > am.k) return
    const flying = this.ps.reduce((a, p) => a + (p.kind === 'fly' ? 1 : 0), 0)
    const cap = Math.round((this.small ? 12 : 22) * am.max / 10)
    if (flying >= cap) return
    // 천천히 올라가므로 고르게 띄운다(한꺼번에 몰리지 않게)
    const now = performance.now()
    if (now - this.lastEmit < (this.up + 60) / 34 * 1000 / cap) return
    this.lastEmit = now
    const col = pickColor() ?? b.col
    // 소리가 아주 세지거나 고음이 확 올라온 순간: 여러 개 대신 다섯 배쯤 큰 것 하나(몇 초에 한 번만)
    const strong = b.power > 0.8 || (b.bright > 0.75 && b.power > 0.6)
    const big = getWords().big && !this.reduce && strong && performance.now() - this.lastBig > 6000
    if (big) this.lastBig = performance.now()
    const count = big ? 1 : (!this.reduce && b.power > 0.75 ? 2 : 1) + (am.k > 1 && Math.random() < am.k - 1 ? 1 : 0)
    for (let c = 0; c < count; c++) {
      const heavy = 1 - b.bright
      const base = this.small ? 9 : 13
      const s = (base + b.power * (this.small ? 9 : 15) + heavy * 3 + Math.random() * 2) * (big ? 1.65 : 1)
      const wd = wordFor(this.n, tx) ?? undefined
      const t = b.tempo
      const p: P = {
        k: shapeFor(g, this.n++, b), wd, x: big ? Math.max(this.W * 0.25, Math.min(this.W * 0.75, b.x)) : b.x + (Math.random() - 0.5) * 8, y: b.y + this.up, s, col: wd ? pickColor(getWordColor()) ?? b.col : col,
        vx: b.side * 14 + (Math.random() - 0.5) * 12, vy: -(24 + 26 * b.power + 18 * heavy) * t,
        rot: (Math.random() - 0.5) * (big || wd ? 0.15 : 0.5), vr: this.reduce || big || wd ? 0 : (Math.random() - 0.5) * (0.6 + b.bright * 2.4),
        age: 0, life: (2.6 + Math.random() * 0.9) / Math.sqrt(t), sway: this.reduce ? 0 : 3 + b.bright * 14,
        w: 1.6 + b.bright * 2.6, ph: Math.random() * 6.28, kind: 'fly', tx: 0, ty: 0,
      }
      // 대부분은 화면 맨 위(상태 표시줄)까지 쭉 올라가 사라진다. 몇 개만 그림 바로 위에 머문다(곡 끝에 흩어질 것들)
      const stay = !big && !this.reduce && Math.random() < 0.25
      if (!stay) {
        // 아지랑이 피어오르듯: 느리게, 좌우로 살랑이며, 은은하게
        const dist = Math.max(40, p.y - 6), v = 26 + 12 * b.power + Math.random() * 6
        p.rise = true; p.vy = -v; p.life = dist / v; p.vx = 0
        p.sway = 4 + Math.random() * 5; p.w = 0.8 + Math.random() * 0.7
      }
      this.ps.push(p)
    }
  }

  /** 카드 이름이 은은하게 떠오른다(아주 가끔) */
  emitText(t: string, x: number, y: number, col: RGB) {
    if (this.ps.some((p) => p.kind === 'text')) return
    const w = Math.min(this.W - 24, t.length * (this.small ? 14 : 17))
    this.ps.push({ k: '', t, x: Math.max(12 + w / 2, Math.min(this.W - 12 - w / 2, x)), y: y + this.up, vx: 0, vy: this.reduce ? -6 : -14, s: this.small ? 14 : 17, rot: 0, vr: 0, col, age: 0, life: 4.2, sway: 0, w: 0, ph: 0, kind: 'text', tx: 0, ty: 0 })
  }

  /** 곡 끝: 맴돌던 것들이 한꺼번에 흩어진다 */
  finale() {
    const keep = this.ps.filter((p) => p.kind === 'keep')
    this.ps = this.ps.filter((p) => p.kind !== 'keep')
    for (const p of keep) this.pop(p, 7)
  }
  clear() { this.ps = []; this.x.clearRect(0, 0, this.W, this.H) }

  private pop(p: P, n: number) {
    if (this.reduce) return
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, v = 70 + Math.random() * 70
      this.ps.push({ ...p, wd: undefined, k: p.wd ? 'spark' : p.k, s: Math.min(14, Math.max(4, p.s * 0.42)), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, vr: (Math.random() - 0.5) * 6, age: 0, life: 0.8 + Math.random() * 0.3, sway: 0, kind: 'bit' })
    }
  }

  /** 화면 좌표로 누른 자리에 모양이 있으면 터뜨린다 */
  hit(cx: number, cy: number): boolean {
    if (!this.ps.length) return false
    const r = this.cv.getBoundingClientRect(), px = cx - r.left, py = cy - r.top
    if (px < -20 || py < -20 || px > r.width + 20 || py > r.height + 20) return false
    let best = -1, bd = 1e9
    this.ps.forEach((p, i) => {
      if (p.kind === 'bit' || p.kind === 'text') return
      const d = Math.hypot(p.x - px, p.y - py), reach = Math.max(22, p.s * 0.9) // 손가락 크기만큼 넉넉히
      if (d < reach && d < bd) { bd = d; best = i }
    })
    if (best < 0) return false
    const [p] = this.ps.splice(best, 1)
    this.pop(p, 8)
    return true
  }

  step(dt: number) {
    const x = this.x, W = this.W, H = this.H
    x.clearRect(0, 0, W, H)
    const keepers = this.ps.reduce((a, p) => a + (p.kind === 'keep' ? 1 : 0), 0)
    const next: P[] = []
    for (const p of this.ps) {
      p.age += dt
      if (p.kind === 'fly') {
        if (!p.rise) { p.vy *= Math.exp(-dt * 0.6); p.vy -= 6 * dt } // 머무는 것만 천천히 둥실, 나머지는 같은 빠르기로 쭉
        p.vx *= Math.exp(-dt * 1.2)
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
        if (p.age >= p.life) {
          // 몇 개는 그림 바로 위에 남아 맴돈다(곡 끝에 흩어질 것들)
          if (!p.rise && !this.reduce && keepers + next.filter((q) => q.kind === 'keep').length < (this.small ? 8 : 12)) {
            next.push({ ...p, kind: 'keep', age: 0, life: 1e9, s: Math.max(8, p.s * 0.6), tx: 14 + Math.random() * (W - 28), ty: this.up - (this.small ? 8 + Math.random() * 14 : 10 + Math.random() * 30) })
          }
          continue
        }
      } else if (p.kind === 'text') {
        p.y += p.vy * dt
        if (p.age >= p.life) continue
      } else if (p.kind === 'keep') {
        p.x += (p.tx - p.x) * Math.min(1, dt * 1.5); p.y += (p.ty - p.y) * Math.min(1, dt * 1.5); p.rot *= Math.exp(-dt)
      } else {
        p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
        if (p.age >= p.life) continue
      }
      next.push(p)
      const t = p.age / p.life
      let a = p.kind === 'keep' ? Math.min(0.5, p.age * 1.5) : p.rise ? 0.8 * (t < 0.08 ? t / 0.08 : t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1) : t < 0.12 ? t / 0.12 : t > 0.6 ? Math.max(0, (1 - t) / 0.4) : 1
      if (p.kind === 'bit') a = 1 - t
      if (p.kind === 'text') {
        const ta = t < 0.2 ? t / 0.2 : t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1
        x.save(); x.globalAlpha = ta * 0.85
        const [r, g, b] = p.col
        x.font = `800 ${p.s}px 'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`
        x.textAlign = 'center'; x.textBaseline = 'middle'
        x.shadowColor = `rgba(${r},${g},${b},.7)`; x.shadowBlur = 12
        x.fillStyle = `rgb(${r},${g},${b})`; x.fillText(p.t!, p.x, p.y)
        x.restore()
        continue
      }
      const sx = p.kind === 'keep' ? Math.sin(p.ph + p.age * 1.2) * 3 : Math.sin(p.ph + p.age * p.w) * p.sway * Math.min(1, p.age * 3)
      const sy = p.kind === 'keep' ? Math.cos(p.ph + p.age * 0.9) * 2 : 0
      const grow = p.kind === 'fly' ? 0.5 + 0.5 * Math.min(1, p.age / 0.18) : 1
      const [r, g, b] = p.col
      if (p.wd) {
        // 낱말: 또렷하게 읽히도록 채운 글자로(13px보다 작게 그리지 않는다)
        x.save(); x.globalAlpha = a
        x.translate(p.x + sx, p.y + sy); x.rotate(p.rot)
        x.font = `500 ${Math.max(13, Math.round(p.s * grow * 0.7))}px 'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`
        x.textAlign = 'center'; x.textBaseline = 'middle'
        x.fillStyle = `rgb(${r},${g},${b})`; x.fillText(p.wd, 0, 0)
        x.restore()
        continue
      }
      x.save()
      x.globalAlpha = a
      x.translate(p.x + sx, p.y + sy); x.rotate(p.rot); x.scale((p.s * grow) / 24, (p.s * grow) / 24); x.translate(-12, -12)
      // 선으로만 그린다(안은 비운다). 크기와 상관없이 같은 굵기로 보이게 배율만큼 나눈다
      x.strokeStyle = `rgb(${r},${g},${b})`
      x.lineWidth = (p.kind === 'bit' ? 1 : 1.2) * 24 / (p.s * grow)
      x.lineJoin = 'round'; x.lineCap = 'round'
      if (p.kind === 'fly') { x.shadowColor = `rgba(${r},${g},${b},.5)`; x.shadowBlur = 3 }
      x.stroke(pathOf(p.k))
      x.restore()
    }
    this.ps = next
    // 맴도는 것만 남았으면 쉬어도 된다(배터리)
    return this.ps.some((p) => p.kind !== 'keep')
  }
}
