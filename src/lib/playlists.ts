import { useState } from 'react'
import { load, save } from './store'

/** 내가 만든 목록(플레이리스트). 곡은 번호(id)로만 기억하고 이 기기에만 저장한다. */
export interface Playlist { id: string; name: string; ids: string[] }

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
    remove(pid: string) { update((old) => old.filter((p) => p.id !== pid)) },
  }
}

export type Playlists = ReturnType<typeof usePlaylists>
