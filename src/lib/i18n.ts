// 화면 글 언어: 한국어(원문)·영어·일본어. 원문 한국어 글을 열쇠로 번역을 찾고, 없으면 한국어 그대로.
// 언어를 바꾸면 앱을 다시 연다(모든 글을 한 번에 바꾸려고).
import en from '../i18n/en.json'
import ja from '../i18n/ja.json'

export type Lang = 'ko' | 'en' | 'ja'
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'ko', name: '한국어' },
  { id: 'en', name: 'English' },
  { id: 'ja', name: '日本語' },
]

function detect(): Lang {
  try {
    const saved = localStorage.getItem('onum.lang')
    if (saved) { const v = JSON.parse(saved); if (v === 'ko' || v === 'en' || v === 'ja') return v }
  } catch { /* 처음 */ }
  const n = (typeof navigator !== 'undefined' ? navigator.language : 'ko').toLowerCase()
  return n.startsWith('ko') ? 'ko' : n.startsWith('ja') ? 'ja' : 'en'
}

export const lang: Lang = detect()
const dict: Record<string, string> | null = lang === 'en' ? en : lang === 'ja' ? ja : null
if (typeof document !== 'undefined') document.documentElement.lang = lang

/** 번역. 원문 앞뒤 빈칸은 그대로 두고, {0} {1}… 자리에 값을 넣는다 */
export function tx(s: string, ...a: (string | number)[]): string {
  let r = s
  if (dict) {
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/)!
    const hit = dict[m[2]]
    if (hit != null) r = m[1] + hit + m[3]
  }
  for (let i = 0; i < a.length; i++) r = r.split(`{${i}}`).join(String(a[i]))
  return r
}

export function setLang(l: Lang) {
  try { localStorage.setItem('onum.lang', JSON.stringify(l)) } catch { /* 계속 */ }
  location.reload()
}

/** 숫자·정렬에 쓰는 지역 */
export const locale = lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : 'en-US'
