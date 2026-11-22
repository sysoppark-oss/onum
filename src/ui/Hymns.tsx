// 찬송가 반주: 목록 → 곡을 고르면 반주 화면. 조·빠르기·절 수·전주를 고르고 「반주 시작」.
import { useCallback, useEffect, useRef, useState } from 'react'
import { HYMN_CATS, HYMN_DEFAULT, HymnPlayer, keyName, loadHymns, loadPiano, type Hymn, type HymnPos, type HymnSet } from '../lib/hymn'
import type { Player } from '../lib/usePlayer'
import { load, save } from '../lib/store'
import { lang, tx } from '../lib/i18n'
import { Icon } from './common'
import { Page } from './Sheets'

type WL = { release: () => Promise<void> }
/** 연주하는 동안만 화면 꺼짐 막기(화면이 꺼지면 반주가 끊긴다) */
function useWake(on: boolean) {
  useEffect(() => {
    if (!on) return
    let lock: WL | null = null, alive = true
    const get = () => {
      const n = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WL> } }
      n.wakeLock?.request('screen').then((l) => { if (alive) lock = l; else l.release() }).catch(() => {})
    }
    get()
    const vis = () => { if (document.visibilityState === 'visible') get() }
    document.addEventListener('visibilitychange', vis)
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => {}) }
  }, [on])
}

export function HymnsPage({ player, onClose }: { player: Player; onClose: () => void }) {
  const [list, setList] = useState<Hymn[] | null>(null)
  const [tpb, setTpb] = useState(12)
  const [cat, setCat] = useState<string>('')
  const [pick, setPick] = useState<Hymn | null>(null)
  useEffect(() => { loadHymns().then((d) => { setList(d.hymns); setTpb(d.tpb) }); loadPiano().catch(() => {}) }, [])
  const back = useCallback(() => setPick(null), [])
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => { for (let el = top.current?.parentElement; el; el = el.parentElement) { el.scrollTop = 0; if (el.classList.contains('layer')) break } }, [pick])
  const shown = list?.filter((h) => !cat || h.cat === cat) ?? []
  return (
    <Page label={pick ? (lang === 'ko' ? pick.ko : pick.en) : tx("찬송가 반주")} onClose={pick ? back : onClose}>
      <div ref={top} />
      {pick ? <HymnPlay h={pick} tpb={tpb} player={player} /> : (
        <div className="hy">
          <p className="hy-note">{tx("가사 없이 곡조만 피아노로 연주해요. 저작권이 끝난 옛 곡조와 편곡만 담았어요.")}</p>
          <div className="hy-cats" role="radiogroup" aria-label={tx("갈래")}>
            {['', ...HYMN_CATS].map((c) => <button key={c || 'all'} role="radio" aria-checked={cat === c} className={cat === c ? 'on' : undefined} onClick={() => setCat(c)}>{c ? tx(c) : tx("전체")}</button>)}
          </div>
          {!list ? <p className="hy-note">{tx("불러오는 중…")}</p> : (
            <ul className="pl">
              {shown.map((h) => (
                <li key={h.id}><button className="lrow" onClick={() => setPick(h)}>
                  <span className="x"><span className="x1">{lang === 'ko' ? h.ko : h.en}</span><span className="x2">{lang === 'ko' ? h.en : h.tune}</span></span>
                  <Icon n="chev" s={20} />
                </button></li>
              ))}
            </ul>
          )}
          <p className="hy-credit">{tx("악보: Open Hymnal Project(퍼블릭 도메인) · 피아노 소리: Salamander Grand Piano, Alexander Holm(CC BY 3.0)")}</p>
        </div>
      )}
    </Page>
  )
}

function HymnPlay({ h, tpb, player }: { h: Hymn; tpb: number; player: Player }) {
  const key = 'hymn:' + h.id
  const [s, setS] = useState<HymnSet>(() => ({ ...HYMN_DEFAULT, ...load<Partial<HymnSet>>(key, {}) }))
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<HymnPos | null>(null)
  const [err, setErr] = useState('')
  const hp = useRef<HymnPlayer | null>(null)
  useWake(on)
  useEffect(() => () => { hp.current?.stop() }, [])
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => hp.current && setPos(hp.current.pos()), 200)
    return () => window.clearInterval(t)
  }, [on])
  const change = (n: Partial<HymnSet>) => { const x = { ...s, ...n }; setS(x); save(key, x); hp.current?.set(n) }
  const start = async () => {
    if (on) { hp.current?.stop(1.2); setOn(false); setPos(null); return }
    setBusy(true); setErr('')
    if (player.playing) player.pause()
    const p = new HymnPlayer(h, tpb, s); hp.current?.stop(); hp.current = p
    p.onEnd = () => { setOn(false); setPos(null) }
    try { await p.start(); setOn(true) } catch { setErr(tx("피아노 소리를 불러오지 못했어요. 다시 눌러 주세요.")) }
    setBusy(false)
  }
  const bpm = Math.round(h.bpm * s.rate)
  const where = !pos ? '' : pos.part === 'intro' ? tx("전주") : pos.part === 'verse' ? tx("{0}절 / {1}절", pos.verse, s.verses) : tx("마침")
  const total = (s.intro ? 1 : 0) + s.verses
  const done = !pos ? 0 : pos.part === 'intro' ? pos.frac : pos.part === 'verse' ? (s.intro ? 1 : 0) + pos.verse - 1 + pos.frac : total
  return (
    <div className="hy">
      <h2 className="hy-t">{lang === 'ko' ? h.ko : h.en}</h2>
      <p className="hy-sub">{lang === 'ko' && <>{h.en}<br /></>}{h.tune} · {h.by}</p>

      <button className={'go hy-go' + (on ? ' on' : '')} onClick={start} disabled={busy} aria-pressed={on}>
        <Icon n={on ? 'stop' : 'play'} s={22} />{busy ? tx("준비하는 중…") : on ? tx("멈추기") : tx("반주 시작")}
      </button>
      <div className="hy-prog" aria-live="polite">
        <div className="hy-bar"><i style={{ transform: `scaleX(${total ? done / total : 0})` }} /></div>
        <span>{where || tx("전주 {0} · {1}절까지", s.intro ? tx("있음") : tx("없음"), s.verses)}</span>
      </div>
      {err && <p className="hy-err" role="alert">{err}</p>}

      <ul className="pl hy-set">
        <li className="setrow">
          <span className="x"><span className="x1" id="hy-v">{tx("몇 절까지")}</span></span>
          <div className="hy-chips" role="radiogroup" aria-labelledby="hy-v">
            {[1, 2, 3, 4, 5, 6].map((n) => <button key={n} role="radio" aria-checked={s.verses === n} className={s.verses === n ? 'on' : undefined} onClick={() => change({ verses: n })}>{n}</button>)}
          </div>
        </li>
        <li className="setrow hy-step">
          <span className="x"><span className="x1">{tx("조")}</span><span className="x2">{s.semi ? tx("원래 {0} → {1}", keyName(h.key), keyName(h.key, s.semi)) : tx("원래 조 {0}", keyName(h.key))}</span></span>
          <div className="hy-pm">
            <button onClick={() => change({ semi: Math.max(-5, s.semi - 1) })} disabled={s.semi <= -5} aria-label={tx("조 내리기")}><Icon n="minus" s={20} /></button>
            <b className="num">{s.semi > 0 ? '+' + s.semi : s.semi}</b>
            <button onClick={() => change({ semi: Math.min(5, s.semi + 1) })} disabled={s.semi >= 5} aria-label={tx("조 올리기")}><Icon n="plus" s={20} /></button>
          </div>
        </li>
        <li className="setrow hy-step">
          <span className="x"><span className="x1">{tx("빠르기")}</span><span className="x2">{s.rate === 1 ? tx("원래 빠르기") : tx("원래의 {0}%", Math.round(s.rate * 100))}</span></span>
          <div className="hy-pm">
            <button onClick={() => change({ rate: Math.max(0.6, +(s.rate - 0.05).toFixed(2)) })} disabled={s.rate <= 0.6} aria-label={tx("느리게")}><Icon n="minus" s={20} /></button>
            <b className="num">♩{bpm}</b>
            <button onClick={() => change({ rate: Math.min(1.4, +(s.rate + 0.05).toFixed(2)) })} disabled={s.rate >= 1.4} aria-label={tx("빠르게")}><Icon n="plus" s={20} /></button>
          </div>
        </li>
        <li className="setrow hy-step">
          <span className="x"><span className="x1" id="hy-i">{tx("전주")}</span><span className="x2">{tx("끝 네 마디를 먼저 연주해요")}</span></span>
          <button className="sw" role="switch" aria-checked={s.intro} aria-labelledby="hy-i" onClick={() => change({ intro: !s.intro })} disabled={on} />
        </li>
      </ul>
      {(s.semi !== 0 || s.rate !== 1) && <button className="textlink hy-reset" onClick={() => change({ semi: 0, rate: 1 })}>{tx("조·빠르기 처음대로")}</button>}
      <p className="hy-credit">{tx("반주하는 동안 화면이 꺼지지 않아요. 휴대폰 소리를 블루투스 스피커나 앰프에 연결해 쓰세요.")}</p>
    </div>
  )
}
