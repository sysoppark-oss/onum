// 말씀을 영어(KJV)로 함께 보기. 여러 화면이 같은 설정을 본다.
import { useSyncExternalStore } from 'react'
import { load, save } from './store'

let on = load<boolean>('kjv', false)
const subs = new Set<() => void>()
export function setKjv(v: boolean) { on = v; save('kjv', v); subs.forEach((f) => f()) }
export function useKjv(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => on)
}
