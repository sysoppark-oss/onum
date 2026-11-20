// 교회 카드: 교회 이름·주소·연락처를 앱에 넣어 성도들에게 나눈다.
// 서버가 없으므로 카드에 디지털 서명을 붙인다. 서명 열쇠는 처음 만든 분의 비밀번호에서 그때그때 만들어 쓰고
// 어디에도 저장하지 않는다. 같은 열쇠로 서명한 카드만 「고친 카드」로 받아들인다.
import { useSyncExternalStore } from 'react'
import { ed25519 } from '@noble/curves/ed25519.js'
import { load, save } from './store'

export interface Church {
  id: string // 카드 번호(무작위, 열쇠 만들 때 소금으로도 쓴다)
  name: string
  addr: string
  tel: string
  ts: number // 고친 때(초)
  pub: string // 서명 확인 열쇠
  sig: string
}

export const WEB = 'https://sysoppark-oss.github.io/onum/'
export const LIMIT = { name: 24, addr: 60, tel: 20 }

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const enc = new TextEncoder()
const body = (c: Omit<Church, 'sig'>) => enc.encode(JSON.stringify([1, c.id, c.name, c.addr, c.tel, c.ts, c.pub]))

/** 비밀번호 → 서명 열쇠(PBKDF2 20만 번). 같은 비밀번호·같은 카드 번호면 늘 같은 열쇠 */
async function keyFrom(pw: string, id: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('onum-church:' + id), iterations: 200000 }, base, 256)
  return new Uint8Array(bits)
}

export function verify(c: Church): boolean {
  try { return ed25519.verify(unb64(c.sig), body(c), unb64(c.pub)) } catch { return false }
}

/** 새로 만들기 */
export async function create(v: { name: string; addr: string; tel: string }, pw: string): Promise<Church> {
  const id = b64(crypto.getRandomValues(new Uint8Array(9)))
  const sk = await keyFrom(pw, id)
  const c = { id, ...clean(v), ts: Math.floor(Date.now() / 1000), pub: b64(ed25519.getPublicKey(sk)) }
  return { ...c, sig: b64(ed25519.sign(body(c), sk)) }
}

/** 고치기: 비밀번호가 맞을 때만 (틀리면 null) */
export async function unlock(c: Church, pw: string): Promise<Uint8Array | null> {
  const sk = await keyFrom(pw, c.id)
  return b64(ed25519.getPublicKey(sk)) === c.pub ? sk : null
}
export function edit(c: Church, v: { name: string; addr: string; tel: string }, sk: Uint8Array): Church {
  const n = { id: c.id, ...clean(v), ts: Math.max(c.ts + 1, Math.floor(Date.now() / 1000)), pub: c.pub }
  return { ...n, sig: b64(ed25519.sign(body(n), sk)) }
}

const clean = (v: { name: string; addr: string; tel: string }) => ({
  name: v.name.trim().replace(/\s+/g, ' ').slice(0, LIMIT.name),
  addr: v.addr.trim().replace(/\s+/g, ' ').slice(0, LIMIT.addr),
  tel: v.tel.replace(/[^\d+\-() ]/g, '').trim().slice(0, LIMIT.tel),
})

/** 확인 번호: 같은 교회 카드인지 눈으로 견줄 수 있게 열쇠에서 8자리 */
export function code(c: Church): string {
  const u = unb64(c.pub)
  const n = ((u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3]) >>> 0
  const s = String(n % 100000000).padStart(8, '0')
  return s.slice(0, 4) + '-' + s.slice(4)
}

// 링크: 카드는 # 뒤에 실어 서버(GitHub)로도 보내지지 않는다
const pack = (c: Church) => b64(enc.encode(JSON.stringify([1, c.id, c.name, c.addr, c.tel, c.ts, c.pub, c.sig])))
export const link = (c: Church) => WEB + '#c=' + pack(c)
export const appLink = (c: Church) => 'onum://c/' + pack(c)

export function fromLink(url: string): Church | null {
  const m = url.match(/[#/]c[=/]([A-Za-z0-9_-]{40,})/)
  if (!m) return null
  try {
    const a = JSON.parse(new TextDecoder().decode(unb64(m[1])))
    if (!Array.isArray(a) || a[0] !== 1) return null
    const c: Church = { id: a[1], name: a[2], addr: a[3], tel: a[4], ts: a[5], pub: a[6], sig: a[7] }
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

/** 휴대폰 번호 꼴로 보기 좋게 */
export function telText(t: string): string {
  const d = t.replace(/\D/g, '')
  if (/^02\d{7,8}$/.test(d)) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3')
  if (/^0\d{9,10}$/.test(d)) return d.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3')
  if (/^1\d{7}$/.test(d)) return d.replace(/^(\d{4})(\d{4})$/, '$1-$2')
  return t
}
