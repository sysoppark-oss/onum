// 처음 켤 때: 음악 찾기 → 찾은 곡 수와 가져올 폴더
import { rt } from './rich'
import { useEffect, useMemo, useState } from 'react'
import { scanFiles, type ScanResult, type Track } from '../lib/library'
import { isNative, scanDevice } from '../lib/native'
import { load, save } from '../lib/store'
import { NAME } from '../lib/verses'
import { shown, useKjv } from '../lib/kjv'
import { classify, loadOverrides } from '../lib/kind'
import { Icon, nf } from './common'
import { LANGS, lang, setLang, tx } from "../lib/i18n";
import { Page } from './Sheets'

// 마우스를 쓰는 넓은 화면이면 PC로 본다
export const isPC = !isNative && window.matchMedia('(pointer: fine) and (min-width: 700px)').matches

function NameLine() {
  const v = shown(NAME, useKjv())
  return <p className="name" lang={v.lang}>{tx("온음 · ")}{v.text} <span>({v.ref})</span></p>
}

/** 폴더마다 곡 수, 고르기 */
export function FolderList({ tracks, hidden, onToggle }: { tracks: Track[]; hidden: string[]; onToggle: (f: string) => void }) {
  const folders = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tracks) m.set(t.folder, (m.get(t.folder) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [tracks])
  return (
    <ul className="folders-l">
      {folders.map(([f, n]) => {
        const on = !hidden.includes(f)
        return (
          <li key={f}>
            <button className={'fl' + (on ? ' on' : '')} role="checkbox" aria-checked={on} onClick={() => onToggle(f)}>
              <span className="cb" aria-hidden="true">{on && <Icon n="check" s={16} w={2.8} />}</span>
              <span className="fn">{f || tx("이름 없는 폴더")}</span>
              <span className="num">{nf.format(n)}{tx("곡")}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function FirstScreen({ onDone }: { onDone: (r: ScanResult, hidden: string[]) => void }) {
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [found, setFound] = useState<ScanResult | null>(null)
  const [hidden, setHidden] = useState<string[]>(() => load('hiddenFolders', []))

  async function findOnDevice(auto = false) {
    setError('')
    setBusy({ done: 0, total: 0 })
    try {
      const r = await scanDevice()
      // 이미 한 번 고른 적이 있으면 바로 들어간다
      if (auto && r.tracks.length) { onDone(r, hidden); return }
      setFound(r)
    } catch (e) {
      setError(String(e).includes('permission') ? tx("음악을 찾으려면 \"음악 및 오디오\" 접근을 허용해 주세요.") : tx("음악을 찾지 못했어요. 다시 눌러 보세요."))
    }
    setBusy(null)
  }

  // 한 번 허락받은 뒤에는 켤 때마다 저절로 다시 찾는다
  useEffect(() => {
    if (isNative && load('scanned', false)) findOnDevice(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pick(list: FileList | null) {
    if (!list || !list.length) return
    setBusy({ done: 0, total: list.length })
    const r = await scanFiles([...list], (done, total) => setBusy({ done, total }))
    setBusy(null)
    // 폴더를 더 고르면 앞에 찾은 곡에 더한다
    setFound((old) => {
      if (!old) return r
      const have = new Set(old.tracks.map((t) => t.id))
      return {
        tracks: [...old.tracks, ...r.tracks.filter((t) => !have.has(t.id))].sort((a, b) => a.title.localeCompare(b.title, 'ko')),
        skippedShort: old.skippedShort + r.skippedShort,
        skippedFolder: old.skippedFolder + r.skippedFolder,
      }
    })
  }

  const toggle = (f: string) => setHidden((h) => (h.includes(f) ? h.filter((x) => x !== f) : [...h, f]))
  const kept = useMemo(() => (found ? found.tracks.filter((t) => !hidden.includes(t.folder)) : []), [found, hidden])
  const talkN = useMemo(() => classify(kept, loadOverrides()).size, [kept])
  const count = kept.length
  const start = () => {
    if (!found) return
    save('hiddenFolders', hidden)
    if (isNative) save('scanned', true)
    onDone(found, hidden)
  }
  const pickers = (more: boolean) => (
    <>
      <label className={more ? 'morefolder pick' : 'go pick'}>
        {more && <Icon n="plus" s={18} />}{more ? tx("다른 폴더 고르기") : tx("음악 폴더 고르기")}
        <input type="file" className="sr" multiple
          // @ts-expect-error 폴더 고르기는 표준 속성이 아님
          webkitdirectory="" onChange={(e) => pick(e.target.files)} />
      </label>
      {!more && (
        <label className="ghost pick">
          {tx("파일 직접 고르기")}<input type="file" className="sr" multiple accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg" onChange={(e) => pick(e.target.files)} />
        </label>
      )}
    </>
  )

  if (busy) {
    return (
      <div className="page first" role="status">
        <p className="mark">{tx("온음")}</p>
        <div className="found-big">
          <p className="fb-t">{busy.total ? tx("음악을 정리하고 있어요") : isNative ? tx("휴대폰에서 음악을 찾고 있어요") : tx("음악을 읽고 있어요")}</p>
          {busy.total > 0 && <p className="fb-s num">{nf.format(busy.done)} / {nf.format(busy.total)}</p>}
          <div className="prog"><span style={{ width: busy.total ? `${(busy.done / busy.total) * 100}%` : '30%' }} className={busy.total ? '' : 'indet'} /></div>
        </div>
      </div>
    )
  }

  if (found && found.tracks.length) {
    const skipped = found.skippedShort + found.skippedFolder
    return (
      <div className="page first">
        <p className="mark">{tx("온음")}</p>
        <div className="found-big">
          <p className="fb-n num">{nf.format(count - talkN)}<span>{tx("곡")}</span></p>
          <h1 className="fb-t">{isNative ? tx("휴대폰에서 음악을 찾았어요") : tx("음악을 찾았어요")}</h1>
          {talkN > 0 && <p className="fb-k num">{tx("강의 {0}개는 따로 모았어요", nf.format(talkN))}</p>}
          <p className="fb-s">{skipped > 0 ? tx("통화 녹음, 음성 메모, 30초보다 짧은 소리 {0}개는 빼 두었어요.", nf.format(skipped)) : tx("통화 녹음, 음성 메모, 30초보다 짧은 소리는 빼 두었어요.")}</p>
        </div>
        <div className="folders">
          <h2 className="sub">{tx("가져올 폴더")}</h2>
          <FolderList tracks={found.tracks} hidden={hidden} onToggle={toggle} />
          {!isNative && pickers(true)}
        </div>
        <div className="first-end">
          <button className="go" disabled={!count} onClick={start}>{tx("듣기 시작")}</button>
          <NameLine />
        </div>
      </div>
    )
  }

  return (
    <div className="page first">
      <div className="first-top">
        <p className="mark">{tx("온음")}</p>
        <div className="langpick" role="radiogroup" aria-label="Language · 언어 · 言語">
          {LANGS.map((l) => <button key={l.id} role="radio" lang={l.id} aria-checked={lang === l.id} className={lang === l.id ? 'on' : undefined} onClick={() => lang !== l.id && setLang(l.id)}>{l.name}</button>)}
        </div>
      </div>
      <div className="found-big">
        <h1 className="fb-h">{isNative ? rt("휴대폰 속 음악을\n찾아 올게요") : rt(isPC ? "이 컴퓨터의 음악을\n불러올게요" : "이 기기의 음악을\n불러올게요")}</h1>
        <p className="fb-s">{tx("음악 파일은 이 기기 밖으로 나가지 않아요. 광고도, 회원 가입도 없어요.")}</p>
        {found && <p className="ferr" role="alert">{tx("음악 파일을 찾지 못했어요. ")}{isNative ? tx("휴대폰에 음악 파일이 있는지 확인해 주세요.") : tx("다른 폴더를 골라 보세요.")}</p>}
        {error && <p className="ferr" role="alert">{error}</p>}
      </div>
      <div className="first-end">
        {isNative ? <button className="go" onClick={() => findOnDevice()}>{tx("음악 찾기 시작")}</button> : <div className="stack">{pickers(false)}</div>}
        {!isNative && !isPC && <p className="hint">{tx("버튼을 눌러도 아무 창이 뜨지 않으면, 오른쪽 위 ⋮ 메뉴에서 크롬 같은 브라우저로 열어 주세요.")}</p>}
        <NameLine />
      </div>
    </div>
  )
}

/** 쉼 › 가져올 폴더 */
export function FoldersPage({ tracks, hidden, setHidden, onClose }: { tracks: Track[]; hidden: string[]; setHidden: (h: string[]) => void; onClose: () => void }) {
  const toggle = (f: string) => {
    const next = hidden.includes(f) ? hidden.filter((x) => x !== f) : [...hidden, f]
    // 하나도 안 남기는 건 막는다
    if (tracks.every((t) => next.includes(t.folder))) return
    setHidden(next)
    save('hiddenFolders', next)
  }
  return (
    <Page label={tx("가져올 폴더")} onClose={onClose}>
      <p className="hint">{tx("빼 둔 폴더의 곡은 음악·목록에 나오지 않아요. 파일은 지워지지 않아요.")}</p>
      <FolderList tracks={tracks} hidden={hidden} onToggle={toggle} />
    </Page>
  )
}
