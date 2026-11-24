// 편집곡을 진짜 음악 파일로. 설치형 앱은 휴대폰이 AAC(.m4a)로 만들어 「음악/온음」에 넣고,
// PC(웹)에서는 브라우저가 풀어 이어 붙인 뒤 WAV로 내려받는다.
import { tx } from "./i18n";
import type { Track } from './library'
import { isNative, nativeExport } from './native'

export interface ExportPart { t: Track; s: number; e: number }
const SR = 44100
const FADE = Math.round(SR / 100) // 10ms: 이음매의 '딱' 소리 막기

export async function exportEdit(parts: ExportPart[], name: string, onProgress: (f: number) => void): Promise<{ where: string; url?: string; file?: string }> {
  if (isNative) {
    const ps = parts.map((p) => ({ path: p.t.path ?? '', s: p.s, e: p.e }))
    if (ps.some((p) => !p.path)) throw new Error('no_path')
    return { where: await nativeExport(ps, name, onProgress) }
  }
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  const total = parts.reduce((a, p) => a + Math.max(0, Math.round((p.e - p.s) * SR)), 0)
  const L = new Float32Array(total), R = new Float32Array(total)
  let at = 0
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]
    const buf = await (await fetch(p.t.url)).arrayBuffer()
    const audio = await new Ctx(2, 1, SR).decodeAudioData(buf)
    const a = audio.getChannelData(0), b = audio.numberOfChannels > 1 ? audio.getChannelData(1) : a
    const from = Math.round(p.s * SR), n = Math.max(0, Math.min(Math.round((p.e - p.s) * SR), a.length - from))
    for (let i = 0; i < n; i++) {
      const g = Math.min(1, i / FADE, (n - i) / FADE)
      L[at + i] = a[from + i] * g
      R[at + i] = b[from + i] * g
    }
    at += n
    onProgress((k + 1) / parts.length * 0.9)
  }
  const wav = toWav(L.subarray(0, at), R.subarray(0, at))
  onProgress(1)
  const safe = name.replace(/[\\/:*?"<>|]/g, ' ').trim() || tx("온음 편집곡")
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
  return { where: `${safe}.wav`, url, file: `${safe}.wav` }
}

export function toWav(L: Float32Array, R: Float32Array): ArrayBuffer {
  const n = L.length, bytes = n * 4
  const b = new ArrayBuffer(44 + bytes), v = new DataView(b)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true)
  v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, bytes, true)
  let o = 44
  for (let i = 0; i < n; i++) {
    v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); o += 2
    v.setInt16(o, Math.max(-1, Math.min(1, R[i])) * 32767, true); o += 2
  }
  return b
}
