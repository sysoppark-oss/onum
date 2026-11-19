// 초성 검색: "ㄹㅅㄴ" → "리센느"
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const isCho = (c: string) => CHO.includes(c)

export function toChosung(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00
    out += code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch
  }
  return out
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** 일반 글자와 초성을 섞어 써도 찾는다: "리ㅅㄴ" → "리센느" */
export function matches(target: string, query: string): boolean {
  const q = norm(query)
  if (!q) return true
  const t = norm(target)
  if (t.includes(q)) return true
  const tc = [...t]
  const qc = [...q]
  for (let i = 0; i + qc.length <= tc.length; i++) {
    let ok = true
    for (let j = 0; j < qc.length; j++) {
      const a = tc[i + j], b = qc[j]
      if (a === b) continue
      if (isCho(b) && toChosung(a) === b) continue
      ok = false
      break
    }
    if (ok) return true
  }
  return false
}
