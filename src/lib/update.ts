import { useSyncExternalStore } from 'react'
// 새 판 알림과 화면 부분 자동 업데이트(설치형 앱만).
// GitHub의 시험판 안내(릴리스)에 적힌 지문을 보고:
//  · 안드로이드 쪽이 그대로면 화면 부분(web.zip)만 받아 두었다가, 음악이 멈춰 있을 때 바꿔 끼운다.
//  · 안드로이드 쪽이 바뀌었으면 「새 판이 나왔어요」를 띄우고, 누르면 APK를 받아 설치 화면을 연다.
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { isNative } from './native'
import { load, save } from './store'
import { STORE, TEST_APK_URL } from './channel'

const API = 'https://api.github.com/repos/sysoppark-oss/onum/releases/tags/test-build'
export const BUILD = {
  sha: (import.meta.env.VITE_SHA as string | undefined) ?? 'dev',
  native: (import.meta.env.VITE_NATIVE as string | undefined) ?? '',
  run: Number(import.meta.env.VITE_RUN ?? 0),
}
export interface Remote { sha: string; native: string; run: number; at: string; dl?: number; sum?: string; sig?: string; apk?: string; web?: string }
const EVERY = 6 * 3600 * 1000

/* 업데이트 안내의 서명 확인.
   안내(판 번호·화면 꾸러미 지문)는 앱을 만들 때 시험판 서명 열쇠로 서명하고, 앱에는 그 공개 키만 들어 있다.
   그래서 GitHub의 안내나 꾸러미를 누가 바꿔 놓아도, 열쇠가 없으면 앱이 받아 들이지 않는다.
   서명하는 글은 .github/workflows/android.yml의 것과 글자 하나까지 같아야 한다. */
const PUB = (import.meta.env.VITE_UPD_PUB as string | undefined) ?? ''
const raw = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export async function signed(r: Remote, pub = PUB): Promise<boolean> {
  if (!pub || !r.sig || !r.sum) return false
  try {
    const key = await crypto.subtle.importKey('spki', raw(pub), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const msg = new TextEncoder().encode(`onum-update-v1\n${r.sha}\n${r.native}\n${r.run}\n${r.sum}`)
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, raw(r.sig), msg)
  } catch { return false }
}

/** 지금 판에 문제가 없다고 알린다(안 하면 업데이트 꾸러미가 되돌려진다) */
export function appReady() { if (isNative) CapacitorUpdater.notifyAppReady().catch(() => {}) }

export async function fetchRemote(): Promise<Remote | null> {
  const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) return null
  const j = await r.json() as { body?: string; assets?: { name: string; browser_download_url: string; download_count: number }[] }
  const m = /<!--onum (\{.*?\})-->/s.exec(j.body ?? '')
  if (!m) return null
  const info = JSON.parse(m[1]) as Remote
  const asset = (n: string) => j.assets?.find((a) => a.name === n)?.browser_download_url
  // 내려받은 횟수: 지난 판들까지 모아 둔 수(dl) + 지금 판 APK를 받은 수
  const now = j.assets?.find((a) => a.name === 'onum-test.apk')?.download_count ?? 0
  save('dlCount', (info.dl ?? 0) + now)
  // 새 APK 주소는 안내에 적힌 것이 아니라 앱에 박아 둔 공식 주소만 쓴다(설치할 때는 안드로이드가 서명을 확인한다)
  return { ...info, apk: TEST_APK_URL, web: asset('web.zip') }
}

// 새 판 소식: 설정 탭에 표시를 띄우려고 앱 어디서나 본다. web = 받아 두어 바로 바꿀 수 있음, apk = 새로 설치할 판
type Upd = 'none' | 'web' | 'apk'
// 개발 서버에서 ?upd=web / ?upd=apk 로 화면을 시험한다
let upd: Upd = import.meta.env.DEV && typeof location !== 'undefined' ? ((new URLSearchParams(location.search).get('upd') as Upd | null) ?? 'none') : 'none'
const updSubs = new Set<() => void>()
const setUpd = (u: Upd) => { if (u !== upd) { upd = u; updSubs.forEach((f) => f()) } }
export const useUpd = () => useSyncExternalStore((f) => { updSubs.add(f); return () => { updSubs.delete(f) } }, () => upd)

/** 하루 몇 번만 본다. 돌려주는 값: 'apk'면 새로 설치할 판, 'web'이면 받아 둔 판, 없으면 null */
export type Check = { kind: 'apk' | 'web' | 'same'; r: Remote; err?: string }
export async function checkUpdate(force = false): Promise<Check | null> {
  const c = await checkUpdate0(force)
  if (c) setUpd(c.kind === 'same' ? 'none' : c.kind === 'web' ? (hasPending() ? 'web' : 'none') : 'apk')
  return c
}
async function checkUpdate0(force: boolean): Promise<Check | null> {
  if (!isNative || STORE || BUILD.sha === 'dev') return null // 스토어 판은 스토어가 업데이트한다
  const last = load<number>('updAt', 0)
  if (!force && Date.now() - last < EVERY) return null
  save('updAt', Date.now())
  const r = await fetchRemote().catch(() => null)
  if (!r || r.sha === BUILD.sha) return r ? { kind: 'same', r } : null
  // 지금 판보다 오래된 판으로는 돌아가지 않는다(서명된 옛 안내를 다시 올려 낮추는 것을 막는다)
  if (typeof r.run !== 'number' || r.run < BUILD.run) return null
  // 서명이 맞지 않으면 화면 꾸러미는 받지 않고, 공식 주소의 새 판(APK) 안내만 한다
  if (!await signed(r)) return { kind: 'apk', r, err: 'unsigned' }
  if (r.native === BUILD.native && r.web && r.sum && /^https:\/\/github\.com\/sysoppark-oss\/onum\/releases\/download\//.test(r.web)) {
    // 받아 둔 판이 실제로 남아 있을 때만 그대로 쓴다(새 APK를 깔면 받아 둔 판은 지워진다)
    if (load<string>('pendingSha', '') === r.sha && await bundleLeft(load<string>('pendingId', ''))) return { kind: 'web', r }
    try {
      // 꾸러미 지문(SHA-256)이 맞아야만 받아 들인다
      const b = await CapacitorUpdater.download({ url: r.web, version: r.sha, checksum: r.sum })
      save('pendingId', b.id)
      save('pendingSha', r.sha)
      return { kind: 'web', r }
    } catch (e) {
      // 화면 부분을 못 받으면 새 판(APK)으로 안내해 길이 막히지 않게 한다
      return { kind: 'apk', r, err: e instanceof Error ? e.message : String(e) }
    }
  }
  return { kind: 'apk', r }
}

/** 받아 둔 화면 판이 있으면 바꿔 끼운다(앱이 다시 그려진다). 음악이 나오는 중에는 부르지 않는다 */
export function hasPending(): boolean { return isNative && !STORE && !!load<string>('pendingId', '') && load<string>('pendingSha', '') !== BUILD.sha }
export async function applyPending(): Promise<void> {
  const id = load<string>('pendingId', '')
  if (!id) return
  save('pendingId', '')
  try {
    await CapacitorUpdater.set({ id }) // 잘 되면 앱이 새 판으로 다시 열린다
  } catch {
    // 받아 둔 판이 사라졌다: 기억을 지워 다음 확인 때 다시 받게 한다
    save('pendingSha', '')
  }
}
async function bundleLeft(id: string): Promise<boolean> {
  if (!id) return false
  try { return (await CapacitorUpdater.list()).bundles.some((b) => b.id === id && b.status !== 'error') } catch { return false }
}
