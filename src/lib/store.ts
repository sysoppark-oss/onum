// 브라우저 저장소는 막혀 있을 수 있어 실패해도 앱이 멈추지 않게 한다.
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('onum.' + key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem('onum.' + key, JSON.stringify(value))
  } catch {
    /* 저장 못 해도 재생은 계속 */
  }
}
