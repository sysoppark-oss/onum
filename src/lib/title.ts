import { tx } from './i18n'
// 방송 녹음 파일의 긴 제목을 곡·부른 사람·원곡·프로그램으로 나눈다.
// 예: "[우리들의 발라드] 김수아🎵사랑이란_윤상 ｜ 261026 4회"
//   → 곡 "사랑이란", 부른 사람 "김수아", 원곡 "윤상", 프로그램 "우리들의 발라드", 회차 "4회"
// 꼴이 맞지 않으면 아무것도 지어내지 않고 원래 제목을 그대로 곡 이름으로 둔다.

export interface Parsed {
  song: string
  singer: string
  original: string
  program: string
  episode: string
}

const NOTE = /\s*[🎵🎶♪♫♬]\s*/u
const LEAD = /^\s*[[【(]([^\]】)]{1,40})[\]】)]\s*/
const PIPE = /\s*[｜|]\s*(.*)$/
const EPISODE = /(\d{1,4})\s*회/

export function parseTitle(title: string, artist = ''): Parsed {
  let s = title.trim()
  let program = ''
  let episode = ''
  let singer = ''
  let original = ''

  const lead = s.match(LEAD)
  if (lead) {
    program = lead[1].trim()
    s = s.slice(lead[0].length)
  }

  const pipe = s.match(PIPE)
  if (pipe) {
    const ep = pipe[1].match(EPISODE)
    if (ep) episode = tx('{0}회', ep[1])
    s = s.slice(0, pipe.index).trim()
  }

  let song = s
  const note = s.match(NOTE)
  if (note && note.index! > 0) {
    // 부른 사람🎵곡_원곡
    singer = s.slice(0, note.index).trim()
    song = s.slice(note.index! + note[0].length).trim()
    const us = song.lastIndexOf('_')
    if (us > 0 && us < song.length - 1) {
      original = song.slice(us + 1).trim()
      song = song.slice(0, us).trim()
    }
  } else if (program) {
    // [프로그램] 부른 사람 - 곡
    const dash = s.match(/^(.+?)\s+-\s+(.+)$/)
    if (dash) { singer = dash[1].trim(); song = dash[2].trim() }
  }

  if (!song) song = title.trim()
  if (!singer) singer = artist.trim()
  return { song, singer, original, program, episode }
}

/** 받침이 있으면 a, 없으면 b: 조사 고르기 ("사랑이란을", "회상을", "Night를") */
export function josa(word: string, a: string, b: string): string {
  const ch = word.trim().slice(-1)
  const code = ch.charCodeAt(0) - 0xac00
  if (code >= 0 && code < 11172) return word + (code % 28 ? a : b)
  // 영문·숫자: 끝소리로 대강 고른다
  return word + (/[lmnr136780]$/i.test(ch) ? a : b)
}
