// 소리 맞춤(EQ): 음악과 강의를 따로. 고르는 대로 바로 들린다.
import { useState } from 'react'
import { BAND_NAMES, PRESETS, gainsOf, setEq, useEq, type EqFor } from '../lib/eq'
import { Page } from './Sheets'

export function eqLabel(id: string): string {
  return id === 'custom' ? '직접 맞춤' : PRESETS.find((p) => p.id === id)?.name ?? '그대로'
}

export function EqPage({ onClose, start = 'music' }: { onClose: () => void; start?: EqFor }) {
  const all = useEq()
  const [k, setK] = useState<EqFor>(start)
  const cur = all[k]
  const g = gainsOf(cur)
  const setBand = (i: number, v: number) => {
    const n = [...g]
    n[i] = v
    setEq(k, { id: 'custom', g: n })
  }
  return (
    <Page label="소리 맞춤" onClose={onClose}>
      <div className="seg2 eqfor" role="radiogroup" aria-label="어디에 쓸까요">
        <button role="radio" aria-checked={k === 'music'} className={k === 'music' ? 'on' : undefined} onClick={() => setK('music')}>음악</button>
        <button role="radio" aria-checked={k === 'talk'} className={k === 'talk' ? 'on' : undefined} onClick={() => setK('talk')}>강의</button>
      </div>
      <p className="hint eqhint">{k === 'music' ? '모든 음악에 쓰여요.' : '강의·설교·오디오북에 쓰여요. 「목소리 또렷하게」를 많이 써요.'} 고르는 대로 바로 들려요.</p>
      <ul className="eqp" role="radiogroup" aria-label="소리 맞춤 고르기">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <button role="radio" aria-checked={cur.id === p.id} className={'dp-row' + (cur.id === p.id ? ' on' : '')} onClick={() => setEq(k, { id: p.id, g: p.g })}>
              <span className="dp-dot" aria-hidden="true" />
              <span className="x"><span className="x1">{p.name}</span><span className="x2">{p.sub}</span></span>
              <EqMini g={p.g} />
            </button>
          </li>
        ))}
        <li>
          <button role="radio" aria-checked={cur.id === 'custom'} className={'dp-row' + (cur.id === 'custom' ? ' on' : '')} onClick={() => setEq(k, { id: 'custom', g })}>
            <span className="dp-dot" aria-hidden="true" />
            <span className="x"><span className="x1">직접 맞추기</span><span className="x2">다섯 소리 높이를 하나씩</span></span>
          </button>
        </li>
      </ul>
      {cur.id === 'custom' && (
        <div className="eqs" role="group" aria-label="직접 맞추기">
          {BAND_NAMES.map((n, i) => (
            <label key={n} className="eqb">
              <span className="eqn">{n}</span>
              <input type="range" min={-8} max={8} step={1} value={g[i]} onChange={(e) => setBand(i, Number(e.target.value))}
                aria-valuetext={`${n} ${g[i] > 0 ? '+' : ''}${g[i]}데시벨`} style={{ '--p': `${((g[i] + 8) / 16) * 100}%` } as React.CSSProperties} />
              <span className="eqv num">{g[i] > 0 ? '+' : g[i] < 0 ? '−' : ''}{Math.abs(g[i])}</span>
            </label>
          ))}
        </div>
      )}
      <p className="hint">소리 맞춤을 쓰는 동안은 휴대폰이 소리를 한 번 더 다듬어요. 화면이 꺼진 뒤 끊기면 「그대로」로 돌려 주세요.</p>
    </Page>
  )
}

/** 다섯 대역 모양 작게 */
function EqMini({ g }: { g: number[] }) {
  return (
    <span className="eqmini" aria-hidden="true">
      {g.map((v, i) => <i key={i} style={{ height: `${50 + v * 6}%` }} />)}
    </span>
  )
}
