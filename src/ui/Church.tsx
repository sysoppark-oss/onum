// 교회 카드: 보기(연락하기·QR 나누기) · 만들기 · 고치기(처음 만든 분의 비밀번호) · 받은 카드 넣기
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Share } from '@capacitor/share'
import { answer, appLink, bad, code, create, edit, LIMIT, link, naverUrl, setChurch, unlock, useChurch, useIncoming, type Church } from '../lib/church'
import { isNative, openWeb } from '../lib/native'
import { tx } from '../lib/i18n'
import { Icon, Sheet } from './common'
import { Page } from './Sheets'

type Mode = 'view' | 'make' | 'unlock' | 'edit'

export function ChurchPage({ onClose }: { onClose: () => void }) {
  const ch = useChurch()
  const [mode, setMode] = useState<Mode>(ch ? 'view' : 'make')
  const [key, setKey] = useState<Uint8Array | null>(null)
  const title = mode === 'make' ? tx("교회 카드 만들기") : mode === 'view' ? tx("교회 카드") : tx("교회 카드 고치기")
  return (
    <Page label={title} onClose={onClose}>
      {mode === 'view' && ch && <ChurchView c={ch} onEdit={() => setMode('unlock')} onRemove={() => { setChurch(null); onClose() }} />}
      {mode === 'make' && <ChurchForm onDone={async (v, pw) => { setChurch(await create(v, pw!)); setMode('view') }} />}
      {mode === 'unlock' && ch && <Unlock c={ch} onOk={(k) => { setKey(k); setMode('edit') }} />}
      {mode === 'edit' && ch && key && <ChurchForm init={ch} onDone={async (v) => { setChurch(edit(ch, v, key)); setKey(null); setMode('view') }} />}
    </Page>
  )
}

/** 카드 겉모습: 이름이 주인공, 주소·전화는 조용히 */
export function ChurchCard({ c, foot }: { c: Church; foot?: React.ReactNode }) {
  return (
    <div className="chc">
      <p className="chc-k">{tx("우리 교회")}</p>
      <h3 className="chc-n">{c.name}</h3>
      <p className="chc-s">{tx("에서 드리는 온음")}</p>
      {foot}
    </div>
  )
}

function ChurchView({ c, onEdit, onRemove }: { c: Church; onEdit: () => void; onRemove: () => void }) {
  const [qr, setQr] = useState('')
  const [sent, setSent] = useState('')
  const [sure, setSure] = useState(false)
  const url = link(c)
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#111111', light: '#ffffff' } }).then(setQr).catch(() => setQr(''))
  }, [url])
  const share = async () => {
    const text = tx("{0}에서 드리는 무료 음악 앱 「온음」이에요. 누르면 열려요.", c.name) + '\n' + url
    try {
      if (isNative) await Share.share({ title: c.name, text })
      else if (navigator.share) await navigator.share({ title: c.name, text })
      else { await navigator.clipboard.writeText(text); setSent(tx("링크를 복사했어요")) }
    } catch { /* 닫음 */ }
  }
  const android = !isNative && /Android/i.test(navigator.userAgent)
  return (
    <div className="chv">
      <ChurchCard c={c} />

      <NaverBtn c={c} />

      <h2 className="sub">{tx("성도들에게 나누기")}</h2>
      <figure className="chq">
        <div className="chq-box" role="img" aria-label={tx("{0} 교회 카드 QR 코드", c.name)} dangerouslySetInnerHTML={{ __html: qr }} />
        <figcaption>{tx("휴대폰 카메라로 찍으면 이 카드가 열려요")}</figcaption>
      </figure>
      <button className="go" onClick={share}><Icon n="share" s={20} />{tx("링크 보내기")}</button>
      {sent && <p className="chv-note" role="status">{sent}</p>}
      {android && <a className="ghost" href={`intent://c/${appLink(c).slice(9)}#Intent;scheme=onum;package=org.onum.player;end`}>{tx("휴대폰 앱에 넣기")}</a>}

      <div className="chv-foot">
        <p className="chv-code">{tx("확인 번호")} <span className="num">{code(c)}</span></p>
        <p className="chv-note">{tx("같은 교회 카드는 확인 번호가 같아요.")}</p>
        <div className="chv-fa">
          <button className="textbtn plain" onClick={onEdit}>{tx("카드 고치기")}</button>
          {sure
            ? <button className="textbtn" onClick={onRemove}>{tx("정말 빼기")}</button>
            : <button className="textbtn plain" onClick={() => setSure(true)}>{tx("이 카드 빼기")}</button>}
        </div>
      </div>
    </div>
  )
}

function ChurchForm({ init, onDone }: { init?: Church; onDone: (v: { name: string; addr: string; tel: string }, pw?: string) => Promise<void> }) {
  const [v, setV] = useState({ name: init?.name ?? '', addr: '', tel: '' })
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState('')
  const [err, setErr] = useState<'' | 'name' | 'lure-n' | 'pw' | 'pw2'>('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { first.current?.focus() }, [])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!v.name.trim()) { setErr('name'); return }
    if (bad(v.name)) { setErr('lure-n'); return }
    if (!init) {
      if (pw.length < 4) { setErr('pw'); return }
      if (pw !== pw2) { setErr('pw2'); return }
    }
    setBusy(true)
    try { await onDone(v, pw) } finally { setBusy(false) }
  }
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setErr('') }
  return (
    <form className="form chf" onSubmit={submit} noValidate>
      {!init && <p className="chf-lead">{tx("교회 이름을 넣으면 온음 화면에 함께 보여요. 만든 카드를 QR이나 링크로 성도들에게 나눠 주세요.")}</p>}
      <label className="flabel" htmlFor="ch-n">{tx("교회 이름")}</label>
      <input id="ch-n" ref={first} className="field" value={v.name} maxLength={LIMIT.name} autoComplete="organization" enterKeyHint={init ? 'done' : 'next'}
        placeholder={tx("예) 생명샘교회")} aria-invalid={err === 'name' || err === 'lure-n'} onChange={f('name')} />
      {err === 'name' && <p className="ferr" role="alert">{tx("교회 이름을 적어 주세요.")}</p>}
      {err === 'lure-n' && <p className="ferr" role="alert">{tx("이름에는 전화번호·인터넷 주소·메신저를 넣을 수 없어요.")}</p>}
      {!init && (
        <fieldset className="chf-pw">
          <legend className="flabel">{tx("고칠 때 쓸 비밀번호")}</legend>
          <p className="chf-note">{tx("이 비밀번호를 아는 분만 카드를 고칠 수 있어요. 잊으면 아무도 고칠 수 없으니 꼭 적어 두세요.")}</p>
          <input className="field" type="password" value={pw} autoComplete="new-password" aria-label={tx("비밀번호")} placeholder={tx("비밀번호(4자 이상)")}
            aria-invalid={err === 'pw'} onChange={(e) => { setPw(e.target.value); setErr('') }} />
          {err === 'pw' && <p className="ferr" role="alert">{tx("비밀번호를 4자 이상 적어 주세요.")}</p>}
          <input className="field" type="password" value={pw2} autoComplete="new-password" aria-label={tx("비밀번호 한 번 더")} placeholder={tx("한 번 더")} enterKeyHint="done"
            aria-invalid={err === 'pw2'} onChange={(e) => { setPw2(e.target.value); setErr('') }} />
          {err === 'pw2' && <p className="ferr" role="alert">{tx("두 비밀번호가 달라요.")}</p>}
        </fieldset>
      )}
      <button className="go" type="submit" disabled={busy}>{busy ? tx("만드는 중…") : init ? tx("고친 카드 저장") : tx("카드 만들기")}</button>
      {init && <p className="chf-note">{tx("고친 뒤 새 QR이나 링크를 다시 나눠 주세요. 받은 분의 카드가 새것으로 바뀌어요.")}</p>}
    </form>
  )
}

function Unlock({ c, onOk }: { c: Church; onOk: (k: Uint8Array) => void }) {
  const [pw, setPw] = useState('')
  const [bad, setBad] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pw) return
    setBusy(true)
    const k = await unlock(c, pw)
    setBusy(false)
    if (k) onOk(k); else setBad(true)
  }
  return (
    <form className="form chf" onSubmit={submit}>
      <p className="chf-lead">{tx("「{0}」 카드를 처음 만들 때 정한 비밀번호를 넣어 주세요.", c.name)}</p>
      <input className="field" type="password" autoFocus value={pw} autoComplete="current-password" aria-label={tx("비밀번호")} placeholder={tx("비밀번호")}
        aria-invalid={bad} onChange={(e) => { setPw(e.target.value); setBad(false) }} />
      {bad && <p className="ferr" role="alert">{tx("비밀번호가 맞지 않아요.")}</p>}
      <button className="go" type="submit" disabled={busy || !pw}>{busy ? tx("확인하는 중…") : tx("다음")}</button>
    </form>
  )
}

/** 링크·QR로 받은 카드를 넣을지 묻는다 */
export function IncomingSheet() {
  const c = useIncoming()
  const now = useChurch()
  if (!c) return null
  return (
    <Sheet label={tx("교회 카드를 받았어요")} onClose={() => answer(false)}>
      <div className="form">
        <h2 className="q lead">{now ? tx("교회 카드를 바꿀까요?") : tx("교회 카드를 받았어요")}</h2>
        <ChurchCard c={c} />
        <p className="chv-code">{tx("확인 번호")} <span className="num">{code(c)}</span></p>
        {now && <p className="chf-note">{tx("지금 카드 「{0}」 대신 이 카드가 들어가요.", now.name)}</p>}
        <p className="chf-note">{tx("교회에서 직접 받은 QR·링크일 때만 넣어 주세요.")}</p>
        <button className="go" onClick={() => answer(true)}>{now ? tx("바꾸기") : tx("넣기")}</button>
        <button className="ghost" onClick={() => answer(false)}>{tx("넣지 않기")}</button>
      </div>
    </Sheet>
  )
}

/** 네이버에서 교회 소개·주소·대표 연락처 보기 */
export function NaverBtn({ c }: { c: Church }) {
  return (
    <button className="naver" onClick={() => openWeb(naverUrl(c))}>
      <span className="naver-n" aria-hidden="true">N</span>
      <span className="naver-t"><b>{tx("네이버에서 교회 보기")}</b><span>{tx("교회 소개 · 주소 · 대표 연락처")}</span></span>
      <Icon n="chev" s={18} />
    </button>
  )
}
