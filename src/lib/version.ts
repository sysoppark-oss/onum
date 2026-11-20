// 버전 이름: 사도행전 1:8의 순서. 단계마다 쓰는 사람을 넓혀 간다.
import type { Verse } from './verses'

export const STAGES = [
  { v: '1.0', name: '예루살렘' },
  { v: '2.0', name: '유대' },
  { v: '3.0', name: '사마리아' },
  { v: '4.0', name: '땅끝' },
] as const
export const CURRENT = STAGES[1]

// 개역한글(대조함)
export const ACTS_1_8: Verse = {
  text: '오직 성령이 너희에게 임하시면 너희가 권능을 받고 예루살렘과 온 유대와 사마리아와 땅끝까지 이르러 내 증인이 되리라 하시니라',
  ref: '사도행전 1:8',
  en: 'But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.',
  enRef: 'Acts 1:8',
}

/** 새로워진 점. id를 바꾸면 이미 쓰던 사람에게 한 번 보여 준다 */
export const NOTES = {
  id: '2.0-t1',
  items: [
    '「들은 시간」: 최근 7일 동안 날마다 얼마나 들었는지, 많이 들은 곡을 보여 줘요(내 목록 맨 위).',
    '같은 곡이 여러 개 있으면 알려 드려요. 하나만 남기면 나머지는 온음 목록에서만 빠지고 파일은 그대로예요.',
    '강의를 들을 때 말과 말 사이 긴 쉼을 빠르게 지나가요. 아낀 시간도 보여 드려요(빠르기 창에서 끄고 켜기).',
    '노래·악기 연습: 곡마다 빠르기와 키를 따로 바꿀 수 있어요. 빠르기를 바꿔도 키는 그대로예요.',
    '소리 맞춤: 「목소리 또렷하게」「저음 강화」 같은 소리를 고르거나 직접 맞춰요. 음악과 강의를 따로 기억해요(쉼 › 보기).',
    '음악과 함께 묵상하기: 듣는 음악은 그대로 흐르고 말씀이 천천히 하나씩 바뀌어요(쉼).',
    '가사: 붙여 넣은 가사에 박자를 맞춰 두면 노래방처럼 지금 부르는 줄을 따라가요. 가사는 이 휴대폰 안에만 있어요.',
  ],
}
