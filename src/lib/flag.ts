// 여러 화면이 같이 보는 켜고 끄는 설정
import { useSyncExternalStore } from 'react'
import { load, save } from './store'

const vals = new Map<string, boolean>()
const subs = new Set<() => void>()
export function setFlag(key: string, v: boolean) { vals.set(key, v); save(key, v); subs.forEach((f) => f()) }
export function useFlag(key: string, def: boolean): boolean {
  if (!vals.has(key)) vals.set(key, load<boolean>(key, def))
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => vals.get(key)!)
}
