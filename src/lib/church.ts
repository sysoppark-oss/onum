// 카드: 교회 이름(「생명샘교회에서 드리는 온음」)이나 선물·축하의 말(「주빛에게 보내는 선물」)을 앱에 넣어 나눈다.
// 서버가 없으므로 카드에 디지털 서명을 붙인다. 서명 열쇠는 처음 만든 분의 비밀번호에서 그때그때 만들어 쓰고
// 어디에도 저장하지 않는다. 같은 열쇠로 서명한 카드만 「고친 카드」로 받아들인다.
import { useSyncExternalStore } from 'react'
import { ed25519 } from '@noble/curves/ed25519.js'
import { load, save } from './store'

export type Kind = 'church' | 'gift' | 'couple'
export interface Church {
  v?: 2 // 없으면 처음 판(교회 이름·주소·전화)
  id: string // 카드 번호(무작위, 열쇠 만들 때 소금으로도 쓴다)
  kind?: Kind // 교회 카드 / 선물·축하 카드
  name: string // 크게 보일 이름
  line?: string // 이어지는 말: 「에서 드리는 온음」「에게 보내는 선물」…
  q?: string // 교회: 네이버 검색어 · 커플: 짝의 이름
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
/** 커플 카드의 짝 이름 */
export const partnerOf = (c: Church) => (kindOf(c) === 'couple' ? c.q ?? '' : '')
export const LIMIT = { name: 16, line: 20, q: 30 }

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const enc = new TextEncoder()
const body = (c: Omit<Church, 'sig'>) => enc.encode(JSON.stringify(c.v === 2
  ? [2, c.id, c.kind, c.name, c.line, c.q, c.ts, c.pub]
  : [1, c.id, c.name, c.addr ?? '', c.tel ?? '', c.ts, c.pub]))

/** 비밀번호 → 서명 열쇠(PBKDF2 20만 번). 같은 비밀번호·같은 카드 번호면 늘 같은 열쇠 */
async function keyFrom(pw: string, id: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('onum-church:' + id), iterations: 200000 }, base, 256)
  return new Uint8Array(bits)
}

export function verify(c: Church): boolean {
  if ([c.name, c.line, c.q, c.addr].some((x) => x && bad(x))) return false
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

export interface CardInput { kind: Kind; name: string; line: string; q: string }
const clean = (v: CardInput) => ({
  kind: v.kind,
  name: v.name.trim().replace(/\s+/g, ' ').slice(0, LIMIT.name),
  line: v.line.replace(/\s+/g, ' ').trimEnd().slice(0, LIMIT.line),
  q: v.kind === 'gift' ? '' : v.q.trim().replace(/\s+/g, ' ').slice(0, v.kind === 'couple' ? LIMIT.name : LIMIT.q),
})

/** 새로 만들기 */
export async function create(v: CardInput, pw: string): Promise<Church> {
  const id = b64(crypto.getRandomValues(new Uint8Array(9)))
  const sk = await keyFrom(pw, id)
  const c = { v: 2 as const, id, ...clean(v), ts: Math.floor(Date.now() / 1000), pub: b64(ed25519.getPublicKey(sk)) }
  return { ...c, sig: b64(ed25519.sign(body(c), sk)) }
}

/** 고치기: 비밀번호가 맞을 때만 (틀리면 null) */
export async function unlock(c: Church, pw: string): Promise<Uint8Array | null> {
  const sk = await keyFrom(pw, c.id)
  return b64(ed25519.getPublicKey(sk)) === c.pub ? sk : null
}
export function edit(c: Church, v: CardInput, sk: Uint8Array): Church {
  const n = { v: 2 as const, id: c.id, ...clean(v), ts: Math.max(c.ts + 1, Math.floor(Date.now() / 1000)), pub: c.pub }
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
const pack = (c: Church) => b64(enc.encode(JSON.stringify(c.v === 2
  ? [2, c.id, c.kind, c.name, c.line, c.q, c.ts, c.pub, c.sig]
  : [1, c.id, c.name, c.addr ?? '', c.tel ?? '', c.ts, c.pub, c.sig])))
export const link = (c: Church) => WEB + '#c=' + pack(c)
export const appLink = (c: Church) => 'onum://c/' + pack(c)

export function fromLink(url: string): Church | null {
  const m = url.match(/[#/]c[=/]([A-Za-z0-9_-]{40,})/)
  if (!m) return null
  try {
    const a = JSON.parse(new TextDecoder().decode(unb64(m[1])))
    if (!Array.isArray(a)) return null
    const c: Church | null = a[0] === 2
      ? { v: 2, id: a[1], kind: a[2] === 'gift' || a[2] === 'couple' ? a[2] : 'church', name: a[3], line: String(a[4] ?? ''), q: String(a[5] ?? ''), ts: a[6], pub: a[7], sig: a[8] }
      : a[0] === 1 ? { id: a[1], name: a[2], addr: a[3], tel: a[4], ts: a[5], pub: a[6], sig: a[7] } : null
    if (!c) return null
    if (typeof c.name !== 'string' || !c.name || !verify(c)) return null
    return c
  } catch { return null }
}

// 저장·구독
let cur: Church | null = (() => { const c = load<Church | null>('church', null); return c && verify(c) ? c : null })()
let incoming: Church | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useChurch = () => useSyncExternalStore(sub, () => cur)
export const useIncoming = () => useSyncExternalStore(sub, () => incoming)
export const getChurch = () => cur

export function setChurch(c: Church | null) { cur = c; save('church', c); emit() }

/** 링크로 받은 카드: 같은 교회가 고친 것이면 조용히 바꾸고, 처음이거나 다른 교회면 물어본다 */
export function receive(c: Church): 'same' | 'updated' | 'ask' {
  if (cur && cur.pub === c.pub && cur.id === c.id) {
    if (c.ts <= cur.ts) return 'same'
    setChurch(c)
    return 'updated'
  }
  incoming = c
  emit()
  return 'ask'
}
export function answer(keep: boolean) {
  if (keep && incoming) setChurch(incoming)
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
