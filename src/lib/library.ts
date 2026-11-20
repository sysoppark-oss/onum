import { tx } from "./i18n";

export interface Track {
  id: string // 이름+크기: 다시 불러와도 같은 곡을 알아보기 위함
  url: string
  title: string
  artist: string
  album: string
  folder: string
  duration: number
  art?: string
  added: number // 추가한 때(ms)
  nativeId?: number // 설치형 앱: MediaStore 번호
  albumId?: number
  talkFlag?: boolean // 휴대폰이 팟캐스트·오디오북으로 표시한 파일
  genre?: string
  bitrate?: number // bps
  talk?: boolean // 강의(앱이 가른 결과)
  path?: string // 설치형 앱: 휴대폰 안 파일 자리(분석용)
  // 내 편집곡의 한 구간: 원래 곡(src)의 clip.s~clip.e만 든다
  src?: string
  lrcUrl?: string // PC: 곡 옆에 놓인 같은 이름의 .lrc 가사 파일
  clip?: { s: number; e: number }
  edit?: { id: string; k: number; n: number; from: string }
}

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i
// 통화·음성 녹음과 벨소리는 음악 목록에서 뺀다
const SKIP_FOLDER = /(call|recording|recorder|voice|녹음|ringtone|notification|alarm|벨소리|알림)/i
export const MIN_SECONDS = 30

export interface ScanResult {
  tracks: Track[]
  skippedShort: number
  skippedFolder: number
}

function folderOf(f: File): string {
  const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
  const parts = p.split('/')
  return parts.length > 1 ? parts[parts.length - 2] : tx("선택한 파일")
}

/** "가수 - 제목.mp3" 형태 파일 이름에서 가수와 제목을 짐작한다 */
export function fromName(name: string): { title: string; artist: string } {
  const bare = name.replace(/\.[^.]+$/, '')
  // 방송 녹음 꼴("가수🎵곡_원곡")의 밑줄은 원곡을 가르는 표시라 남겨 둔다
  const base = (/[🎵🎶]/u.test(bare) ? bare : bare.replace(/_/g, ' ')).trim()
  const m = base.match(/^(?:\d+[.\s-]+)?(.+?)\s+-\s+(.+)$/)
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base }
}

export async function scanFiles(
  files: File[],
  onProgress: (done: number, total: number) => void,
): Promise<ScanResult> {
  const audio = files.filter((f) => AUDIO_EXT.test(f.name))
  // 같은 폴더·같은 이름의 .lrc 가사 파일
  const stem = (f: File) => ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\.[^./]+$/, '').toLowerCase()
  const lrcs = new Map(files.filter((f) => /\.lrc$/i.test(f.name)).map((f) => [stem(f), f]))
  const { parseBlob } = await import('music-metadata')
  const tracks: Track[] = []
  let skippedShort = 0
  let skippedFolder = 0
  let done = 0
  let next = 0

  async function one(file: File) {
    const folder = folderOf(file)
    if (SKIP_FOLDER.test(folder)) { skippedFolder++; return }
    const guess = fromName(file.name)
    let title = guess.title, artist = guess.artist, album = '', duration = 0, art: string | undefined, genre: string | undefined, bitrate: number | undefined
    try {
      const meta = await parseBlob(file, { duration: false, skipCovers: false })
      title = meta.common.title || title
      artist = meta.common.artist || artist
      album = meta.common.album || ''
      duration = meta.format.duration || 0
      genre = meta.common.genre?.[0]
      bitrate = meta.format.bitrate
      const pic = meta.common.picture?.[0]
      if (pic) art = URL.createObjectURL(new Blob([pic.data as BlobPart], { type: pic.format }))
    } catch {
      /* 태그가 없거나 깨진 파일: 파일 이름으로 대신 */
    }
    if (duration > 0 && duration < MIN_SECONDS) {
      skippedShort++
      if (art) URL.revokeObjectURL(art)
      return
    }
    tracks.push({
      id: `${file.name}|${file.size}`,
      added: file.lastModified,
      url: URL.createObjectURL(file),
      title,
      artist, // 모르면 빈 값
      album,
      folder,
      duration,
      art,
      genre,
      bitrate,
      lrcUrl: lrcs.has(stem(file)) ? URL.createObjectURL(lrcs.get(stem(file))!) : undefined,
    })
  }

  // 여섯 파일씩 함께 읽는다
  async function worker() {
    while (next < audio.length) {
      const file = audio[next++]
      await one(file)
      done++
      if (done % 10 === 0 || done === audio.length) onProgress(done, audio.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  tracks.sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  return { tracks, skippedShort, skippedFolder }
}

export function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
