// 개역한글. 모두 원문과 대조한 구절만 넣는다. (365구절은 신학 검토를 거쳐 채운다)
// 영어는 KJV(흠정역, 퍼블릭 도메인)만. 모두 원문과 대조했다.
export interface Verse { text: string; ref: string; parts?: string[]; en?: string; enRef?: string }

export const DAILY: Verse[] = [
  { text: '그러므로 믿음은 들음에서 나며 들음은 그리스도의 말씀으로 말미암았느니라', ref: '로마서 10:17', en: 'So then faith cometh by hearing, and hearing by the word of God.', enRef: 'Romans 10:17', parts: ['그러므로 믿음은 들음에서 나며', '들음은 그리스도의 말씀으로 말미암았느니라'] },
  { text: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라', ref: '요한복음 3:16', en: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', enRef: 'John 3:16', parts: ['하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니', '이는 저를 믿는 자마다', '멸망치 않고 영생을 얻게 하려 하심이니라'] },
  { text: '우리가 아직 죄인되었을 때에 그리스도께서 우리를 위하여 죽으심으로 하나님께서 우리에게 대한 자기의 사랑을 확증하셨느니라', ref: '로마서 5:8', en: 'But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us.', enRef: 'Romans 5:8', parts: ['우리가 아직 죄인되었을 때에', '그리스도께서 우리를 위하여 죽으심으로', '하나님께서 우리에게 대한 자기의 사랑을 확증하셨느니라'] },
  { text: '누구든지 주의 이름을 부르는 자는 구원을 얻으리라', ref: '로마서 10:13', en: 'For whosoever shall call upon the name of the Lord shall be saved.', enRef: 'Romans 10:13' },
]

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

/** 날짜가 바뀌면 다음 구절 */
export function today(d = new Date()): Verse {
  const day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000)
  return DAILY[day % DAILY.length]
}
