import { YEAR } from './verses365'
// 개역한글. 모두 원문과 대조한 구절만 넣는다. 날마다의 365구절은 verses365.ts
// 영어는 KJV(흠정역, 퍼블릭 도메인)만. 모두 원문과 대조했다.
export interface Verse { text: string; ref: string; parts?: string[]; en?: string; enRef?: string }

export const NIGHT: Verse = {
  text: '내가 평안히 눕고 자기도 하리니 나를 안전히 거하게 하시는 이는 오직 여호와시니이다',
  ref: '시편 4:8',
  en: 'I will both lay me down in peace, and sleep: for thou, LORD, only makest me dwell in safety.',
  enRef: 'Psalm 4:8',
}

export const NAME: Verse = {
  text: '그 소리가 온 땅에 퍼졌고 그 말씀이 땅끝까지 이르렀도다',
  ref: '롬 10:18',
  en: 'Their sound went into all the earth, and their words unto the ends of the world.',
  enRef: 'Romans 10:18',
}

/** 오늘의 말씀: 365구절 가운데 해의 몇째 날인지로 고른다(해마다 같은 날 같은 말씀) */
export function dayIndex(d = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 1)
  const n = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start.getTime()) / 86400000)
  return n % YEAR.length
}
export function today(d = new Date()): Verse { return YEAR[dayIndex(d)] }
