// 화면 글 언어: 한국어(원문)·영어·일본어·중국어(간체)·힌디어·러시아어. 원문 한국어 글을 열쇠로 번역을 찾고, 없으면 한국어 그대로.
// 언어를 바꾸면 앱을 다시 연다(모든 글을 한 번에 바꾸려고).
import en from '../i18n/en.json'
import ja from '../i18n/ja.json'
import zh from '../i18n/zh.json'
import hi from '../i18n/hi.json'
import ru from '../i18n/ru.json'

export type Lang = 'ko' | 'en' | 'ja' | 'zh' | 'hi' | 'ru'
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'ko', name: '한국어' },
  { id: 'en', name: 'English' },
  { id: 'ja', name: '日本語' },
  { id: 'zh', name: '中文' },
  { id: 'hi', name: 'हिन्दी' },
  { id: 'ru', name: 'Русский' },
]
const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.id === v)

function detect(): Lang {
  try {
    const saved = localStorage.getItem('onum.lang')
    if (saved) { const v = JSON.parse(saved); if (isLang(v)) return v }
  } catch { /* 처음 */ }
  const n = (typeof navigator !== 'undefined' ? navigator.language : 'ko').toLowerCase()
  const two = n.slice(0, 2)
  return isLang(two) ? two : 'en'
}

export const lang: Lang = detect()
const DICTS: Record<Lang, Record<string, string> | null> = { ko: null, en, ja, zh, hi, ru }
const dict = DICTS[lang]
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
export const locale = ({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', ru: 'ru-RU' } as const)[lang]
