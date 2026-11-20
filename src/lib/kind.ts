// 강의와 음악 가르기. 소리는 듣지 않고, 휴대폰 표시·장르·이름·폴더·길이와 음질만 본다.
// 틀린 것은 사용자가 길게 눌러 옮기고, 옮긴 것은 기억한다.
import type { Track } from './library'
import { load, save } from './store'

const WORD = /(강의|강좌|특강|설교|세미나|수업|강해|오디오북|팟캐스트|낭독|lecture|podcast|sermon|audiobook|seminar)|(제\s*\d+\s*강)|(\d+\s*강(?![가-힣]))/i
const GENRE = /(speech|spoken|podcast|audiobook|lecture|sermon|강의|설교|낭독|교육)/i
const LONG = 20 * 60 // 20분이 넘고
const LOW_BITRATE = 96000 // 음질이 낮으면(말 녹음에 흔함) 강의로 본다

export interface KindOverrides { ids: Record<string, 'talk' | 'music'>; folders: Record<string, 'talk' | 'music'> }

export function loadOverrides(): KindOverrides {
  return load<KindOverrides>('kind', { ids: {}, folders: {} })
}
export function saveOverrides(o: KindOverrides) { save('kind', o) }

function guess(t: Track): boolean {
  if (t.talkFlag) return true
  if (t.genre && GENRE.test(t.genre)) return true
  if (WORD.test(t.title) || WORD.test(t.folder) || WORD.test(t.album)) return true
  return t.duration >= LONG && !!t.bitrate && t.bitrate <= LOW_BITRATE
}

/** 강의인 곡 번호들 */
export function classify(tracks: Track[], o: KindOverrides): Set<string> {
  const talk = new Set<string>()
  const per = new Map<string, { n: number; talk: number }>()
  for (const t of tracks) {
    const g = guess(t)
    if (g) talk.add(t.id)
    const f = per.get(t.folder) ?? { n: 0, talk: 0 }
    f.n++; if (g) f.talk++
    per.set(t.folder, f)
  }
  // 한 폴더의 대부분이 강의면 폴더 전체를 강의로
  for (const t of tracks) {
    const f = per.get(t.folder)!
    if (f.n >= 3 && f.talk / f.n >= 0.6) talk.add(t.id)
  }
  for (const t of tracks) {
    const k = o.ids[t.id] ?? o.folders[t.folder]
    if (k === 'talk') talk.add(t.id)
    else if (k === 'music') talk.delete(t.id)
  }
  return talk
}

const NO = /(?:제\s*)?(\d{1,3})\s*강(?![가-힣])/

/** 강의 한 개: 번호 "3강", 제목, 말하는 사람(번호·폴더 이름이면 비움), 정렬 순서 */
export function lectureOf(t: Track): { no: string; name: string; speaker: string; order: number } {
  // "로마서 강해 3강 - 제목" 꼴은 파일 이름 풀이에서 앞쪽이 가수 자리로 갈 수 있다
  const full = t.artist && !t.title.includes(t.artist) ? `${t.artist} ${t.title}` : t.title
  const m = full.match(NO)
  const { name } = lectureName(t.title, t.folder)
  const speaker = t.artist && !NO.test(t.artist) && !(t.folder && t.artist.includes(t.folder)) ? t.artist : ''
  return { no: m ? `${Number(m[1])}강` : '', name, speaker, order: m ? Number(m[1]) : Infinity }
}

/** 1강 → 2강 → 10강, 번호 없으면 이름 순 */
export function byLecture(a: Track, b: Track): number {
  const x = lectureOf(a), y = lectureOf(b)
  return x.order !== y.order ? (x.order < y.order ? -1 : 1) : natural.compare(a.title, b.title)
}

/** "로마서 강해 3강 - 믿음으로 말미암는 의" → 번호 "3강", 제목 "믿음으로 말미암는 의" */
export function lectureName(title: string, folder: string): { no: string; name: string } {
  const m = title.match(NO)
  let name = title
  if (folder && folder.length > 1) name = name.split(folder).join(' ')
  if (m) name = name.replace(m[0], ' ')
  name = name.replace(/^[\s\-_.·:|｜()[\]]+|[\s\-_.·:|｜]+$/g, '').replace(/\s{2,}/g, ' ').trim()
  return { no: m ? `${Number(m[1])}강` : '', name: name || title }
}

/** 1강, 2강 … 10강 순서 */
export const natural = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })
