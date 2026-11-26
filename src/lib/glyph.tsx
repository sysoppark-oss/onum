// 떠오르는 모양: 소리에 맞춰 떠오르는 작은 그림(음표·하트·별…). 글꼴이 아니라 그림(SVG 길)으로 그려 어느 폰에서나 같다.
import { useSyncExternalStore } from 'react'
import { load, save } from './store'

export type Glyph = 'note' | 'heart' | 'star' | 'spark' | 'petal' | 'drop' | 'cross' | 'mix' | 'auto'
export const GLYPHS: { id: Glyph; name: string }[] = [
  { id: 'note', name: '음표' }, { id: 'heart', name: '하트' }, { id: 'star', name: '별' }, { id: 'spark', name: '반짝이' },
  { id: 'petal', name: '꽃잎' }, { id: 'drop', name: '물방울' }, { id: 'cross', name: '십자가' }, { id: 'mix', name: '섞어서' },
  { id: 'auto', name: '저절로' },
]
export const isGlyph = (g: unknown): g is Glyph => typeof g === 'string' && GLYPHS.some((x) => x.id === g)

/** 24×24 칸 안의 길. 가운데가 (12,12) */
export const PATH: Record<string, string> = {
  note: 'M10 3h2.2c.6 2.6 2.6 3.7 4.6 4.8 1.6.9 2.4 2.5 1.8 4.4-.6-1.6-2-2.7-4.2-3.2l-2.2-.5v9a3.6 3 0 1 1-2.2-2.8z',
  notes: 'M8 5.5l12-3.3v12.3a3.2 2.7 0 1 1-2-2.5V6.6l-8 2.2v8.9a3.2 2.7 0 1 1-2-2.5z',
  heart: 'M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2.2 0 3.7 1.3 5.4 3.3C13.7 6.3 15.2 5 17.4 5 21 5 23 8.6 21.6 11.8 19.5 16.4 12 21 12 21z',
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z',
  spark: 'M12 2c.8 5.2 4.8 9.2 10 10-5.2.8-9.2 4.8-10 10-.8-5.2-4.8-9.2-10-10 5.2-.8 9.2-4.8 10-10z',
  petal: 'M12 2c4.5 4 6 8.3 4.6 13.2-1 3.4-2.7 5.8-4.6 6.8-1.9-1-3.6-3.4-4.6-6.8C6 10.3 7.5 6 12 2z',
  drop: 'M12 2.5c3.5 5 7 8.5 7 12.5a7 7 0 0 1-14 0c0-4 3.5-7.5 7-12.5z',
  cross: 'M10.2 2h3.6v6h5.7v3.6h-5.7V22h-3.6V11.6H4.5V8h5.7z',
  snow: 'M10.90 21.50 13.10 21.50 13.10 2.50 10.90 2.50zM19.68 17.70 20.78 15.80 4.32 6.30 3.22 8.20zM3.22 15.80 4.32 17.70 20.78 8.20 19.68 6.30zM15.51 14.27 16.99 15.30 19.05 12.35 17.58 11.32zM16.99 8.70 15.51 9.73 17.58 12.68 19.05 11.65zM11.79 16.18 11.63 17.97 15.22 18.28 15.38 16.49zM17.35 14.67 15.72 13.91 14.20 17.17 15.83 17.93zM8.28 13.91 6.65 14.67 8.17 17.93 9.80 17.17zM12.37 17.97 12.21 16.18 8.62 16.49 8.78 18.28zM8.49 9.73 7.01 8.70 4.95 11.65 6.42 12.68zM7.01 15.30 8.49 14.27 6.42 11.32 4.95 12.35zM12.21 7.82 12.37 6.03 8.78 5.72 8.62 7.51zM6.65 9.33 8.28 10.09 9.80 6.83 8.17 6.07zM15.72 10.09 17.35 9.33 15.83 6.07 14.20 6.83zM11.63 6.03 11.79 7.82 15.38 7.51 15.22 5.72z',
  lily: 'M12 2.5c2.2 3.2 2.6 6.4 0 10.5-2.6-4.1-2.2-7.3 0-10.5zM12 13c-1-3.2-4-5.4-8.5-5.4.9 4.3 4.2 6.6 8.5 5.4zM12 13c1-3.2 4-5.4 8.5-5.4-.9 4.3-4.2 6.6-8.5 5.4zM11.3 13h1.4v8.5h-1.4z',
  leaf: 'M20.5 3.5C11.5 3.2 4.8 7.6 4.6 14.6c0 1.7.5 3.2 1.4 4.3l-2.6 2.6 1.2 1.2 2.6-2.6c1.2.9 2.7 1.4 4.4 1.3 7.4-.3 9.6-8.3 8.9-17.9zM8.2 17.6c2.6-3.6 5.6-6.4 9-8.4-3 2.6-5.7 5.5-7.8 9.4z',
}
const MIX = ['note', 'heart', 'star', 'spark', 'petal', 'drop', 'notes']
/** 절기 모양: 12월~주현절(1/6) 눈송이, 부활절 앞뒤 백합, 11월(추수감사) 잎사귀 */
function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, mo - 1, da)
}
export function seasonShape(now = new Date()): string | null {
  const mo = now.getMonth() + 1, d = now.getDate()
  if (mo === 12 || (mo === 1 && d <= 6)) return 'snow'
  const days = (now.getTime() - easter(now.getFullYear()).getTime()) / 864e5
  if (days >= -7 && days <= 14) return 'lily'
  if (mo === 11) return 'leaf'
  return null
}
/** 저절로: 느리고 조용하면 물방울·꽃잎, 밝고 빠르면 별·반짝이, 그 사이는 음표·하트 */
function autoShape(i: number, mood?: { tempo: number; bright: number; power: number }) {
  const calm = ['drop', 'petal'], lively = ['star', 'spark'], mid = ['note', 'heart', 'notes']
  if (!mood) return [...calm, ...mid][i % 5]
  const set = mood.tempo < 0.95 && mood.power < 0.6 ? calm : mood.tempo > 1.08 || mood.bright > 0.7 ? lively : mid
  return set[i % set.length]
}
let season = true
export const setSeasonOn = (on: boolean) => { season = on }
/** 고른 모양에서 이번에 띄울 그림 하나 */
export function shapeFor(g: Glyph, i: number, mood?: { tempo: number; bright: number; power: number }): string {
  // 절기에는 네 번에 한 번쯤 절기 모양이 섞인다
  if (season && i % 4 === 3) { const sz = seasonShape(); if (sz) return sz }
  if (g === 'auto') return autoShape(i, mood)
  if (g === 'mix') return MIX[i % MIX.length]
  if (g === 'note') return i % 3 === 2 ? 'notes' : 'note'
  return g
}

let cur: Glyph = load<Glyph>('glyph', 'note')
if (!GLYPHS.some((x) => x.id === cur)) cur = 'note'
const subs = new Set<() => void>()
export const getGlyph = () => cur
export function setGlyph(g: Glyph) { cur = g; save('glyph', g); subs.forEach((f) => f()) }
export const useGlyph = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => cur)

/* 떠오르는 모양의 선 색과 떠오르는 수 */
export type NoteColor = 'red' | 'pink' | 'orange' | 'green' | 'purple' | 'ink' | 'mix'
export const NOTE_COLORS: { id: NoteColor; name: string; v: string }[] = [
  { id: 'red', name: '빨강', v: 'var(--nt-red)' }, { id: 'pink', name: '분홍', v: 'var(--tg-pink)' },
  { id: 'orange', name: '주황', v: 'var(--tg-orange)' }, { id: 'green', name: '초록', v: 'var(--tg-green)' },
  { id: 'purple', name: '보라', v: 'var(--tg-purple)' }, { id: 'ink', name: '검정(밤에는 흰색)', v: 'var(--ink)' },
  { id: 'mix', name: '여러 색', v: '' },
]
export type NoteAmount = 'few' | 'mid' | 'many'
/** 떠오르는 수: 자주 뜨는 정도(배)와 한꺼번에 떠 있는 최대 수 */
export const NOTE_AMOUNTS: { id: NoteAmount; name: string; k: number; max: number }[] = [
  { id: 'few', name: '적게', k: 0.5, max: 5 }, { id: 'mid', name: '보통', k: 1, max: 10 }, { id: 'many', name: '많이', k: 1.5, max: 15 },
]
let nc: NoteColor = load<NoteColor>('noteColor', 'red')
if (!NOTE_COLORS.some((x) => x.id === nc)) nc = 'red'
let na: NoteAmount = load<NoteAmount>('noteAmount', 'mid')
if (!NOTE_AMOUNTS.some((x) => x.id === na)) na = 'mid'
export const getNoteColor = () => nc
export const getNoteAmount = () => na
export function setNoteColor(c: NoteColor) { nc = c; save('noteColor', c); subs.forEach((f) => f()) }
export function setNoteAmount(a: NoteAmount) { na = a; save('noteAmount', a); subs.forEach((f) => f()) }
export const useNoteColor = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => nc)
export const useNoteAmount = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => na)

/* 떠오르는 글자: 모양 대신(또는 섞어서) 낱말이 떠오른다. 낱말은 묶음에서 고르고, 직접 넣을 수도 있다 */
export type NoteText = 'off' | 'only' | 'mix'
export const NOTE_TEXTS: { id: NoteText; name: string }[] = [{ id: 'off', name: '모양만' }, { id: 'only', name: '글자만' }, { id: 'mix', name: '모양과 글자' }]
export const WORD_GROUPS: { id: string; name: string; words: string[] }[] = [
  { id: 'love', name: '사랑', words: ['사랑', '은혜', '긍휼', '자비', '용서', '위로'] },
  { id: 'faith', name: '믿음', words: ['믿음', '순종', '신뢰', '고백', '기도', '말씀'] },
  { id: 'hope', name: '소망', words: ['소망', '희망', '천국', '약속', '영광', '부활'] },
  { id: 'joy', name: '기쁨', words: ['기쁨', '감사', '찬양', '평안', '축복', '행복'] },
  { id: 'day', name: '일상', words: ['오늘', '햇살', '바람', '웃음', '친구', '가족'] },
]
export const MY_WORDS_MAX = 20, MY_WORD_LEN = 4
interface Words { text: NoteText; groups: string[]; mine: string[]; mineOn: boolean; big: boolean }
let wd: Words = { text: 'off', groups: ['love', 'faith', 'hope', 'joy'], mine: [], mineOn: true, big: true, ...load<Partial<Words>>('noteWords', {}) }
if (!NOTE_TEXTS.some((x) => x.id === wd.text)) wd.text = 'off'
if (!Array.isArray(wd.groups)) wd.groups = []
wd.mine = Array.isArray(wd.mine) ? wd.mine.filter((x) => typeof x === 'string').slice(0, MY_WORDS_MAX) : []
export const getWords = () => wd
export function setWords(p: Partial<Words>) { wd = { ...wd, ...p }; save('noteWords', wd); subs.forEach((f) => f()) }
export const useWords = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => wd)
/** 이번에 글자를 띄울 차례면 낱말을, 모양 차례면 null을 준다. tr: 화면 언어로 옮기는 함수(직접 넣은 낱말은 그대로) */
export function wordFor(i: number, tr: (s: string) => string): string | null {
  if (wd.text === 'off' || (wd.text === 'mix' && i % 3 !== 0)) return null
  const pool = WORD_GROUPS.filter((g) => wd.groups.includes(g.id)).flatMap((g) => g.words)
  const all = pool.length + (wd.mineOn ? wd.mine.length : 0)
  if (!all) return null
  const k = Math.floor(Math.random() * all)
  return k < pool.length ? tr(pool[k]) : wd.mine[k - pool.length]
}

/** 설정 칩·파형 음표에 쓰는 작은 그림(line이면 안을 채우지 않고 선만) */
export function GlyphIcon({ k, s = 18, line = false }: { k: string; s?: number; line?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" focusable="false" overflow="visible">
      {line
        ? <path d={PATH[k]} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        : <path d={PATH[k]} fill="currentColor" />}
    </svg>
  )
}

/** 고르기 칩 안의 그림: 섞어서·저절로는 작은 그림 셋 */
export function GlyphChip({ id }: { id: Glyph }) {
  if (id === 'mix') return <span className="gp-mix"><GlyphIcon k="heart" s={12} line /><GlyphIcon k="star" s={12} line /><GlyphIcon k="note" s={12} line /></span>
  if (id === 'auto') return <span className="gp-mix"><GlyphIcon k="drop" s={12} line /><GlyphIcon k="spark" s={14} line /><GlyphIcon k="petal" s={12} line /></span>
  return <GlyphIcon k={id} s={20} line />
}
