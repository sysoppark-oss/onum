// 콘솔 그림 위로 떠오르는 모양들. 소리가 갑자기 커지는 순간(박자·강세)에 그 자리에서 솟는다.
//  · 세기 → 크기, 곡 빠르기 → 떠오르는 속도, 고음 → 살랑살랑 흔들림, 저음 → 묵직하게 솟음
//  · 몇 개는 그림 바로 위에 남아 맴돌다가, 곡이 끝나는 순간 한꺼번에 흩어진다
//  · 누르면 톡 터진다(재생에는 영향 없음)
import { PATH, shapeFor, type Glyph } from '../lib/glyph'

type RGB = [number, number, number]
export interface Burst { x: number; y: number; col: RGB; power: number; side: number; bright: number; tempo: number }
interface P {
  k: string; x: number; y: number; vx: number; vy: number; s: number; rot: number; vr: number; col: RGB
  age: number; life: number; sway: number; w: number; ph: number; kind: 'fly' | 'keep' | 'bit'; tx: number; ty: number
}
const paths = new Map<string, Path2D>()
const pathOf = (k: string) => { let p = paths.get(k); if (!p) { p = new Path2D(PATH[k]); paths.set(k, p) } return p }

export class Floaters {
  private x: CanvasRenderingContext2D
  private W = 0
  private H = 0
  private ps: P[] = []
  private n = 0
  readonly reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  private cv: HTMLCanvasElement
  readonly up: number
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
    const flying = this.ps.reduce((a, p) => a + (p.kind === 'fly' ? 1 : 0), 0)
    if (flying >= (this.small ? 12 : 22)) return
    const count = !this.reduce && b.power > 0.75 ? 2 : 1
    for (let c = 0; c < count; c++) {
      const heavy = 1 - b.bright
      const base = this.small ? 9 : 13
      const s = base + b.power * (this.small ? 9 : 15) + heavy * 3 + Math.random() * 2
      const t = b.tempo
      this.ps.push({
        k: shapeFor(g, this.n++), x: b.x + (Math.random() - 0.5) * 8, y: b.y + this.up, s, col: b.col,
        vx: b.side * 30 + (Math.random() - 0.5) * 24, vy: -(50 + 70 * b.power + 60 * heavy) * t,
        rot: (Math.random() - 0.5) * 0.5, vr: this.reduce ? 0 : (Math.random() - 0.5) * (0.6 + b.bright * 2.4),
        age: 0, life: (1.5 + Math.random() * 0.7) / Math.sqrt(t), sway: this.reduce ? 0 : 3 + b.bright * 14,
        w: 2.5 + b.bright * 5, ph: Math.random() * 6.28, kind: 'fly', tx: 0, ty: 0,
      })
    }
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
      this.ps.push({ ...p, s: Math.max(4, p.s * 0.42), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, vr: (Math.random() - 0.5) * 6, age: 0, life: 0.8 + Math.random() * 0.3, sway: 0, kind: 'bit' })
    }
  }

  /** 화면 좌표로 누른 자리에 모양이 있으면 터뜨린다 */
  hit(cx: number, cy: number): boolean {
    if (!this.ps.length) return false
    const r = this.cv.getBoundingClientRect(), px = cx - r.left, py = cy - r.top
    if (px < -20 || py < -20 || px > r.width + 20 || py > r.height + 20) return false
    let best = -1, bd = 1e9
    this.ps.forEach((p, i) => {
      if (p.kind === 'bit') return
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
        p.vy *= Math.exp(-dt * 0.9); p.vy -= 18 * dt // 처음엔 세게, 차츰 둥실
        p.vx *= Math.exp(-dt * 1.5)
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
        if (p.age >= p.life) {
          // 몇 개는 그림 바로 위에 남아 맴돈다(곡 끝에 흩어질 것들)
          if (!this.reduce && keepers + next.filter((q) => q.kind === 'keep').length < (this.small ? 8 : 12) && Math.random() < 0.3) {
            next.push({ ...p, kind: 'keep', age: 0, life: 1e9, s: Math.max(8, p.s * 0.6), tx: 14 + Math.random() * (W - 28), ty: this.up - (this.small ? 8 + Math.random() * 14 : 10 + Math.random() * 30) })
          }
          continue
        }
      } else if (p.kind === 'keep') {
        p.x += (p.tx - p.x) * Math.min(1, dt * 1.5); p.y += (p.ty - p.y) * Math.min(1, dt * 1.5); p.rot *= Math.exp(-dt)
      } else {
        p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
        if (p.age >= p.life) continue
      }
      next.push(p)
      const t = p.age / p.life
      let a = p.kind === 'keep' ? Math.min(0.5, p.age * 1.5) : t < 0.12 ? t / 0.12 : t > 0.6 ? Math.max(0, (1 - t) / 0.4) : 1
      if (p.kind === 'bit') a = 1 - t
      const sx = p.kind === 'keep' ? Math.sin(p.ph + p.age * 1.2) * 3 : Math.sin(p.ph + p.age * p.w) * p.sway * Math.min(1, p.age * 3)
      const sy = p.kind === 'keep' ? Math.cos(p.ph + p.age * 0.9) * 2 : 0
      const grow = p.kind === 'fly' ? 0.5 + 0.5 * Math.min(1, p.age / 0.18) : 1
      x.save()
      x.globalAlpha = a
      x.translate(p.x + sx, p.y + sy); x.rotate(p.rot); x.scale((p.s * grow) / 24, (p.s * grow) / 24); x.translate(-12, -12)
      const [r, g, b] = p.col
      x.fillStyle = `rgb(${r},${g},${b})`
      if (p.kind === 'fly') { x.shadowColor = `rgba(${r},${g},${b},.8)`; x.shadowBlur = 10 }
      x.fill(pathOf(p.k))
      x.restore()
    }
    this.ps = next
    // 맴도는 것만 남았으면 쉬어도 된다(배터리)
    return this.ps.some((p) => p.kind !== 'keep')
  }
}
