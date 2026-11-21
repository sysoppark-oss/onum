import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { fromName, type ScanResult, type Track } from './library'

interface NativeTrack {
  id: number; title: string; artist: string; album: string; albumId: number
  duration: number; path: string; folder: string; added: number; size: number
  talkFlag?: boolean; genre?: string; bitrate?: number
}

/** 소리가 나가는 곳 */
export interface Output { kind: 'speaker' | 'wired' | 'bluetooth'; name?: string; car?: boolean }

/** 휴대폰 미디어 음량: value는 0~max 단계 */
export interface AiStatus { ok: boolean; ready: boolean; bytes: number }
export interface AiProgress { stage: 'download' | 'listen'; done: number; total: number }
export interface Volume { value: number; max: number }

interface MusicScanPlugin {
  scan(opts: { minMs: number }): Promise<{ tracks: NativeTrack[]; skippedFolder: number }>
  art(opts: { id: number; albumId: number; size: number }): Promise<{ dataUrl?: string }>
  nowPlaying(opts: { playing: boolean; stop?: boolean; title?: string; artist?: string; pos?: number; dur?: number; rate?: number }): Promise<void>
  output(): Promise<Output>
  fontScale(): Promise<{ scale: number }>
  battery(): Promise<{ free: boolean; maker: string }>
  askNearby(): Promise<Output>
  analyze(opts: { path: string; bars: number }): Promise<{ rms: number[]; lufs?: number; head?: number; tail?: number }>
  quiet(opts: { path: string }): Promise<{ q: number[]; n: number }>
  aiStatus(): Promise<AiStatus>
  aiDownload(): Promise<void>
  aiRemove(): Promise<void>
  aiTranscribe(opts: { path: string; lang: string }): Promise<{ w: string[]; t: number[] }>
  addListener(event: 'aiProgress', fn: (p: AiProgress) => void): Promise<PluginListenerHandle>
  askBattery(): Promise<void>
  appSettings(): Promise<void>
  volume(): Promise<Volume>
  setVolume(opts: { value: number }): Promise<Volume>
  addListener(event: 'volumeChanged', fn: (v: Volume) => void): Promise<PluginListenerHandle>
  addListener(event: 'outputChanged', fn: (o: Output) => void): Promise<PluginListenerHandle>
  addListener(event: 'mediaAction', fn: (a: MediaAction) => void): Promise<PluginListenerHandle>
  addListener(event: 'exportProgress', fn: (p: { f: number }) => void): Promise<PluginListenerHandle>
  openUrl(opts: { url: string }): Promise<void>
  exportClips(opts: { parts: { path: string; s: number; e: number }[]; name: string }): Promise<{ where: string }>
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
export function nativeAnalyze(path: string, bars: number): Promise<{ rms: number[]; lufs?: number; head?: number; tail?: number; side?: 0 | 1 | 2 } | null> {
  return isNative ? MusicScan.analyze({ path, bars }).catch(() => null) : Promise.resolve(null)
}

/** 설치형 앱: 강의를 처음부터 끝까지 재어 조용한 구간(1/100초 단위 [시작, 끝, …]) */
export function nativeQuiet(path: string): Promise<number[] | null> {
  return isNative ? MusicScan.quiet({ path }).then((r) => r.q).catch(() => null) : Promise.resolve(null)
}

/** 차 오디오인지 알아보려고 "근처 기기" 권한을 묻는다 */
export function askNearby(): Promise<Output | null> {
  return isNative ? MusicScan.askNearby().catch(() => null) : Promise.resolve(null)
}

/** 편집곡을 진짜 음악 파일(.m4a)로 「음악/온음」에 저장(설치형 앱) */
export async function nativeExport(parts: { path: string; s: number; e: number }[], name: string, onProgress: (f: number) => void): Promise<string> {
  const h = await MusicScan.addListener('exportProgress', (p) => onProgress(p.f))
  try { return (await MusicScan.exportClips({ parts, name })).where } finally { h.remove() }
}

/** 새 시험판 내려받기를 브라우저로 연다 */
export function openDownload(url: string): Promise<boolean> {
  return isNative ? MusicScan.openUrl({ url }).then(() => true, () => false) : Promise.resolve(false)
}

/** 바깥 웹 페이지 열기(설치형 앱은 휴대폰 브라우저로) */
export function openWeb(url: string): void {
  if (isNative) MusicScan.openUrl({ url }).catch(() => window.open(url, '_blank', 'noopener'))
  else window.open(url, '_blank', 'noopener')
}

// 가사 자동 맞추기 AI — 휴대폰 앱에서만 (모델은 사용자가 고를 때만 받는다)
export function aiStatus(): Promise<AiStatus | null> {
  return isNative ? MusicScan.aiStatus().catch(() => null) : Promise.resolve(null)
}
async function withProgress<T>(fn: () => Promise<T>, onProgress?: (p: AiProgress) => void): Promise<T> {
  const h = onProgress ? await MusicScan.addListener('aiProgress', onProgress) : null
  try { return await fn() } finally { h?.remove() }
}
export function aiDownload(onProgress?: (p: AiProgress) => void): Promise<void> {
  return withProgress(() => MusicScan.aiDownload(), onProgress)
}
export function aiRemove(): Promise<void> { return isNative ? MusicScan.aiRemove() : Promise.resolve() }
export async function aiTranscribe(path: string, lang: string, onProgress?: (p: AiProgress) => void): Promise<{ s: string; t: number }[]> {
  const r = await withProgress(() => MusicScan.aiTranscribe({ path, lang }), onProgress)
  return r.w.map((s, i) => ({ s, t: r.t[i] }))
}
