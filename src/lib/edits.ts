// 내 편집곡: 여러 곡의 마음에 드는 구간을 이어 붙인 것. 원본 파일은 건드리지 않고
// "어느 곡의 몇 초부터 몇 초까지"만 기억한다(이 기기에만).
import { useState } from 'react'
import type { Track } from './library'
import { load, save } from './store'
import { parseTitle } from './title'

export interface Part { tid: string; s: number; e: number }
export interface Edit { id: string; name: string; parts: Part[]; at: number }

export function useEdits() {
  const [items, setItems] = useState<Edit[]>(() => load<Edit[]>('edits', []))
  const update = (fn: (old: Edit[]) => Edit[]) => setItems((old) => { const n = fn(old); save('edits', n); return n })
  const edit = (id: string, fn: (e: Edit) => Edit) => update((old) => old.map((x) => (x.id === id ? fn(x) : x)))
  return {
    items,
    create(name: string, parts: Part[] = []) {
      const id = `${Date.now()}`
      update((old) => [...old, { id, name, parts, at: Date.now() }])
      return id
    },
    rename(id: string, name: string) { edit(id, (x) => ({ ...x, name })) },
    addPart(id: string, p: Part) { edit(id, (x) => ({ ...x, parts: [...x.parts, p] })) },
    setPart(id: string, k: number, p: Part) { edit(id, (x) => ({ ...x, parts: x.parts.map((q, i) => (i === k ? p : q)) })) },
    removePart(id: string, k: number) { edit(id, (x) => ({ ...x, parts: x.parts.filter((_, i) => i !== k) })) },
    movePart(id: string, k: number, d: 1 | -1) {
      edit(id, (x) => {
        const j = k + d
        if (j < 0 || j >= x.parts.length) return x
        const parts = [...x.parts]
        ;[parts[k], parts[j]] = [parts[j], parts[k]]
        return { ...x, parts }
      })
    },
    remove(id: string) { update((old) => old.filter((x) => x.id !== id)) },
  }
}
export type Edits = ReturnType<typeof useEdits>

/** 편집곡을 재생기가 트는 구간 곡들로. 원래 곡이 없어진 구간은 뺀다 */
export function partTracks(ed: Edit, byId: Map<string, Track>): Track[] {
  const ok = ed.parts.map((p) => ({ p, t: byId.get(p.tid) })).filter((x): x is { p: Part; t: Track } => !!x.t)
  return ok.map(({ p, t }, k) => ({
    ...t,
    id: `edit:${ed.id}#${k}`,
    src: t.id,
    title: ed.name,
    artist: `내 편집곡 · ${k + 1}/${ok.length}`,
    album: '',
    talk: false,
    clip: { s: p.s, e: p.e },
    edit: { id: ed.id, k, n: ok.length, from: parseTitle(t.title).song || t.title },
    duration: t.duration,
  }))
}
export const editLength = (ed: Edit) => ed.parts.reduce((a, p) => a + Math.max(0, p.e - p.s), 0)
