import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { ScanResult, Track } from './library'

interface NativeTrack {
  id: number; title: string; artist: string; album: string; albumId: number
  duration: number; path: string; folder: string; added: number; size: number
}

/** 소리가 나가는 곳 */
export interface Output { kind: 'speaker' | 'wired' | 'bluetooth'; name?: string }

/** 휴대폰 미디어 음량: value는 0~max 단계 */
export interface Volume { value: number; max: number }

interface MusicScanPlugin {
  scan(opts: { minMs: number }): Promise<{ tracks: NativeTrack[]; skippedFolder: number }>
  art(opts: { id: number; albumId: number; size: number }): Promise<{ dataUrl?: string }>
  nowPlaying(opts: { playing: boolean; title?: string; artist?: string }): Promise<void>
  output(): Promise<Output>
  fontScale(): Promise<{ scale: number }>
  volume(): Promise<Volume>
  setVolume(opts: { value: number }): Promise<Volume>
  addListener(event: 'volumeChanged', fn: (v: Volume) => void): Promise<PluginListenerHandle>
  addListener(event: 'outputChanged', fn: (o: Output) => void): Promise<PluginListenerHandle>
}

const MusicScan = registerPlugin<MusicScanPlugin>('MusicScan')

export const isNative = Capacitor.isNativePlatform()

export async function scanDevice(): Promise<ScanResult> {
  const r = await MusicScan.scan({ minMs: 30000 })
  const tracks: Track[] = r.tracks.map((n) => ({
    id: `${n.path.split('/').pop()}|${n.size}`,
    url: Capacitor.convertFileSrc(n.path),
    title: n.title || n.path.split('/').pop() || '',
    artist: !n.artist || n.artist === '<unknown>' ? '모르는 가수' : n.artist,
    album: n.album || '',
    folder: n.folder,
    duration: n.duration,
    added: n.added * 1000,
    nativeId: n.id,
    albumId: n.albumId,
  }))
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

export function setNowPlaying(playing: boolean, t?: Track): void {
  if (!isNative) return
  MusicScan.nowPlaying({ playing, title: t?.title, artist: t?.artist }).catch(() => {})
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
