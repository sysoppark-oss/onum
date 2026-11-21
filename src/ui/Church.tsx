// 카드: 교회 이름(「생명샘교회에서 드리는 온음」)·선물·축하·커플(「강빛 ♥ 주빛」)
// 보기(네이버에서 교회 보기·QR 나누기) · 만들기 · 고치기(처음 만든 분의 비밀번호) · 받은 카드 넣기
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Share } from '@capacitor/share'
import { answer, appLink, bad, cardText, code, create, edit, joint, kindOf, LIMIT, lineOf, link, naverUrl, setChurch, unlock, useChurch, useIncoming, type CardInput, type Church, type Kind } from '../lib/church'
import { isNative, openWeb } from '../lib/native'
import { tx } from '../lib/i18n'
import { Icon, Sheet } from './common'
import { Page } from './Sheets'

type Mode = 'view' | 'make' | 'unlock' | 'edit'


/** 이름 서명: bar = 지금 화면 맨 위 한 줄, big = 카드·첫 화면 */
export function CardMark({ c, size = 'big' }: { c: Pick<Church, 'name' | 'line' | 'kind' | 'q'>; size?: 'bar' | 'big' }) {
  const kind = c.kind ?? 'church'
  const line = c.line ?? (kind === 'church' ? '에서 드리는 온음' : '')
  const partner = kind === 'couple' ? c.q ?? '' : ''
  return (
    <span className={'cm cm-' + size + (kind === 'couple' ? ' couple' : '')}>
      <span className="cm-names">
        <b>{c.name}</b>
        {kind === 'couple' && <><span className="cm-heart" role="img" aria-label={tx("와")}><Icon n="heart" s={size === 'bar' ? 16 : 22} w={2.4} /></span><b>{partner}</b></>}
      </span>
      {line && <span className="cm-line">{kind === 'couple' ? '' : joint(line)}{line}</span>}
    </span>
  )
}

const KIND_LAB: Record<Kind, string> = { church: "우리 교회", gift: "선물", couple: "우리 둘" }

export function ChurchPage({ onClose }: { onClose: () => void }) {
  const ch = useChurch()
  const [mode, setMode] = useState<Mode>(ch ? 'view' : 'make')
  const [key, setKey] = useState<Uint8Array | null>(null)
  const title = mode === 'make' ? tx("카드 만들기") : mode === 'view' ? tx("카드") : tx("카드 고치기")
  return (
    <Page label={title} onClose={onClose}>
      {mode === 'view' && ch && <ChurchView c={ch} onEdit={() => setMode('unlock')} onRemove={() => { setChurch(null); onClose() }} />}
      {mode === 'make' && <ChurchForm onDone={async (v, pw) => { setChurch(await create(v, pw!)); setMode('view') }} />}
      {mode === 'unlock' && ch && <Unlock c={ch} onOk={(k) => { setKey(k); setMode('edit') }} />}
      {mode === 'edit' && ch && key && <ChurchForm init={ch} onDone={async (v) => { setChurch(edit(ch, v, key)); setKey(null); setMode('view') }} />}
    </Page>
  )
}

/** 카드 겉모습: 이름이 주인공 */
export function ChurchCard({ c, foot }: { c: Church; foot?: React.ReactNode }) {
  const kind = kindOf(c)
  return (
    <div className={'chc ' + kind}>
      <p className="chc-k">{tx(KIND_LAB[kind])}</p>
      <h3 className="chc-n"><CardMark c={{ ...c, line: lineOf(c) }} /></h3>
      {foot}
    </div>
  )
}

function ChurchView({ c, onEdit, onRemove }: { c: Church; onEdit: () => void; onRemove: () => void }) {
  const [qr, setQr] = useState('')
  const [sent, setSent] = useState('')
  const [sure, setSure] = useState(false)
  const url = link(c)
  const kind = kindOf(c)
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#111111', light: '#ffffff' } }).then(setQr).catch(() => setQr(''))
  }, [url])
  const words = cardText(c)
  const share = async () => {
    const text = tx("「{0}」 — 무료 음악 앱 「온음」에 담았어요. 누르면 열려요.", words) + '\n' + url
    try {
      if (isNative) await Share.share({ title: words, text })
      else if (navigator.share) await navigator.share({ title: words, text })
      else { await navigator.clipboard.writeText(text); setSent(tx("링크를 복사했어요")) }
    } catch { /* 닫음 */ }
  }
  const android = !isNative && /Android/i.test(navigator.userAgent)
  return (
    <div className="chv">
      <ChurchCard c={c} />
      {kind === 'church' && <NaverBtn c={c} />}

      <h2 className="sub">{kind === 'church' ? tx("성도들에게 나누기") : tx("QR·링크로 보내기")}</h2>
      <figure className="chq">
        <div className="chq-box" role="img" aria-label={tx("카드 QR 코드")} dangerouslySetInnerHTML={{ __html: qr }} />
        <figcaption>{tx("휴대폰 카메라로 찍으면 이 카드가 열려요")}</figcaption>
      </figure>
      <button className="go" onClick={share}><Icon n="share" s={20} />{tx("링크 보내기")}</button>
      {sent && <p className="chv-note" role="status">{sent}</p>}
      {android && <a className="ghost" href={`intent://c/${appLink(c).slice(9)}#Intent;scheme=onum;package=org.onum.player;end`}>{tx("휴대폰 앱에 넣기")}</a>}

      <div className="chv-foot">
        <p className="chv-code">{tx("확인 번호")} <span className="num">{code(c)}</span></p>
        <p className="chv-note">{tx("같은 카드는 확인 번호가 같아요.")}</p>
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

// 고르는 모양: 종류마다 이어지는 말을 미리 채워 둔다(고쳐 쓸 수 있음)
const PRESETS: { id: string; label: string; kind: Kind; name: string; line: string; q?: string }[] = [
  { id: 'church', label: "교회", kind: 'church', name: "예) 생명샘교회", line: "에서 드리는 온음", q: "예) 생명샘교회 평창" },
  { id: 'gift', label: "선물", kind: 'gift', name: "예) 주빛", line: "에게 보내는 선물" },
  { id: 'heart', label: "마음", kind: 'gift', name: "예) 강빛이가", line: "주빛을 사랑하며" },
  { id: 'cheer', label: "축하", kind: 'gift', name: "예) 주빛", line: "의 생일을 축하해요" },
  { id: 'couple', label: "커플", kind: 'couple', name: "예) 강빛", line: "함께 듣는 온음", q: "예) 주빛" },
]
type Preset = typeof PRESETS[number]
const presetOf = (c?: Church): Preset => {
  if (!c) return PRESETS[0]
  const k = kindOf(c)
  return PRESETS.find((p) => p.kind === k && tx(p.line) === lineOf(c)) ?? PRESETS.find((p) => p.kind === k)!
}
const sample = (s?: string) => (s ? tx(s).replace(/^예\)\s*|^e\.g\.\s*|^例\)\s*/, '') : '')

function ChurchForm({ init, onDone }: { init?: Church; onDone: (v: CardInput, pw?: string) => Promise<void> }) {
  const [pre, setPre] = useState<Preset>(presetOf(init))
  const [v, setV] = useState<CardInput>({ kind: init ? kindOf(init) : 'church', name: init?.name ?? '', line: init ? lineOf(init) : tx(PRESETS[0].line), q: init?.q ?? '' })
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState('')
  const [err, setErr] = useState<'' | 'name' | 'q' | 'lure' | 'pw' | 'pw2'>('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  const pick = (p: Preset) => {
    // 이어지는 말을 손대지 않았으면 새 종류의 말로 바꾼다
    const touched = v.line.trim() && !PRESETS.some((x) => tx(x.line) === v.line)
    setPre(p)
    setV({ ...v, kind: p.kind, line: touched ? v.line : tx(p.line), q: p.kind === v.kind ? v.q : '' })
    setErr('')
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!v.name.trim()) { setErr('name'); first.current?.focus(); return }
    if (v.kind === 'couple' && !v.q.trim()) { setErr('q'); return }
    if ([v.name, v.line, v.q].some(bad)) { setErr('lure'); return }
    if (!init) {
      if (pw.length < 4) { setErr('pw'); return }
      if (pw !== pw2) { setErr('pw2'); return }
    }
    setBusy(true)
    try { await onDone(v, pw) } finally { setBusy(false) }
  }
  const f = (k: keyof CardInput) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setErr('') }
  const nameLabel = v.kind === 'church' ? tx("교회 이름") : v.kind === 'couple' ? tx("내 이름") : tx("크게 보일 이름")
  return (
    <form className="form chf" onSubmit={submit} noValidate>
      {!init && <p className="chf-lead">{tx("넣은 이름과 말이 온음 화면 맨 위에 크게 보여요. 만든 카드는 QR이나 링크로 보낼 수 있어요.")}</p>}

      <div className="chf-kinds" role="radiogroup" aria-label={tx("카드 종류")}>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={pre.id === p.id} className={pre.id === p.id ? 'on' : undefined} onClick={() => pick(p)}>
            {p.kind === 'couple' && <Icon n="heart" s={16} w={2.4} />}{tx(p.label)}
          </button>
        ))}
      </div>

      <div className="chf-prev" aria-hidden="true">
        <span className="chf-prev-k">{tx("이렇게 보여요")}</span>
        <CardMark c={{ kind: v.kind, name: v.name.trim() || sample(pre.name), line: v.line, q: v.q.trim() || sample(pre.q) }} size="bar" />
      </div>

      <label className="flabel" htmlFor="ch-n">{nameLabel}</label>
      <input id="ch-n" ref={first} className="field" value={v.name} maxLength={LIMIT.name} autoComplete="off" enterKeyHint="next"
        placeholder={tx(pre.name)} aria-invalid={err === 'name'} onChange={f('name')} />
      {err === 'name' && <p className="ferr" role="alert">{tx("이름을 적어 주세요.")}</p>}

      {v.kind === 'couple' && <>
        <label className="flabel" htmlFor="ch-q">{tx("짝 이름")}</label>
        <input id="ch-q" className="field" value={v.q} maxLength={LIMIT.name} autoComplete="off" enterKeyHint="next" placeholder={tx(pre.q!)} aria-invalid={err === 'q'} onChange={f('q')} />
        {err === 'q' && <p className="ferr" role="alert">{tx("짝 이름을 적어 주세요.")}</p>}
      </>}

      <label className="flabel" htmlFor="ch-l">{tx("이어지는 말")}</label>
      <input id="ch-l" className="field" value={v.line} maxLength={LIMIT.line} autoComplete="off" enterKeyHint="next" onChange={f('line')} />

      {v.kind === 'church' && <>
        <label className="flabel" htmlFor="ch-q">{tx("네이버 검색어")} <span className="opt-l">{tx("(비우면 교회 이름)")}</span></label>
        <input id="ch-q" className="field" value={v.q} maxLength={LIMIT.q} autoComplete="off" enterKeyHint={init ? 'done' : 'next'} placeholder={tx(pre.q!)} onChange={f('q')} />
        <p className="chf-note">{tx("「네이버에서 교회 보기」를 누르면 이 말로 바로 검색해요. 같은 이름의 교회가 많으면 지역을 함께 넣어 주세요.")}</p>
      </>}
      {err === 'lure' && <p className="ferr" role="alert">{tx("전화번호·인터넷 주소·메신저는 넣을 수 없어요.")}</p>}

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
      {init && <p className="chf-note">{tx("고친 뒤 새 QR이나 링크를 다시 보내 주세요. 받은 분의 카드가 새것으로 바뀌어요.")}</p>}
    </form>
  )
}

function Unlock({ c, onOk }: { c: Church; onOk: (k: Uint8Array) => void }) {
  const [pw, setPw] = useState('')
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pw) return
    setBusy(true)
    const k = await unlock(c, pw)
    setBusy(false)
    if (k) onOk(k); else setWrong(true)
  }
  return (
    <form className="form chf" onSubmit={submit}>
      <p className="chf-lead">{tx("「{0}」 카드를 처음 만들 때 정한 비밀번호를 넣어 주세요.", c.name)}</p>
      <input className="field" type="password" autoFocus value={pw} autoComplete="current-password" aria-label={tx("비밀번호")} placeholder={tx("비밀번호")}
        aria-invalid={wrong} onChange={(e) => { setPw(e.target.value); setWrong(false) }} />
      {wrong && <p className="ferr" role="alert">{tx("비밀번호가 맞지 않아요.")}</p>}
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
    <Sheet label={tx("카드를 받았어요")} onClose={() => answer(false)}>
      <div className="form">
        <h2 className="q lead">{now ? tx("카드를 바꿀까요?") : tx("카드를 받았어요")}</h2>
        <ChurchCard c={c} />
        <p className="chv-code">{tx("확인 번호")} <span className="num">{code(c)}</span></p>
        {now && <p className="chf-note">{tx("지금 카드 「{0}」 대신 이 카드가 들어가요.", now.name)}</p>}
        <p className="chf-note">{tx("보낸 분을 아실 때만 넣어 주세요.")}</p>
        <button className="go" onClick={() => answer(true)}>{now ? tx("바꾸기") : tx("넣기")}</button>
        <button className="ghost" onClick={() => answer(false)}>{tx("넣지 않기")}</button>
      </div>
    </Sheet>
  )
}

/** 네이버에서 교회 소개·주소·대표 연락처 보기(검색어가 바로 들어간 결과 화면) */
export function NaverBtn({ c }: { c: Church }) {
  return (
    <button className="naver" onClick={() => openWeb(naverUrl(c))}>
      <span className="naver-n" aria-hidden="true">N</span>
      <span className="naver-t"><b>{tx("네이버에서 교회 보기")}</b><span>{tx("교회 소개 · 주소 · 대표 연락처")}</span></span>
      <Icon n="chev" s={18} />
    </button>
  )
}
