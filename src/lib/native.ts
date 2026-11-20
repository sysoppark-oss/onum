import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { fromName, type ScanResult, type Track } from './library'

interface NativeTrack {
  id: number; title: string; artist: string; album: string; albumId: number
  duration: number; path: string; folder: string; added: number; size: number
  talkFlag?: boolean; genre?: string; bitrate?: number
}

/** 소리가 나가는 곳 */
export interface Output { kind: 'speaker' | 'wired' | 'bluetooth'; name?: string }

/** 휴대폰 미디어 음량: value는 0~max 단계 */
export interface Volume { value: number; max: number }

interface MusicScanPlugin {
  scan(opts: { minMs: number }): Promise<{ tracks: NativeTrack[]; skippedFolder: number }>
  art(opts: { id: number; albumId: number; size: number }): Promise<{ dataUrl?: string }>
  nowPlaying(opts: { playing: boolean; stop?: boolean; title?: string; artist?: string; pos?: number; dur?: number; rate?: number }): Promise<void>
  output(): Promise<Output>
  fontScale(): Promise<{ scale: number }>
  battery(): Promise<{ free: boolean; maker: string }>
  analyze(opts: { path: string; bars: number }): Promise<{ rms: number[]; lufs?: number }>
  askBattery(): Promise<void>
  appSettings(): Promise<void>
  volume(): Promise<Volume>
  setVolume(opts: { value: number }): Promise<Volume>
  addListener(event: 'volumeChanged', fn: (v: Volume) => void): Promise<PluginListenerHandle>
  addListener(event: 'outputChanged', fn: (o: Output) => void): Promise<PluginListenerHandle>
  addListener(event: 'mediaAction', fn: (a: MediaAction) => void): Promise<PluginListenerHandle>
}

const MusicScan = registerPlugin<MusicScanPlugin>('MusicScan')

export const isNative = Capacitor.isNativePlatform()

export async function scanDevice(): Promise<ScanResult> {
  const r = await MusicScan.scan({ minMs: 30000 })
  const tracks: Track[] = r.tracks.map((n) => {
    const file = n.path.split('/').pop() || ''
    const known = !!n.artist && n.artist !== '<unknown>'
    // 태그가 없으면 "가수 - 제목" 꼴의 이름에서 가수를 찾아본다
    const guess = known ? null : fromName(n.title || file)
    return {
      id: `${file}|${n.size}`,
      url: Capacitor.convertFileSrc(n.path),
      title: guess?.artist ? guess.title : n.title || file,
      artist: known ? n.artist : guess?.artist || '',
      // 휴대폰은 앨범 태그가 없으면 폴더 이름을 앨범 자리에 넣는다. 그건 앨범이 아니다.
      album: n.album && n.album !== n.folder && n.album !== '<unknown>' ? n.album : '',
      folder: n.folder,
      duration: n.duration,
      added: n.added * 1000,
      nativeId: n.id,
      albumId: n.albumId,
      talkFlag: n.talkFlag,
      path: n.path,
      genre: n.genre,
      bitrate: n.bitrate || undefined,
    }
  })
  tracks.sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  return { tracks, skippedShort: 0, skippedFolder: r.skippedFolder }
}

const artCache = new Map<number, Promise<string | undefined>>()
export function nativeArt(t: Track): Promise<string | undefined> {
  if (!isNative || t.nativeId == null) return Promise.resolve(undefined)
  let p = artCache.get(t.nativeId)
  if (!p) {
    p = MusicScan.art({ id: t.nativeId, albumId: t.albumId ?? -1, size: 320 })
      .then((r) => r.dataUrl)
      .catch(() => undefined)
    artCache.set(t.nativeId, p)
  }
  return p
}

/** 재생 알림·잠금 화면을 지금 상태로. t가 없으면 알림을 없앤다. */
export function setNowPlaying(playing: boolean, t?: Track, pos = 0, dur = 0, rate = 1): void {
  if (!isNative) return
  if (!t) { MusicScan.nowPlaying({ playing: false, stop: true }).catch(() => {}); return }
  MusicScan.nowPlaying({ playing, title: t.title, artist: t.artist, pos, dur, rate }).catch(() => {})
}

export interface MediaAction { action: 'play' | 'pause' | 'next' | 'prev' | 'seek'; pos?: number }
/** 알림·잠금 화면·차 버튼 */
export function onMediaAction(fn: (a: MediaAction) => void): () => void {
  if (!isNative) return () => {}
  const h = MusicScan.addListener('mediaAction', fn)
  return () => { h.then((x) => x.remove()).catch(() => {}) }
}

export function getOutput(): Promise<Output | null> {
  return isNative ? MusicScan.output().catch(() => null) : Promise.resolve(null)
}

export function onOutput(fn: (o: Output) => void): () => void {
  if (!isNative) return () => {}
  const h = MusicScan.addListener('outputChanged', fn)
  return () => { h.then((x) => x.remove()).catch(() => {}) }
}

/** 휴대폰 설정의 글자 크기 배율 (보통 1, 크게 하면 1.3~2) */
export function getFontScale(): Promise<number | null> {
  return isNative ? MusicScan.fontScale().then((r) => r.scale).catch(() => null) : Promise.resolve(null)
}

export function getVolume(): Promise<Volume | null> {
  return isNative ? MusicScan.volume().catch(() => null) : Promise.resolve(null)
}

export function setVolume(value: number): void {
  if (isNative) MusicScan.setVolume({ value }).catch(() => {})
}

/** 휴대폰 옆의 음량 버튼을 눌렀을 때도 불린다 */
export function onVolume(fn: (v: Volume) => void): () => void {
  if (!isNative) return () => {}
  const h = MusicScan.addListener('volumeChanged', fn)
  return () => { h.then((x) => x.remove()).catch(() => {}) }
}

/** 배터리 최적화에서 빠져 있는지. 설치형 앱이 아니면 null */
export function getBattery(): Promise<{ free: boolean; maker: string } | null> {
  return isNative ? MusicScan.battery().catch(() => null) : Promise.resolve(null)
}
export function askBattery(): void { if (isNative) MusicScan.askBattery().catch(() => {}) }
export function openAppSettings(): void { if (isNative) MusicScan.appSettings().catch(() => {}) }

/** 설치형 앱: 휴대폰이 직접 곡을 나눠 재기(구간마다 rms, 전체 소리 크기) */
export function nativeAnalyze(path: string, bars: number): Promise<{ rms: number[]; lufs?: number } | null> {
  return isNative ? MusicScan.analyze({ path, bars }).catch(() => null) : Promise.resolve(null)
}
