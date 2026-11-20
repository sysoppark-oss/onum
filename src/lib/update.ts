// 새 판 알림과 화면 부분 자동 업데이트(설치형 앱만).
// GitHub의 시험판 안내(릴리스)에 적힌 지문을 보고:
//  · 안드로이드 쪽이 그대로면 화면 부분(web.zip)만 받아 두었다가, 음악이 멈춰 있을 때 바꿔 끼운다.
//  · 안드로이드 쪽이 바뀌었으면 「새 판이 나왔어요」를 띄우고, 누르면 APK를 받아 설치 화면을 연다.
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { isNative } from './native'
import { load, save } from './store'

const API = 'https://api.github.com/repos/sysoppark-oss/onum/releases/tags/test-build'
export const BUILD = {
  sha: (import.meta.env.VITE_SHA as string | undefined) ?? 'dev',
  native: (import.meta.env.VITE_NATIVE as string | undefined) ?? '',
  run: Number(import.meta.env.VITE_RUN ?? 0),
}
export interface Remote { sha: string; native: string; run: number; at: string; apk?: string; web?: string }
const EVERY = 6 * 3600 * 1000

/** 지금 판에 문제가 없다고 알린다(안 하면 업데이트 꾸러미가 되돌려진다) */
export function appReady() { if (isNative) CapacitorUpdater.notifyAppReady().catch(() => {}) }

export async function fetchRemote(): Promise<Remote | null> {
  const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) return null
  const j = await r.json() as { body?: string; assets?: { name: string; browser_download_url: string }[] }
  const m = /<!--onum (\{.*?\})-->/s.exec(j.body ?? '')
  if (!m) return null
  const info = JSON.parse(m[1]) as Remote
  const asset = (n: string) => j.assets?.find((a) => a.name === n)?.browser_download_url
  return { ...info, apk: asset('onum-test.apk'), web: asset('web.zip') }
}

/** 하루 몇 번만 본다. 돌려주는 값: 'apk'면 새로 설치할 판, 'web'이면 받아 둔 판, 없으면 null */
export async function checkUpdate(force = false): Promise<{ kind: 'apk' | 'web' | 'same'; r: Remote } | null> {
  if (!isNative || BUILD.sha === 'dev') return null
  const last = load<number>('updAt', 0)
  if (!force && Date.now() - last < EVERY) return null
  save('updAt', Date.now())
  const r = await fetchRemote().catch(() => null)
  if (!r || r.sha === BUILD.sha) return r ? { kind: 'same', r } : null
  if (r.native === BUILD.native && r.web) {
    if (load<string>('pendingSha', '') !== r.sha) {
      const b = await CapacitorUpdater.download({ url: r.web, version: r.sha })
      save('pendingId', b.id)
      save('pendingSha', r.sha)
    }
    return { kind: 'web', r }
  }
  return { kind: 'apk', r }
}

/** 받아 둔 화면 판이 있으면 바꿔 끼운다(앱이 다시 그려진다). 음악이 나오는 중에는 부르지 않는다 */
export function hasPending(): boolean { return isNative && !!load<string>('pendingId', '') && load<string>('pendingSha', '') !== BUILD.sha }
export async function applyPending(): Promise<void> {
  const id = load<string>('pendingId', '')
  if (!id) return
  save('pendingId', '')
  await CapacitorUpdater.set({ id }).catch(() => {})
}
