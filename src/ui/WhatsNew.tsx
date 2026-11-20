// 새로워진 점: 업데이트 뒤 한 번, 그리고 쉼에서 언제든
import { ACTS_1_8, CURRENT, NOTES, STAGES } from '../lib/version'
import { Page } from './Sheets'
import { tx } from "../lib/i18n";
import { shown, useKjv } from '../lib/kjv'

export function WhatsNew({ onClose }: { onClose: () => void }) {
  const q = shown(ACTS_1_8, useKjv())
  return (
    <Page label={tx("새로워진 점")} onClose={onClose}>
      <div className="wn-top">
        <p className="wn-v"><span className="num">{tx("온음 ")}{CURRENT.v}</span> · {CURRENT.name}</p>
        <ol className="stages" aria-label={tx("온음이 걸어갈 길")}>
          {STAGES.map((s) => (
            <li key={s.v} className={s.v === CURRENT.v ? 'on' : undefined} aria-current={s.v === CURRENT.v ? 'step' : undefined}>
              <i aria-hidden="true" /><b>{s.name}</b><span className="num">{s.v}</span>
            </li>
          ))}
        </ol>
      </div>
      <blockquote className={'wn-q' + (q.lang === 'en' ? ' en-v' : '')} lang={q.lang}><p>{q.text}</p><cite>{q.ref} · {q.ver}</cite></blockquote>
      <h3 className="sub">{tx("새로워진 점")}</h3>
      <ul className="wn-list">
        {NOTES.items.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <button className="go" onClick={onClose}>{tx("확인")}</button>
    </Page>
  )
}
