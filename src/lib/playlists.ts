import { useState } from 'react'
import { load, save } from './store'
import { tx } from "./i18n";

/** 내가 만든 목록(플레이리스트). 곡은 번호(id)로만 기억하고 이 기기에만 저장한다. */
/** 목록 안에서 곡에 붙이는 색 */
export type Tag = 'green' | 'orange' | 'purple' | 'pink'
export const TAGS: { k: Tag; name: string }[] = [
  { k: 'green', name: tx("초록") }, { k: 'orange', name: tx("주황") }, { k: 'purple', name: tx("보라") }, { k: 'pink', name: tx("분홍") },
]
export const tagName = (k?: Tag) => TAGS.find((x) => x.k === k)?.name ?? ''
export interface Playlist { id: string; name: string; ids: string[]; memo?: string; tags?: Record<string, Tag> }

export function usePlaylists() {
  const [items, setItems] = useState<Playlist[]>(() => load<Playlist[]>('playlists', []))
  const update = (fn: (old: Playlist[]) => Playlist[]) =>
    setItems((old) => { const next = fn(old); save('playlists', next); return next })
  const edit = (pid: string, fn: (ids: string[]) => string[]) =>
    update((old) => old.map((p) => (p.id === pid ? { ...p, ids: fn(p.ids) } : p)))

  return {
    items,
    create(name: string, ids: string[] = []) {
      const id = `${Date.now()}`
      update((old) => [...old, { id, name, ids: [...new Set(ids)] }])
      return id
    },
    /** 이미 있는 곡은 다시 넣지 않는다 */
    add(pid: string, ids: string[]) { edit(pid, (old) => [...old, ...ids.filter((x) => !old.includes(x))]) },
    removeTrack(pid: string, tid: string) { edit(pid, (old) => old.filter((x) => x !== tid)) },
    /** 두 곡의 자리를 바꾼다 */
    swap(pid: string, a: string, b: string) {
      edit(pid, (old) => {
        const i = old.indexOf(a), j = old.indexOf(b)
        if (i < 0 || j < 0) return old
        const n = [...old]
        ;[n[i], n[j]] = [n[j], n[i]]
        return n
      })
    },
    rename(pid: string, name: string) { update((old) => old.map((p) => (p.id === pid ? { ...p, name } : p))) },
    setMemo(pid: string, memo: string) { update((old) => old.map((p) => (p.id === pid ? { ...p, memo: memo.trim() || undefined } : p))) },
    setTag(pid: string, tid: string, tag: Tag | null) {
      update((old) => old.map((p) => {
        if (p.id !== pid) return p
        const tags = { ...(p.tags || {}) }
        if (tag) tags[tid] = tag; else delete tags[tid]
        return { ...p, tags }
      }))
    },
    remove(pid: string) { update((old) => old.filter((p) => p.id !== pid)) },
  }
}

export type Playlists = ReturnType<typeof usePlaylists>
