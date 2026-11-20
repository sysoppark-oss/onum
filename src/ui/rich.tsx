// 번역 문장 안에 굵게·강조·값을 넣는다. 말 순서가 언어마다 달라서 문장을 통째로 번역한다.
//  **굵게**  __강조__  {0} 값  \n 줄바꿈
import type { ReactNode } from 'react'
import { tx } from '../lib/i18n'

function vals(s: string, v: ReactNode[], key: { k: number }): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of s.matchAll(/\{(\d)\}/g)) {
    if (m.index! > last) out.push(s.slice(last, m.index))
    out.push(<span key={key.k++}>{v[Number(m[1])]}</span>)
    last = m.index! + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

export function rt(src: string, ...v: ReactNode[]): ReactNode {
  const s = tx(src)
  const key = { k: 0 }
  const out: ReactNode[] = []
  let last = 0
  for (const m of s.matchAll(/\*\*(.+?)\*\*|__(.+?)__(?:\[(\w+)\])?|\n/g)) {
    if (m.index! > last) out.push(...vals(s.slice(last, m.index), v, key))
    if (m[1] != null) out.push(<b key={key.k++}>{vals(m[1], v, key)}</b>)
    else if (m[2] != null) out.push(<em key={key.k++} className={m[3]}>{vals(m[2], v, key)}</em>)
    else out.push(<br key={key.k++} />)
    last = m.index! + m[0].length
  }
  if (last < s.length) out.push(...vals(s.slice(last), v, key))
  return <>{out}</>
}
