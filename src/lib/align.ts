// 가사 자동 맞추기의 「짝짓기」: AI가 받아쓴 글(낱말마다 시각)과 붙여 넣은 가사를 글자 단위로 맞춰
// 줄마다 시작 시각을 찾는다. 받아쓰기가 좀 틀려도 시각만 빌려 오고 가사는 원문 그대로 쓴다.
// 띄어쓰기에 기대지 않고 글자로 맞추므로 한국어·일본어·영어 모두 된다.

export interface Tok { s: string; t: number }

const keep = /[\p{L}\p{N}]/u
const chars = (s: string) => Array.from(s.normalize('NFC').toLowerCase()).filter((c) => keep.test(c))

/** 줄마다 시작 시각(초). 빈 줄·찾지 못한 줄은 앞뒤 줄로 미루어 채우고, 빈 줄은 null */
export function alignLines(lines: string[], toks: Tok[], duration: number): { t: (number | null)[]; e: (number | null)[] } {
  // 가사 글자: 어느 줄의 몇 번째 글자인지
  const L: { c: string; line: number }[] = []
  lines.forEach((ln, i) => chars(ln).forEach((c) => L.push({ c, line: i })))
  // 받아쓴 글자: 낱말 시각을 그 낱말 글자들에 고르게 나눠 준다
  const A: { c: string; t: number }[] = []
  toks.forEach((k, i) => {
    const cs = chars(k.s)
    if (!cs.length) return
    const next = toks.slice(i + 1).find((x) => chars(x.s).length)?.t ?? k.t + 0.6
    const span = Math.min(Math.max(next - k.t, 0), 1.2)
    cs.forEach((c, j) => A.push({ c, t: k.t + (span * j) / cs.length }))
  })
  const n = L.length, m = A.length
  const out: (number | null)[] = lines.map(() => null)
  const ends: (number | null)[] = lines.map(() => null)
  if (!n || !m) return { t: fill(lines, out, duration), e: ends }

  // 짝짓기(가사 앞뒤의 받아쓰기 군더더기는 공짜로 건너뜀)
  const MATCH = 3, MIS = -2, GAP_L = -2, GAP_A = -1
  const W = m + 1
  const score = new Int32Array((n + 1) * W)
  const back = new Uint8Array((n + 1) * W) // 1 대각, 2 위(가사 글자 빠짐), 3 왼쪽(받아쓰기 글자 건너뜀)
  for (let i = 1; i <= n; i++) { score[i * W] = score[(i - 1) * W] + GAP_L; back[i * W] = 2 }
  for (let i = 1; i <= n; i++) {
    const li = L[i - 1].c
    for (let j = 1; j <= m; j++) {
      const d = score[(i - 1) * W + j - 1] + (li === A[j - 1].c ? MATCH : MIS)
      const u = score[(i - 1) * W + j] + GAP_L
      const l = score[i * W + j - 1] + (i === n ? 0 : GAP_A)
      let best = d, b = 1
      if (u > best) { best = u; b = 2 }
      if (l > best) { best = l; b = 3 }
      score[i * W + j] = best
      back[i * W + j] = b
    }
  }
  // 되짚기
  const hit: { line: number; t: number }[] = []
  let i = n, j = m
  while (i > 0 && j > 0) {
    const b = back[i * W + j]
    if (b === 1) { if (L[i - 1].c === A[j - 1].c) hit.push({ line: L[i - 1].line, t: A[j - 1].t }); i--; j-- }
    else if (b === 2) i--
    else j--
  }
  hit.reverse()
  // 줄마다: 맞은 글자가 넉넉하면 맞은 글자들의 시작 쪽 시각
  const per = new Map<number, number[]>()
  for (const h of hit) { const a = per.get(h.line); if (a) a.push(h.t); else per.set(h.line, [h.t]) }
  lines.forEach((ln, k) => {
    const total = chars(ln).length
    const ts = per.get(k)
    if (!total || !ts || ts.length < Math.max(2, total * 0.3)) return
    // 첫 글자 시각. 다만 첫 글자만 멀리 떨어져 붙었으면(잘못 짝지어짐) 둘째 글자
    out[k] = ts.length > 1 && ts[1] - ts[0] > 1.5 ? ts[1] : ts[0]
    // 끝: 맞은 글자 가운데 마지막 쪽(받아쓰기 군더더기 하나에 끌려가지 않게 뒤에서 두 번째)
    const tail = ts.slice(-2).sort((a, b) => a - b)
    ends[k] = tail[0] + 0.5
  })
  // 거꾸로 가는 시각은 버린다
  let last = -1
  out.forEach((v, k) => { if (v == null) return; if (v <= last) { out[k] = null; ends[k] = null } else last = v })
  // 못 찾은 줄은 「노래가 들리는 시간」 안에서만 나눠 채운다 — 간주에 가사가 걸리지 않게
  const clk = voiceClock(toks.filter((k) => chars(k.s).length).map((k) => k.t))
  const filled = fill(lines, out.map((x) => (x == null ? null : clk.to(x))), clk.to(duration)).map((x) => (x == null ? null : clk.from(x)))
  return { t: filled, e: ends.map((v, k) => (v != null && out[k] != null && v > out[k]! ? v : null)) }
}

/** 받아쓴 낱말 사이가 1.2초보다 길면(간주·전주) 그만큼 접은 시계: to(실제→목소리 시각), from(거꾸로) */
function voiceClock(times: number[]) {
  const w = [0], v = [0]
  for (const x of [...times].sort((a, b) => a - b)) {
    const pw = w[w.length - 1]
    if (x <= pw) continue
    w.push(x); v.push(v[v.length - 1] + Math.min(x - pw, 1.2))
  }
  const map = (a: number[], b: number[], x: number) => {
    if (a.length < 2) return x
    if (x >= a[a.length - 1]) return b[b.length - 1] + (x - a[a.length - 1])
    let i = 1
    while (a[i] < x) i++
    const f = a[i] === a[i - 1] ? 0 : (x - a[i - 1]) / (a[i] - a[i - 1])
    return b[i - 1] + f * (b[i] - b[i - 1])
  }
  return { to: (x: number) => map(w, v, Math.max(0, x)), from: (y: number) => map(v, w, Math.max(0, y)) }
}

/** 찾지 못한 줄은 앞뒤 찾은 줄 사이를 글자 수 비율로 나눠 채운다 */
function fill(lines: string[], t: (number | null)[], duration: number): (number | null)[] {
  const len = lines.map((l) => chars(l).length)
  const idx = lines.map((_, i) => (len[i] ? i : -1)).filter((i) => i >= 0)
  const known = idx.filter((i) => t[i] != null)
  if (!known.length) return t.map(() => null)
  const res = [...t]
  const rate = (a: number, b: number) => {
    const ca = idx.slice(idx.indexOf(a), idx.indexOf(b)).reduce((s, i) => s + len[i], 0)
    return ca ? (t[b]! - t[a]!) / ca : 0.3
  }
  // 첫 찾은 줄 앞
  const k0 = known[0]
  const r0 = known.length > 1 ? rate(k0, known[1]) : 0.3
  let acc = t[k0]!
  for (let p = idx.indexOf(k0) - 1; p >= 0; p--) { acc -= len[idx[p]] * r0; res[idx[p]] = Math.max(0, acc) }
  // 사이
  for (let q = 0; q + 1 < known.length; q++) {
    const a = known[q], b = known[q + 1], r = rate(a, b)
    let x = t[a]!
    for (let p = idx.indexOf(a) + 1; p < idx.indexOf(b); p++) { x += len[idx[p - 1]] * r; res[idx[p]] = x }
  }
  // 마지막 찾은 줄 뒤
  const kz = known[known.length - 1]
  const rz = known.length > 1 ? rate(known[known.length - 2], kz) : 0.3
  let z = t[kz]!
  for (let p = idx.indexOf(kz) + 1; p < idx.length; p++) { z += len[idx[p - 1]] * rz; res[idx[p]] = duration > 0 ? Math.min(z, duration - 1) : z }
  return lines.map((_, i) => (len[i] ? res[i] : null))
}

/** 가사 글로 받아쓰기 언어를 고른다 */
export function guessLang(text: string): 'ko' | 'ja' | 'en' {
  const s = text.slice(0, 2000)
  const ko = (s.match(/[가-힣]/g) ?? []).length
  const ja = (s.match(/[぀-ヿ]/g) ?? []).length
  if (ko >= ja && ko > 5) return 'ko'
  if (ja > 5) return 'ja'
  return 'en'
}
