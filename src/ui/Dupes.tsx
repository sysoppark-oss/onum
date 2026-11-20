// 같은 곡이 여러 개: 그룹마다 남길 곡을 골라 나머지는 온음에서만 빼 둔다(파일은 그대로).
import { useMemo, useState } from 'react'
import { fmt, type Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import type { Group } from '../lib/dupes'
import { info, nf, whoLine } from './common'
import { tx } from "../lib/i18n";
import { Page } from './Sheets'

export interface Hide { ids: string[]; hide: (ids: string[]) => void; showAll: () => void; notSame: (key: string) => void }

function quality(t: Track): string {
  return t.bitrate ? `${Math.round(t.bitrate / 1000)}kbps` : ''
}

export function DupesPage({ groups, player, h, onClose }: { groups: Group[]; player: Player; h: Hide; onClose: () => void }) {
  // 그룹마다 사용자가 고른 남길 곡(처음에는 추천)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [done, setDone] = useState(0)
  const total = useMemo(() => groups.reduce((s, g) => s + g.items.length - 1, 0), [groups])
  return (
    <Page label={tx("같은 곡이 여러 개")} onClose={onClose}>
      <p className="say">{tx("이름과 길이가 같은 곡이에요. 하나만 남기면 나머지는 온음 목록에서만 빠져요. ")}<b>{tx("휴대폰 파일은 지우지 않아요.")}</b></p>
      {done > 0 && groups.length > 0 && <p className="dp-done" role="status">{tx("{0}곡을 빼 두었어요", nf.format(done))}</p>}
      {groups.length === 0 && <p className="empty">{done > 0 ? tx("모두 정리했어요.") : tx("같은 곡이 여러 개인 경우가 없어요.")}</p>}
      {groups.map((g) => {
        const p = info(g.items[0])
        const keep = pick[g.key] ?? g.keep
        return (
          <section key={g.key} className="dp" aria-label={tx("{0}, 같은 곡 {1}개", p.song, g.items.length)}>
            <h3 className="dp-h"><span className="dp-s">{p.song}</span><span className="dp-w">{whoLine(p) || g.items[0].artist}</span></h3>
            <ul role="radiogroup" aria-label={tx("남길 곡 고르기")}>
              {g.items.map((t) => {
                const on = t.id === keep
                const bits = [t.folder, t.duration ? fmt(t.duration) : '', quality(t), player.plays[t.id] ? tx("{0}번 들음", nf.format(player.plays[t.id])) : ''].filter(Boolean)
                return (
                  <li key={t.id}>
                    <button role="radio" aria-checked={on} className={'dp-row' + (on ? ' on' : '')} onClick={() => setPick({ ...pick, [g.key]: t.id })}>
                      <span className="dp-dot" aria-hidden="true" />
                      <span className="x"><span className="x1">{on ? tx("남길 곡") : tx("빼 둘 곡")}</span><span className="x2 num">{bits.join(' · ')}</span></span>
                    </button>
                    <button className="textlink dp-hear" onClick={() => player.playFrom([t], t.id, 0, true)} aria-label={tx("{0}에 있는 파일 들어 보기", t.folder)}>{tx("들어 보기")}</button>
                  </li>
                )
              })}
            </ul>
            <div className="dp-acts">
              <button className="ghost" onClick={() => h.notSame(g.key)}>{tx("다른 곡이에요")}</button>
              <button className="go" onClick={() => { const ids = g.items.filter((t) => t.id !== keep).map((t) => t.id); h.hide(ids); setDone((n) => n + ids.length) }}>{tx("하나만 남기기")}</button>
            </div>
          </section>
        )
      })}
      {groups.length > 1 && <p className="hint num">{tx("모두 {0}가지 · 빼 둘 수 있는 곡 {1}개", nf.format(groups.length), nf.format(total))}</p>}
      {h.ids.length > 0 && (
        <div className="dp-back">
          <p><span className="num">{nf.format(h.ids.length)}</span>{tx("곡을 빼 두었어요")}</p>
          <button className="textlink" onClick={h.showAll}>{tx("모두 다시 보이기")}</button>
        </div>
      )}
    </Page>
  )
}
