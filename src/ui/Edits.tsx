// 내 편집곡: 파형을 보며 마음에 드는 구간을 골라 이어 붙이고, 이름을 붙여 듣는다.
// 원본 파일은 그대로 두고 "어느 곡의 몇 초부터 몇 초까지"만 기억한다.
import { rt } from './rich'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fmt, type Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { editLength, partTracks, type Edit, type Edits, type Part } from '../lib/edits'
import { Icon, Sheet, info, minutesText, nf, secText } from './common'
import { AddSongs, NameSheet, Page } from './Sheets'
import { ShapeBar } from './Now'
import { tx } from "../lib/i18n";
import { exportEdit } from '../lib/exporter'
import { isNative } from '../lib/native'

const lenText = (sec: number) => (sec >= 60 ? minutesText(Math.max(1, Math.round(sec / 60))) : secText(Math.round(sec)))

/* ───────── 「내 목록」 안의 내 편집곡 ───────── */
export function EditsSection({ edits, tracks, player, play }: { edits: Edits; tracks: Track[]; player: Player; play: Player['playFrom'] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const closeOpen = useCallback(() => setOpen(null), [])
  const closeNaming = useCallback(() => setNaming(false), [])
  const ed = edits.items.find((x) => x.id === open)
  return (
    <>
      <div className="sub-row">
        <h2 className="sub">{tx("내 편집곡")}</h2>
        <button className="textlink" onClick={() => setNaming(true)}>{tx("새 편집곡")}</button>
      </div>
      {edits.items.length === 0 ? (
        <p className="empty">{tx("듣고 싶은 부분만 골라 이어 붙인 나만의 곡을 만들어요. 원래 음악 파일은 그대로 있어요.")}</p>
      ) : (
        <ul className="pl">
          {edits.items.map((x) => {
            const parts = partTracks(x, byId)
            return (
              <li key={x.id}>
                <button className="lrow" onClick={() => setOpen(x.id)}>
                  <span className="x"><span className="x1">{x.name}</span><span className="x2 num">{nf.format(x.parts.length)}{tx("구간 · ")}{lenText(editLength(x))}</span></span>
                </button>
                <button className="pp" disabled={!parts.length} onClick={() => play(parts, parts[0].id, undefined, true, 'edit:' + x.id)} aria-label={tx("{0} 듣기", x.name)}>
                  <Icon n="play" s={20} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {naming && <NameSheet title={tx("새 편집곡")} done={tx("만들기")} placeholder={tx("예: 수요 특송 반주 모음")} onDone={(n) => setOpen(edits.create(n))} onClose={closeNaming} />}
      {ed && <EditPage ed={ed} edits={edits} tracks={tracks} byId={byId} player={player} play={play} onClose={closeOpen} />}
    </>
  )
}

/* ───────── 편집곡 고치기 ───────── */
function EditPage({ ed, edits, tracks, byId, player, play, onClose }: {
  ed: Edit; edits: Edits; tracks: Track[]; byId: Map<string, Track>; player: Player; play: Player['playFrom']; onClose: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [clip, setClip] = useState<{ t: Track; k: number | null; init?: Part } | null>(null)
  const [rename, setRename] = useState(false)
  const [sure, setSure] = useState(false)
  const [exporting, setExporting] = useState(false)
  const closeExport = useCallback(() => setExporting(false), [])
  const closePick = useCallback(() => setPicking(false), [])
  const closeClip = useCallback(() => setClip(null), [])
  const closeRename = useCallback(() => setRename(false), [])
  const parts = partTracks(ed, byId)
  const music = useMemo(() => tracks.filter((t) => !t.talk), [tracks])
  return (
    <Page label={ed.name} onClose={onClose}>
      <p className="lmeta num">{nf.format(ed.parts.length)}{tx("구간 · ")}{lenText(editLength(ed))}</p>
      <div className="acts">
        {parts.length > 0 && <button className="go grow" onClick={() => play(parts, parts[0].id, undefined, true, 'edit:' + ed.id)}><Icon n="play" s={18} />{tx("처음부터 듣기")}</button>}
        <button className={parts.length ? 'pillbtn' : 'go grow'} onClick={() => setPicking(true)}><Icon n="plus" s={18} />{tx("구간 더하기")}</button>
      </div>
      {parts.length > 0 && <button className="textlink savefile" onClick={() => setExporting(true)}>{tx("음악 파일로 저장하기")}</button>}
      {ed.parts.length === 0 && <p className="empty">{tx("「구간 더하기」를 눌러 곡을 고르고, 파형에서 듣고 싶은 부분을 정해 주세요.")}</p>}
      <ol className="erows parts">
        {ed.parts.map((p, k) => {
          const t = byId.get(p.tid)
          const x = t ? info(t) : null
          return (
            <li key={k + ':' + p.tid}>
              <button className="erow-main" disabled={!t} onClick={() => t && setClip({ t, k, init: p })}>
                <span className="en num" aria-hidden="true">{k + 1}</span>
                <span className="x">
                  <span className="x1">{x ? x.song : tx("찾을 수 없는 곡")}</span>
                  <span className="x2 num">{fmt(p.s)} ~ {fmt(p.e)} · {lenText(p.e - p.s)}</span>
                </span>
              </button>
              <button className="eb" disabled={k === 0} onClick={() => edits.movePart(ed.id, k, -1)} aria-label={tx("{0}번째 구간 위로", k + 1)}><Icon n="up" s={22} /></button>
              <button className="eb" disabled={k === ed.parts.length - 1} onClick={() => edits.movePart(ed.id, k, 1)} aria-label={tx("{0}번째 구간 아래로", k + 1)}><Icon n="down" s={22} /></button>
              <button className="eb" onClick={() => edits.removePart(ed.id, k)} aria-label={tx("{0}번째 구간 빼기", k + 1)}><Icon n="x" s={22} /></button>
            </li>
          )
        })}
      </ol>
      {ed.parts.length > 0 && <p className="hint">{tx("구간을 누르면 시작·끝을 고칠 수 있어요. 원래 음악 파일은 바뀌지 않아요.")}</p>}
      {sure ? (
        <div className="confirm" role="alert">
          <p>"{ed.name}{tx("\" 편집곡을 지울까요? 원래 음악 파일은 지워지지 않아요.")}</p>
          <div className="nb">
            <button className="ghost" onClick={() => setSure(false)}>{tx("그만두기")}</button>
            <button className="go danger" onClick={() => { edits.remove(ed.id); onClose() }}>{tx("편집곡 지우기")}</button>
          </div>
        </div>
      ) : (
        <div className="tlinks">
          <button className="textbtn plain" onClick={() => setRename(true)}>{tx("이름 바꾸기")}</button>
          <button className="textbtn" onClick={() => setSure(true)}>{tx("이 편집곡 지우기")}</button>
        </div>
      )}
      {picking && <AddSongs tracks={music} has={() => false} onAdd={(t) => { setPicking(false); setClip({ t, k: null }) }} onClose={closePick} />}
      {clip && (
        <ClipSheet t={clip.t} init={clip.init} player={player} done={clip.k == null ? tx("넣기") : tx("고치기")}
          onSave={(s, e) => (clip.k == null ? edits.addPart(ed.id, { tid: clip.t.id, s, e }) : edits.setPart(ed.id, clip.k, { tid: clip.t.id, s, e }))}
          onClose={closeClip} />
      )}
      {exporting && <ExportSheet ed={ed} byId={byId} onClose={closeExport} />}
      {rename && <NameSheet title={tx("편집곡 이름 바꾸기")} initial={ed.name} done={tx("바꾸기")} onDone={(n) => edits.rename(ed.id, n)} onClose={closeRename} />}
    </Page>
  )
}

/* ───────── 구간 고르기: 파형을 보며 시작·끝, 들어 보기 ───────── */
export function ClipSheet({ t, init, player, done, onSave, onClose }: {
  t: Track; init?: Part; player: Player; done: string; onSave: (s: number, e: number) => void; onClose: () => void
}) {
  const src = t.src ?? t.id
  const isCur = (player.current?.src ?? player.current?.id) === src && !player.current?.clip
  const dur = isCur && player.duration > 0 ? player.duration : t.duration
  const [s, setS] = useState(init?.s ?? (isCur ? Math.floor(player.time) : 0))
  const [e, setE] = useState(init?.e ?? Math.min(dur, (init?.s ?? (isCur ? Math.floor(player.time) : 0)) + 30))
  const [pv, setPv] = useState<number | null>(null) // 들어 보는 자리
  const au = useRef<HTMLAudioElement | null>(null)
  const range = useRef({ s, e })
  range.current = { s, e }
  const cs = (v: number) => setS(Math.max(0, Math.min(Math.round(v), e - 1)))
  const ce = (v: number) => setE(Math.min(Math.floor(dur), Math.max(Math.round(v), s + 1)))
  const stop = () => { au.current?.pause(); setPv(null) }
  useEffect(() => () => { au.current?.pause(); au.current = null }, [])
  const listen = () => {
    if (pv != null) { stop(); return }
    if (player.playing) player.pause()
    let a = au.current
    if (!a) {
      a = new Audio(t.url)
      a.addEventListener('timeupdate', () => {
        const x = au.current
        if (!x) return
        if (x.currentTime >= range.current.e) { x.pause(); setPv(null) } else setPv(x.currentTime)
      })
      au.current = a
    }
    a.currentTime = s
    setPv(s)
    a.play().catch(() => setPv(null))
  }
  const x = info(t)
  const row = (label: string, v: number, set: (v: number) => void) => (
    <div className="trow">
      <span>{label}<b className="num">{fmt(v)}</b></span>
      <button className="num" onClick={() => set(v - 1)} aria-label={tx("{0} 1초 앞으로", label)}>{tx("−1초")}</button>
      <button className="num" onClick={() => set(v + 1)} aria-label={tx("{0} 1초 뒤로", label)}>{tx("+1초")}</button>
      {pv != null ? <button onClick={() => set(pv)}>{tx("들은 자리")}</button> : isCur && <button onClick={() => set(player.time)}>{tx("지금 자리")}</button>}
    </div>
  )
  if (!dur) {
    return (
      <Sheet label={tx("구간 고르기")} onClose={onClose}>
        <h2 className="q">{tx("구간 고르기")}</h2>
        <p className="say">{tx("이 곡의 길이를 아직 몰라요. 한 번 틀고 나서 골라 주세요.")}</p>
        <button className="go" onClick={onClose}>{tx("닫기")}</button>
      </Sheet>
    )
  }
  return (
    <Sheet label={tx("구간 고르기")} onClose={onClose}>
      <div>
        <h2 className="q">{tx("구간 고르기 · ")}{x.song}</h2>
        <p className="say" role="status">{rt("__{0}__[num]부터 __{1}__[num]까지 · {2}", fmt(s), fmt(e), lenText(e - s))}</p>
      </div>
      <ShapeBar t={t} time={pv ?? (isCur ? player.time : s)} duration={dur} ab={{ a: s, b: e, n: 1 }} />
      <div className="trows">
        {row(tx("시작"), s, cs)}
        {row(tx("끝"), e, ce)}
      </div>
      <button className={'pillbtn listen' + (pv != null ? ' on' : '')} onClick={listen}>
        <Icon n={pv != null ? 'pause' : 'play'} s={18} />{pv != null ? <>{tx("멈추기 ")}<span className="num">{fmt(pv)}</span></> : tx("이 구간 들어 보기")}
      </button>
      <div className="nb">
        <button className="ghost" onClick={onClose}>{tx("그만두기")}</button>
        <button className="go" onClick={() => { stop(); onSave(s, e); onClose() }}>{done}</button>
      </div>
    </Sheet>
  )
}

/* ───────── 구간 반복 중에 「편집곡에 담기」 ───────── */
export function ChooseEditSheet({ edits, part, onClose, onDone }: { edits: Edits; part: Part; onClose: () => void; onDone: (name: string) => void }) {
  const [naming, setNaming] = useState(false)
  const closeNaming = useCallback(() => setNaming(false), [])
  return (
    <Sheet label={tx("편집곡에 담기")} onClose={onClose}>
      <div>
        <h2 className="q">{tx("편집곡에 담기")}</h2>
        <p className="say">{rt("__{0}__[num]부터 __{1}__[num]까지를 어느 편집곡 끝에 붙일까요?", fmt(part.s), fmt(part.e))}</p>
      </div>
      <div className="menu">
        {edits.items.map((x) => (
          <button key={x.id} onClick={() => { edits.addPart(x.id, part); onDone(x.name); onClose() }}>
            <Icon n="list" s={20} /><span className="one">{x.name}</span><small className="num">{nf.format(x.parts.length)}{tx("구간")}</small>
          </button>
        ))}
        <button onClick={() => setNaming(true)}><Icon n="plus" s={20} />{tx("새 편집곡 만들기")}</button>
      </div>
      {naming && <NameSheet title={tx("새 편집곡")} done={tx("만들고 담기")} placeholder={tx("예: 수요 특송 반주 모음")}
        onDone={(n) => { edits.create(n, [part]); onDone(n); onClose() }} onClose={closeNaming} />}
    </Sheet>
  )
}

/* ───────── 진짜 음악 파일로 저장 ───────── */
function ExportSheet({ ed, byId, onClose }: { ed: Edit; byId: Map<string, Track>; onClose: () => void }) {
  const [st, setSt] = useState<'ready' | 'work' | 'done' | 'fail'>('ready')
  const [f, setF] = useState(0)
  const [res, setRes] = useState<{ where: string; url?: string; file?: string } | null>(null)
  useEffect(() => () => { if (res?.url) URL.revokeObjectURL(res.url) }, [res])
  const parts = ed.parts.map((p) => ({ t: byId.get(p.tid), s: p.s, e: p.e })).filter((p): p is { t: Track; s: number; e: number } => !!p.t)
  const go = async () => {
    setSt('work'); setF(0)
    try { setRes(await exportEdit(parts, ed.name, setF)); setSt('done') } catch { setSt('fail') }
  }
  return (
    <Sheet label={tx("음악 파일로 저장")} onClose={st === 'work' ? () => {} : onClose}>
      <div>
        <h2 className="q">{tx("음악 파일로 저장 · ")}{ed.name}</h2>
        {st === 'ready' && <p className="say">{tx("구간 {0}개를 이어 진짜 음악 파일로 만들어요. 다른 앱에서도 들을 수 있어요.", nf.format(parts.length))}</p>}
        {st === 'work' && <p className="say" role="status">{tx("만들고 있어요… ")}<span className="num">{Math.round(f * 100)}%</span></p>}
        {st === 'done' && <p className="say" role="status">{isNative ? <>「<b>{res?.where}</b>{tx("」에 저장했어요.")}<br />{tx("음악을 다시 찾으면 목록에 나와요.")}</> : <>{tx("파일을 만들었어요. 아래에서 내려받으세요.")}</>}</p>}
        {st === 'fail' && <p className="say" role="alert">{tx("파일을 만들지 못했어요. 원래 음악 파일이 그대로 있는지 확인하고 다시 해 주세요.")}</p>}
      </div>
      {st === 'work' && <div className="xbar" aria-hidden="true"><b style={{ width: `${Math.round(f * 100)}%` }} /></div>}
      {st === 'ready' && (
        <p className="hint">{isNative ? tx("휴대폰의 「음악/온음」 폴더에 .m4a 파일로 저장돼요.") : tx("WAV 파일로 내려받아요. 1분에 약 10MB예요.")} {tx("원래 음악 파일은 그대로예요. 직접 가진 음원을 개인적으로 들을 때 써 주세요.")}</p>
      )}
      <div className="nb">
        {st === 'ready' && <><button className="ghost" onClick={onClose}>{tx("그만두기")}</button><button className="go" onClick={go}>{tx("파일 만들기")}</button></>}
        {st === 'done' && res?.url && <a className="go" href={res.url} download={res.file}>{tx("내려받기")}</a>}
        {(st === 'done' || st === 'fail') && <button className={res?.url ? 'ghost' : 'go'} onClick={onClose}>{tx("닫기")}</button>}
        {st === 'fail' && <button className="ghost" onClick={go}>{tx("다시 하기")}</button>}
      </div>
    </Sheet>
  )
}
