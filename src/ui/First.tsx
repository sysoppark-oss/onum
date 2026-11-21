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
import { appLink, lineOf, link, useChurch } from '../lib/church'
import { CardMark } from './Church'
import { AI_MB, aiAsked, aiOn, downloadAi, refreshAi, setAiAsked } from '../lib/ai'

// 마우스를 쓰는 넓은 화면이면 PC로 본다
const APK = 'https://github.com/sysoppark-oss/onum/releases/download/test-build/onum-test.apk'
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
  const [offer, setOffer] = useState(false)
  const church = useChurch()
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
  const start = async () => {
    if (!found) return
    save('hiddenFolders', hidden)
    if (isNative) save('scanned', true)
    // 설치형 앱은 처음 한 번, 가사 저절로 맞추기 기능을 받을지 묻는다
    if (aiOn && !aiAsked() && (await refreshAi())?.ok) { setOffer(true); return }
    onDone(found, hidden)
  }
  const answer = (yes: boolean) => {
    setAiAsked()
    if (yes) downloadAi()
    if (found) onDone(found, hidden)
  }
  const pickers = (more: boolean, second = false) => (
    <>
      <label className={more ? 'morefolder pick' : second ? 'ghost pick' : 'go pick'}>
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

  if (offer) {
    return (
      <div className="page first">
        <Mark />
        <div className="found-big">
          <span className="ai-mark" aria-hidden="true"><Icon n="spark" s={30} /></span>
          <h1 className="fb-t">{rt("가사를 저절로 맞추는 기능을\n받아 둘까요?")}</h1>
          <p className="fb-s">{tx("가사를 넣어 두면 노래를 듣고 줄마다 시각을 찾아, 노래방처럼 지금 부르는 줄을 따라가요.")}</p>
        </div>
        <ul className="ai-facts">
          <li><b className="num">{tx("약 {0}MB", AI_MB)}</b><span>{tx("한 번만 받아요 · 와이파이에서 받기를 권해요")}</span></li>
          <li><b>{tx("휴대폰 안에서만")}</b><span>{tx("노래와 가사를 어디에도 보내지 않아요")}</span></li>
          <li><b>{tx("언제든 바꿔요")}</b><span>{tx("쉼 › 보기에서 받거나 지울 수 있어요")}</span></li>
        </ul>
        <div className="first-end">
          <button className="go" onClick={() => answer(true)}>{tx("받기")}</button>
          <button className="ghost" onClick={() => answer(false)}>{tx("나중에")}</button>
        </div>
      </div>
    )
  }

  if (busy) {
    return (
      <div className="page first" role="status">
        <Mark />
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
        <Mark />
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

  // 카드 링크로 들어온 분: 안내 페이지 대신 빈 플레이어에서 바로 시작
  if (church) {
    const kakao = !isNative && /KAKAOTALK/i.test(navigator.userAgent)
    const android = !isNative && /Android/i.test(navigator.userAgent)
    return (
      <div className="page first wp">
        <div className="wp-top"><CardMark c={{ ...church, line: lineOf(church) }} size="bar" /></div>
        <div className="wp-art" aria-hidden="true"><Icon n="note" s={56} /></div>
        <h1 className="wp-t">{tx("음악을 불러오면 바로 들을 수 있어요")}</h1>
        <p className="wp-s">{isNative ? tx("휴대폰 속 음악을 찾아 담아 둘게요. 음악 파일은 휴대폰 밖으로 나가지 않아요.") : tx("광고도, 회원 가입도 없어요. 음악 파일은 이 기기 밖으로 나가지 않아요.")}</p>
        {found && <p className="ferr" role="alert">{tx("음악 파일을 찾지 못했어요. ")}{isNative ? tx("휴대폰에 음악 파일이 있는지 확인해 주세요.") : tx("다른 폴더를 골라 보세요.")}</p>}
        {error && <p className="ferr" role="alert">{error}</p>}
        <div className="first-end">
          {isNative
            ? <button className="go" onClick={() => findOnDevice()}>{tx("음악 불러오기")}</button>
            : android
              ? <>
                  <a className="go" href={`intent://c/${appLink(church).slice(9)}#Intent;scheme=onum;package=org.onum.player;S.browser_fallback_url=${encodeURIComponent(APK)};end`}>{tx("온음 앱 받기 · 열기")}</a>
                  <p className="wp-note">{tx("앱은 휴대폰 속 음악을 저절로 찾아요. 앱을 설치한 뒤 이 버튼을 한 번 더 누르면 카드와 함께 열려요.")}</p>
                  {kakao
                    ? <a className="ghost" href={'kakaotalk://web/openExternal?url=' + encodeURIComponent(link(church))}>{tx("크롬에서 열어 웹으로 듣기")}</a>
                    : pickers(false, true)}
                </>
              : <div className="stack">{pickers(false)}</div>}
          <div className="wp-lang">
            <div className="langpick" role="radiogroup" aria-label="Language · 언어 · 言語">
              {LANGS.map((l) => <button key={l.id} role="radio" lang={l.id} aria-checked={lang === l.id} className={lang === l.id ? 'on' : undefined} onClick={() => lang !== l.id && setLang(l.id)}>{l.name}</button>)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page first">
      <div className="first-top">
        <Mark />
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

/** 교회 카드로 받은 분께: 「생명샘교회가 드리는」 + 온음 */
function Mark() {
  const ch = useChurch()
  return ch
    ? <p className="gift"><CardMark c={{ ...ch, line: lineOf(ch) }} /></p>
    : <p className="mark">{tx("온음")}</p>
}
