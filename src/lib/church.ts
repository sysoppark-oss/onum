// 카드: 교회 이름(「맑은물속교회에서 드리는 온음」)이나 선물·축하의 말(「주빛에게 보내는 선물」)을 앱에 넣어 나눈다.
// 서버가 없으므로 카드에 디지털 서명을 붙인다. 서명 열쇠는 처음 만든 분의 비밀번호에서 그때그때 만들어 쓰고
// 어디에도 저장하지 않는다. 같은 열쇠로 서명한 카드만 「고친 카드」로 받아들인다.
import { isGlyph, type Glyph } from './glyph'
import { useSyncExternalStore } from 'react'
import { ed25519 } from '@noble/curves/ed25519.js'
import { load, save } from './store'

export type Kind = 'church' | 'gift' | 'couple'
/** 명판 재질 */
export type Plate = 'steel' | 'brass' | 'gun' | 'wood'
export const PLATES: { id: Plate; name: string }[] = [{ id: 'steel', name: '은빛' }, { id: 'brass', name: '황동' }, { id: 'gun', name: '건메탈' }, { id: 'wood', name: '나무' }]
export const isPlate = (x: unknown): x is Plate => PLATES.some((p) => p.id === x)
/** 문구 틀: of = 「○○의 온음 플레이어」, only = 「오직 ○○을 위한 온음 플레이어」. 없으면 이름+이어지는 말을 그대로 */
export type Tpl = 'of' | 'only'
export const isTpl = (x: unknown): x is Tpl => x === 'of' || x === 'only'
export interface Church {
  v?: 2 | 3 // 없으면 처음 판(교회 이름·주소·전화). 3: 명판(문구 틀·보내는 분·날짜·재질)
  id: string // 카드 번호(무작위, 열쇠 만들 때 소금으로도 쓴다)
  kind?: Kind // 교회 카드 / 선물·축하 카드
  name: string // 크게 보일 이름
  line?: string // 이어지는 말: 「에서 드리는 온음」「에게 보내는 선물」…
  q?: string // 교회: 네이버 검색어 · 커플: 짝의 이름
  g?: Glyph // 받은 분 화면에도 떠오를 모양(서명 안에 든다)
  tpl?: Tpl // 문구 틀(있으면 name은 받는 분)
  from?: string // 보내는 분: 아랫줄 「○○ 드림」
  d?: string // 새긴 날 yyyymmdd
  plate?: Plate // 명판 재질
  addr?: string
  tel?: string
  ts: number // 고친 때(초)
  pub: string // 서명 확인 열쇠
  sig: string
}

export const WEB = 'https://sysoppark-oss.github.io/onum/'
export const CHURCH_LINE = '에서 드리는 온음'
export const kindOf = (c: Church): Kind => c.kind ?? 'church'
export const lineOf = (c: Church) => c.line ?? CHURCH_LINE
/** 교회 소개·주소·대표 연락처는 앱에 담지 않고 네이버 검색으로: 검색어가 바로 들어간 결과 화면 */
export const naverUrl = (c: Church) => 'https://m.search.naver.com/search.naver?where=m&sm=mtp_hty&query=' + encodeURIComponent((c.q || c.name).trim())
// 이어지는 말이 조사로 시작하면 이름에 붙이고, 아니면 한 칸 띄운다
const PARTICLE = /^((에서|에게|께서|께|의|은|는|을|를|와|과|가|로|으로|랑|이랑|하고|이와)(\s|$)|から|の|が|へ|に|と|より|'s\b|[,，、])/
export const joint = (line: string) => (!line || PARTICLE.test(line) ? '' : ' ')
/** 카드를 한 줄 글로: 「맑은물속교회에서 드리는 온음」「강빛 ♥ 주빛 함께 듣는 온음」 */
export const cardText = (c: Church) => (c.tpl === 'of' ? `${c.name}의 온음 플레이어` : c.tpl === 'only' ? `오직 ${c.name}${josa(c.name)} 위한 온음 플레이어`
  : kindOf(c) === 'couple' ? `${c.name} ♥ ${c.q ?? ''} ${lineOf(c)}` : c.name + joint(lineOf(c)) + lineOf(c)).trim()
/** 받침이 있으면 「을」, 없으면 「를」 */
export function josa(s: string): '을' | '를' {
  const ch = s.trim().slice(-1).charCodeAt(0)
  return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0 ? '을' : '를'
}
export const plateOf = (c: Pick<Church, 'plate'>): Plate => c.plate ?? 'steel'
/** 새긴 날을 보이는 글로: 2026. 11. 26. */
export const dateText = (d?: string) => (d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}. ${+d.slice(4, 6)}. ${+d.slice(6, 8)}.` : '')
/** 커플 카드의 짝 이름 */
export const partnerOf = (c: Church) => (kindOf(c) === 'couple' ? c.q ?? '' : '')
export const LIMIT = { name: 16, line: 20, q: 30, from: 14 }

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const enc = new TextEncoder()
const v3 = (c: Omit<Church, 'sig'>) => [3, c.id, c.kind, c.name, c.line, c.q, c.ts, c.pub, c.g ?? '', c.tpl ?? '', c.from ?? '', c.d ?? '', c.plate ?? '']
const body = (c: Omit<Church, 'sig'>) => enc.encode(JSON.stringify(c.v === 3 ? v3(c) : c.v === 2
  ? (c.g ? [2, c.id, c.kind, c.name, c.line, c.q, c.ts, c.pub, c.g] : [2, c.id, c.kind, c.name, c.line, c.q, c.ts, c.pub])
  : [1, c.id, c.name, c.addr ?? '', c.tel ?? '', c.ts, c.pub]))

/** 비밀번호 → 서명 열쇠(PBKDF2 20만 번). 같은 비밀번호·같은 카드 번호면 늘 같은 열쇠 */
async function keyFrom(pw: string, id: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('onum-church:' + id), iterations: 200000 }, base, 256)
  return new Uint8Array(bits)
}

export function verify(c: Church): boolean {
  if ([c.name, c.line, c.q, c.addr, c.from].some((x) => x && bad(x))) return false
  try { return ed25519.verify(unb64(c.sig), body(c), unb64(c.pub)) } catch { return false }
}

/** 이름·주소 칸에 다른 연락 통로를 숨기지 못하게: 인터넷 주소, 전자우편, 메신저, 전화번호 */
const LURE = [
  /https?:|www\.|\.(com|net|org|kr|me|io|ly|gl|link|site|app|xyz)\b/i,
  /@/,
  /open\.?kakao|카카오\s*톡|카톡|오픈\s*채팅|텔레그램|텔레\b|라인\s*아이디|line\s*id|telegram|whatsapp|위챗|wechat|디스코드|discord|밴드\s*주소/i,
  /(^|\D)0\d{1,2}[\s.\-)]*\d{3,4}[\s.\-]*\d{4}(\D|$)/,
  /(^|\D)(15|16|18)\d{2}[\s.\-]*\d{4}(\D|$)/,
]
export const bad = (s: string) => LURE.some((r) => r.test(s))

export interface CardInput { kind: Kind; name: string; line: string; q: string; g?: Glyph; tpl?: Tpl; from?: string; date?: boolean; plate?: Plate }
const today = () => { const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}` }
/** d0: 고칠 때는 처음 새긴 날을 그대로 둔다 */
const clean = (v: CardInput, d0?: string) => ({
  ...(v.kind === 'gift' && isTpl(v.tpl) ? { tpl: v.tpl } : {}),
  ...(v.kind === 'gift' && v.from?.trim() ? { from: v.from.trim().replace(/\s+/g, ' ').slice(0, LIMIT.from) } : {}),
  ...(v.kind === 'gift' && v.date ? { d: d0 || today() } : {}),
  plate: isPlate(v.plate) ? v.plate : 'steel' as Plate,
  kind: v.kind,
  name: v.name.trim().replace(/\s+/g, ' ').slice(0, LIMIT.name),
  line: v.line.replace(/\s+/g, ' ').trimEnd().slice(0, LIMIT.line),
  q: v.kind === 'gift' ? '' : v.q.trim().replace(/\s+/g, ' ').slice(0, v.kind === 'couple' ? LIMIT.name : LIMIT.q),
  ...(isGlyph(v.g) ? { g: v.g } : {}),
})

/** 새로 만들기 */
export async function create(v: CardInput, pw: string): Promise<Church> {
  const id = b64(crypto.getRandomValues(new Uint8Array(9)))
  const sk = await keyFrom(pw, id)
  const c = { v: 3 as const, id, ...clean(v), ts: Math.floor(Date.now() / 1000), pub: b64(ed25519.getPublicKey(sk)) }
  return { ...c, sig: b64(ed25519.sign(body(c), sk)) }
}

/** 고치기: 비밀번호가 맞을 때만 (틀리면 null) */
export async function unlock(c: Church, pw: string): Promise<Uint8Array | null> {
  const sk = await keyFrom(pw, c.id)
  return b64(ed25519.getPublicKey(sk)) === c.pub ? sk : null
}
export function edit(c: Church, v: CardInput, sk: Uint8Array): Church {
  const n = { v: 3 as const, id: c.id, ...clean(v, c.d), ts: Math.max(c.ts + 1, Math.floor(Date.now() / 1000)), pub: c.pub }
  return { ...n, sig: b64(ed25519.sign(body(n), sk)) }
}

/** 확인 번호: 같은 교회 카드인지 눈으로 견줄 수 있게 열쇠에서 8자리 */
export function code(c: Church): string {
  const u = unb64(c.pub)
  const n = ((u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3]) >>> 0
  const s = String(n % 100000000).padStart(8, '0')
  return s.slice(0, 4) + '-' + s.slice(4)
}

// 링크: 카드는 # 뒤에 실어 서버(GitHub)로도 보내지지 않는다
const pack = (c: Church) => b64(enc.encode(JSON.stringify(c.v === 3 ? [...v3(c), c.sig] : c.v === 2
  ? (c.g ? [2, c.id, c.kind, c.name, c.line, c.q, c.ts, c.pub, c.sig, c.g] : [2, c.id, c.kind, c.name, c.line, c.q, c.ts, c.pub, c.sig])
  : [1, c.id, c.name, c.addr ?? '', c.tel ?? '', c.ts, c.pub, c.sig])))
export const link = (c: Church) => WEB + '#c=' + pack(c)
export const appLink = (c: Church) => 'onum://c/' + pack(c)

export function fromLink(url: string): Church | null {
  const m = url.match(/[#/]c[=/]([A-Za-z0-9_-]{40,})/)
  if (!m) return null
  try {
    const a = JSON.parse(new TextDecoder().decode(unb64(m[1])))
    if (!Array.isArray(a)) return null
    const str = (x: unknown) => (typeof x === 'string' ? x : '')
    const c: Church | null = a[0] === 3
      ? { v: 3, id: a[1], kind: a[2] === 'gift' || a[2] === 'couple' ? a[2] : 'church', name: a[3], line: str(a[4]), q: str(a[5]), ts: a[6], pub: a[7], ...(isGlyph(a[8]) ? { g: a[8] } : {}),
          ...(isTpl(a[9]) ? { tpl: a[9] } : {}), ...(str(a[10]) ? { from: str(a[10]) } : {}), ...(/^\d{8}$/.test(str(a[11])) ? { d: str(a[11]) } : {}), ...(isPlate(a[12]) ? { plate: a[12] } : {}), sig: a[13] }
      : a[0] === 2
      ? { v: 2, id: a[1], kind: a[2] === 'gift' || a[2] === 'couple' ? a[2] : 'church', name: a[3], line: String(a[4] ?? ''), q: String(a[5] ?? ''), ts: a[6], pub: a[7], sig: a[8], ...(isGlyph(a[9]) ? { g: a[9] } : {}) }
      : a[0] === 1 ? { id: a[1], name: a[2], addr: a[3], tel: a[4], ts: a[5], pub: a[6], sig: a[7] } : null
    if (!c) return null
    if (typeof c.name !== 'string' || !c.name || !verify(c)) return null
    return c
  } catch { return null }
}

// 저장·구독: 카드는 여러 장을 모아 두고(받은 카드·보낸 카드), 그 가운데 하나를 「지금 쓰는 카드」로 쓴다.
// 다른 카드를 쓰거나 새로 만들어도 모아 둔 카드는 지우지 않는 한 남는다.
export interface Entry { c: Church; mine: boolean; at: number } // mine: 이 휴대폰에서 만들었거나 비밀번호로 연 카드(보낸 카드)
interface Store { list: Entry[]; on: string | null }
const keyOf = (c: Church) => c.id + ':' + c.pub
let st: Store = (() => {
  const s0 = load<Store | null>('cards', null)
  if (s0 && Array.isArray(s0.list)) return { list: s0.list.filter((e) => e?.c && verify(e.c)), on: s0.on }
  // 예전 판(카드 한 장)에서 옮겨 온다
  const old = load<Church | null>('church', null)
  return old && verify(old) ? { list: [{ c: old, mine: false, at: Date.now() }], on: keyOf(old) } : { list: [], on: null }
})()
let cur: Church | null = st.list.find((e) => keyOf(e.c) === st.on)?.c ?? null
let incoming: Church | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
const put = (n: Store) => { st = n; cur = n.list.find((e) => keyOf(e.c) === n.on)?.c ?? null; save('cards', n); save('church', cur); emit() }
export const useChurch = () => useSyncExternalStore(sub, () => cur)
export const useCards = () => useSyncExternalStore(sub, () => st)
export const useIncoming = () => useSyncExternalStore(sub, () => incoming)
export const getChurch = () => cur
/** 떠오르는 이름: 커플이면 두 이름 */
export const cardName = () => (cur ? (kindOf(cur) === 'couple' && cur.q ? `${cur.name} ♥ ${cur.q}` : cur.name) : '')
export const cardKey = keyOf

/** 카드를 모아 두기(같은 카드면 새것으로 바꾼다). use면 지금 쓰는 카드로 */
export function addCard(c: Church, mine: boolean, use: boolean) {
  const k = keyOf(c)
  const old = st.list.find((e) => keyOf(e.c) === k)
  const e: Entry = { c, mine: mine || !!old?.mine, at: old?.at ?? Date.now() }
  const list = old ? st.list.map((x) => (keyOf(x.c) === k ? e : x)) : [e, ...st.list]
  put({ list, on: use ? k : st.on })
}
/** 지금 쓰는 카드 바꾸기(null이면 카드 없이) */
export function pickCard(k: string | null) { put({ ...st, on: k }) }
/** 목록에서 빼기(쓰던 카드면 카드 없이) */
export function removeCard(k: string) { put({ list: st.list.filter((e) => keyOf(e.c) !== k), on: st.on === k ? null : st.on }) }
/** 비밀번호로 열었으면 「보낸 카드」로 옮긴다 */
export function markMine(k: string) { put({ ...st, list: st.list.map((e) => (keyOf(e.c) === k ? { ...e, mine: true } : e)) }) }

/** 링크로 받은 카드: 모아 둔 카드를 만든 분이 고친 것이면 조용히 바꾸고, 처음 보는 카드면 물어본다 */
export function receive(c: Church): 'same' | 'updated' | 'ask' {
  const old = st.list.find((e) => keyOf(e.c) === keyOf(c))
  if (old) {
    if (c.ts <= old.c.ts) return 'same'
    addCard(c, old.mine, false)
    return 'updated'
  }
  incoming = c
  emit()
  return 'ask'
}
/** 받은 카드에 대한 답: use = 모아 두고 지금 쓰기, keep = 모아 두기만, no = 넣지 않기 */
export function answer(how: 'use' | 'keep' | 'no') {
  if (how !== 'no' && incoming) addCard(incoming, false, how === 'use')
  incoming = null
  emit()
}
export function receiveUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const c = fromLink(url)
  if (!c) return false
  receive(c)
  return true
}
