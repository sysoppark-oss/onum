// 같은 곡 중복 찾기: 곡 이름·부른 사람이 같고 길이가 3초 안쪽으로 같으면 같은 곡으로 본다.
// 파일은 지우지 않는다. 온음에서만 「빼 두기」(목록에서 숨김)를 하고, 언제든 다시 보이게 할 수 있다.
import type { Track } from './library'
import type { Parsed } from './title'

export interface Group { key: string; items: Track[]; keep: string }

const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/\(.*?\)|\[.*?\]|[^\p{L}\p{N}]+/gu, '')

/** 그룹마다 남길 곡: 음질 좋은 것 → 많이 들은 것 → 먼저 들어온 것 */
export function findDupes(tracks: Track[], info: (t: Track) => Parsed, plays: Record<string, number>, notSame: string[]): Group[] {
  const by = new Map<string, Track[]>()
  for (const t of tracks) {
    if (t.edit || t.talk) continue
    const p = info(t)
    const song = norm(p.song)
    if (!song || p.song === '제목 없는 곡') continue
    const k = song + '|' + norm(p.singer || t.artist || '')
    const a = by.get(k)
    if (a) a.push(t); else by.set(k, [t])
  }
  const out: Group[] = []
  const skip = new Set(notSame)
  for (const [k, list] of by) {
    if (list.length < 2) continue
    // 길이가 비슷한 것끼리 다시 묶는다(같은 이름의 다른 녹음은 따로)
    const sorted = [...list].sort((a, b) => a.duration - b.duration)
    let cur: Track[] = [sorted[0]]
    const flushCur = () => {
      if (cur.length < 2) return
      const key = k + '|' + Math.round(cur[0].duration / 10)
      if (skip.has(key)) return
      const best = [...cur].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0) || (plays[b.id] ?? 0) - (plays[a.id] ?? 0) || a.added - b.added)[0]
      out.push({ key, items: cur, keep: best.id })
    }
    for (const t of sorted.slice(1)) {
      const prev = cur[cur.length - 1]
      if (!t.duration || !prev.duration ? t.duration === prev.duration : Math.abs(t.duration - prev.duration) <= 3) cur.push(t)
      else { flushCur(); cur = [t] }
    }
    flushCur()
  }
  return out.sort((a, b) => b.items.length - a.items.length)
}
