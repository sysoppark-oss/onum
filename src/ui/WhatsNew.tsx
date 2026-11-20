// 새로워진 점: 업데이트 뒤 한 번, 그리고 쉼에서 언제든
import { ACTS_1_8, CURRENT, NOTES, STAGES } from '../lib/version'
import { Page } from './Sheets'
import { useKjv } from '../lib/kjv'

export function WhatsNew({ onClose }: { onClose: () => void }) {
  const kjv = useKjv()
  return (
    <Page label="새로워진 점" onClose={onClose}>
      <div className="wn-top">
        <p className="wn-v"><span className="num">온음 {CURRENT.v}</span> · {CURRENT.name}</p>
        <ol className="stages" aria-label="온음이 걸어갈 길">
          {STAGES.map((s) => (
            <li key={s.v} className={s.v === CURRENT.v ? 'on' : undefined} aria-current={s.v === CURRENT.v ? 'step' : undefined}>
              <i aria-hidden="true" /><b>{s.name}</b><span className="num">{s.v}</span>
            </li>
          ))}
        </ol>
      </div>
      <blockquote className="wn-q"><p>{ACTS_1_8.text}</p><cite>{ACTS_1_8.ref} · 개역한글</cite>{kjv && ACTS_1_8.en && <><p className="q-en" lang="en">{ACTS_1_8.en}</p><cite lang="en">{ACTS_1_8.enRef} · KJV</cite></>}</blockquote>
      <h3 className="sub">새로워진 점</h3>
      <ul className="wn-list">
        {NOTES.items.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <button className="go" onClick={onClose}>확인</button>
    </Page>
  )
}
