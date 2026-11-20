// 버전 이름: 사도행전 1:8의 순서. 단계마다 쓰는 사람을 넓혀 간다.
import type { Verse } from './verses'

export const STAGES = [
  { v: '1.0', name: '예루살렘' },
  { v: '2.0', name: '유대' },
  { v: '3.0', name: '사마리아' },
  { v: '4.0', name: '땅끝' },
] as const
export const CURRENT = STAGES[0]

// 개역한글(대조함)
export const ACTS_1_8: Verse = {
  text: '오직 성령이 너희에게 임하시면 너희가 권능을 받고 예루살렘과 온 유대와 사마리아와 땅끝까지 이르러 내 증인이 되리라 하시니라',
  ref: '사도행전 1:8',
  en: 'But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.',
  enRef: 'Acts 1:8',
}

/** 새로워진 점. id를 바꾸면 이미 쓰던 사람에게 한 번 보여 준다 */
export const NOTES = {
  id: '1.0-t4',
  items: [
    '곡마다 시작·끝 지점을 정해 늘 그 부분만 들을 수 있어요.',
    '녹음 앞뒤의 빈 소리를 알아서 건너뛰어요.',
    '곡 사이를 끊김 없이 잇거나 2·4·6초 겹쳐 넘겨요.',
    '목록마다 듣던 곡과 자리를 기억해 이어서 들어요.',
    '곡마다 소리 크기를 조금 작게·크게 맞춰 둘 수 있어요.',
    '「이 곡 몇 번 듣기」로 정한 만큼 듣고 다음 곡으로 가요.',
    '멈추고 다시 틀 때 소리가 뚝 끊기지 않고 부드럽게 바뀌어요.',
    '한쪽에서만 소리가 나는 곡을 양쪽으로 들려줘요.',
    '목록에 메모를 남기고, 곡을 색으로 표시해 둘 수 있어요.',
    '카톡으로 받은 음악, 다운로드한 음악을 따로 모아 보여 줘요.',
    '말씀을 영어 흠정역(KJV)으로 바꿔 볼 수 있어요(쉼 › 보기).',
  ],
}
