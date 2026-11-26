// 화면을 그리다 오류가 나도 앱 전체가 하얗게 꺼지지 않게 막는다.
// 무슨 오류였는지 화면에 보여 주어, 그 글을 알려 주면 바로 고칠 수 있게 한다. 오류 글은 이 기기에만 남는다.
import { Component, type ReactNode } from 'react'
import { tx } from '../lib/i18n'
import { BUILD } from '../lib/update'

const brief = (e: unknown, extra = '') => {
  const x = e as { message?: string; stack?: string } | null
  const stack = (x?.stack ?? '').split('\n').slice(0, 6).map((l) => l.trim().replace(/https?:\/\/[^/]+\//g, '')).join('\n')
  return `${String(x?.message ?? e).slice(0, 300)}\n${stack}${extra ? '\n' + extra.split('\n').slice(0, 6).map((l) => l.trim()).join('\n') : ''}`.slice(0, 1400)
}
const keep = (text: string) => { try { localStorage.setItem('onum.lastErr', JSON.stringify({ at: Date.now(), sha: BUILD.sha, text })) } catch { /* 저장 못 해도 화면에는 보인다 */ } }

export class Guard extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' }
  static getDerivedStateFromError(e: unknown) { return { err: brief(e) } }
  componentDidCatch(e: unknown, info: { componentStack?: string | null }) {
    const text = brief(e, info.componentStack ?? '')
    keep(text)
    this.setState({ err: text })
  }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="guard" role="alert">
        <h1>{tx("화면을 그리다 문제가 생겼어요")}</h1>
        <p>{tx("음악과 목록은 그대로 있어요. 아래 글을 사진으로 찍어 알려 주시면 고칠 수 있어요.")}</p>
        <pre>{`${BUILD.sha.slice(0, 7)} · ${BUILD.run}\n${this.state.err}`}</pre>
        <button className="go" onClick={() => location.reload()}>{tx("다시 열기")}</button>
      </div>
    )
  }
}
