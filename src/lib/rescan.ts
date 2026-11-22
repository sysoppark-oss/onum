// 휴대폰에 새로 받은 곡 다시 찾기. App이 찾는 방법을 등록하고, 곡 추가 창 등에서 부른다.
let fn: (() => Promise<number>) | null = null
let last = 0
export function setRescanner(f: (() => Promise<number>) | null) { fn = f }
export const canRescan = () => !!fn
/** 새로 생긴 곡 수(못 찾으면 0). 너무 잦으면 건너뛴다. */
export async function rescan(force = false): Promise<number> {
  if (!fn) return 0
  if (!force && Date.now() - last < 4000) return 0
  last = Date.now()
  return fn()
}
