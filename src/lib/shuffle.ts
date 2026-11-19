// 진짜 무작위: 모든 곡을 한 번씩 다 튼 뒤에 다시 섞는다.
// 새로 섞을 때 방금 들은 곡이 맨 앞에 오지 않게 한다.
export function shuffledOrder(ids: string[], avoidFirst?: string): string[] {
  const a = [...ids]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  if (avoidFirst && a.length > 1 && a[0] === avoidFirst) {
    const k = 1 + Math.floor(Math.random() * (a.length - 1))
    ;[a[0], a[k]] = [a[k], a[0]]
  }
  return a
}
