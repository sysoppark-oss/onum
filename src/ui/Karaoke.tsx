// 노래방 화면: 플레이어와 따로 연다. 목소리 줄이기·키·빠르기를 고르고 부르거나 녹음한다.
// 가사는 사용자가 넣고 「톡」 눌러 박자를 맞춘다. 녹음은 이 휴대폰 안에만 둔다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '../lib/library'
import type { Player } from '../lib/usePlayer'
import { linesOf, setLyrics, stateAt, synced, useLyrics, findLyrics, type Lyrics } from '../lib/lyrics'
import { metersOf, setFx, type Vox } from '../lib/monofix'
import { MicRecorder, karaSet, latency, pitchOf, renderTake, saveKaraSet, saveTake, scoreOf, type Frame, type KaraSet, type Take } from '../lib/karaoke'
import { audioCtx } from '../lib/monofix'
import type { Output } from '../lib/native'
import { isNative } from '../lib/native'
import { load, save } from '../lib/store'
import { tx } from '../lib/i18n'
import { Icon, Sheet, VirtualList, info, whoLine } from './common'
import { matches } from '../lib/hangul'
import { fmt } from '../lib/library'
import { Page } from './Sheets'
import { aiCancel, aiInfo, aiSplit, type AiInfo } from '../lib/aisplit'
import { LyricsPage } from './Lyrics'

type Phase = 'idle' | 'sing' | 'rec' | 'review' | 'sync'
const VOX: [Vox, string][] = [[0, '그대로'], [1, '조금'], [2, '많이'], [3, '최대']]
const RATES: [number, string][] = [[0.9, '느리게'], [1, '보통'], [1.1, '빠르게']]

type WL = { release: () => Promise<void> }
function useWake(on: boolean) {
  useEffect(() => {
    if (!on) return
    let lock: WL | null = null, alive = true
    const n = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WL> } }
    n.wakeLock?.request('screen').then((l) => { if (alive) lock = l; else l.release() }).catch(() => {})
    return () => { alive = false; lock?.release().catch(() => {}) }
  }, [on])
}

export function KaraokePage({ t, player, output, onClose }: { t: Track; player: Player; output: Output | null; onClose: () => void }) {
  const x = info(t)
  const ly = useLyrics(t)
  const [s, setS] = useState<KaraSet>(() => karaSet(t.id))
  const [phase, setPhase] = useState<Phase>('idle')
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(t.duration || 0)
  const [mono, setMono] = useState(false)
  const [err, setErr] = useState('')
  const [take, setTake] = useState<Take | null>(null)
  const [lyEdit, setLyEdit] = useState(false)
  const [help, setHelp] = useState(false)
  const [level, setLevel] = useState(0)
  // AI 반주: 만들 수 있는지(ai), 만든 반주 주소(aiUrl), 만드는 중 진행(aiP, -1이면 쉬는 중)
  const [ai, setAi] = useState<AiInfo | null>(null)
  const [aiUrl, setAiUrl] = useState<string | undefined>()
  const [aiP, setAiP] = useState(-1)
  const [aiErr, setAiErr] = useState('')
  const useAi = !!(s.ai && aiUrl)
  const a = useRef<HTMLAudioElement | null>(null)
  const mic = useRef<MicRecorder | null>(null)
  const frames = useRef<Frame[]>([])
  const map = useRef({ ctx: 0, pos: 0 }) // 곡 위치 pos가 AudioContext 시각 ctx일 때
  useWake(phase === 'sing' || phase === 'rec' || phase === 'sync' || aiP >= 0)
  useEffect(() => { aiInfo(t).then((r) => { setAi(r); setAiUrl(r.url) }) }, [t])
  useEffect(() => () => { if (aiP >= 0) aiCancel() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // AI 반주를 켜고 끌 때 재생기 소리를 바꾼다(부르는 중이 아닐 때만 바꿀 수 있다)
  useEffect(() => {
    const el = a.current
    if (!el) return
    const want = useAi ? aiUrl! : t.url
    if (el.src !== want && !el.src.endsWith(want)) { el.src = want; el.load() }
  }, [useAi, aiUrl, t.url])
  const makeAi = async () => {
    setAiErr(''); setAiP(0)
    try {
      const u = await aiSplit(t, (f) => setAiP(f))
      setAiUrl(u)
      change({ ai: true })
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      console.warn('ai split', m)
      if (!/cancel/.test(m)) setAiErr(/memory/.test(m) ? tx("휴대폰 메모리가 모자라 반주를 만들지 못했어요. 다른 앱을 닫고 다시 해 보세요.") : tx("반주를 만들지 못했어요. 다시 해 보세요."))
    }
    setAiP(-1)
  }

  // 듣던 음악은 잠시 멈추고, 노래방 전용 재생기를 만든다
  useEffect(() => {
    if (player.playing) player.pause()
    const el = new Audio()
    el.preload = 'auto'
    el.src = t.url
    a.current = el
    const onMeta = () => { if (el.duration && isFinite(el.duration)) setDur(el.duration) }
    el.addEventListener('loadedmetadata', onMeta)
    // 가사가 없으면 음악 파일 속 가사·곡 옆 .lrc를 먼저 찾아본다
    if (!ly) findLyrics(t).then((l) => { if (l) setLyrics(t, l) })
    const h = load('karaHelp', false) ? 0 : window.setTimeout(() => setHelp(true), 60)
    return () => { window.clearTimeout(h); el.pause(); el.removeAttribute('src'); el.load(); mic.current?.close() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 설정을 소리 길에 맞춘다(맞추기 중에는 목소리 그대로)
  const apply = useCallback((st: KaraSet, syncing = false) => {
    const el = a.current
    if (!el) return
    setFx(el, { vox: syncing || (st.ai && aiUrl) ? 0 : st.vox, semis: syncing ? 0 : st.semi, rate: syncing ? 1 : st.rate, viz: true })
    el.playbackRate = syncing ? 1 : st.rate
  }, [aiUrl])
  useEffect(() => { apply(s, phase === 'sync') }, [s, phase, apply])

  // 시간 따라가기 + 마이크 점수 재기 + 한쪽 귀 녹음(모노) 알아보기
  useEffect(() => {
    if (phase !== 'sing' && phase !== 'rec' && phase !== 'sync') return
    let raf = 0, last = 0, monoN = 0, monoHits = 0
    const buf = new Float32Array(2048)
    const tick = (now: number) => {
      const el = a.current
      if (el) setTime(el.currentTime)
      if (now - last > 50) {
        last = now
        const an = mic.current?.an
        if (phase === 'rec' && an && el) {
          an.getFloatTimeDomainData(buf)
          const p = pitchOf(buf, an.context.sampleRate)
          frames.current.push({ t: el.currentTime, hz: p.hz, rms: p.rms })
          setLevel(Math.min(1, p.rms * 6))
        }
        // 처음 몇 초 동안 왼쪽·오른쪽이 같은지 본다
        const m = el ? metersOf(el) : null
        if (m && monoN < 80 && el && el.currentTime > 2) {
          const L = new Float32Array(m.l.fftSize), R = new Float32Array(m.r.fftSize)
          m.l.getFloatTimeDomainData(L); m.r.getFloatTimeDomainData(R)
          let d = 0, sum = 0
          for (let i = 0; i < L.length; i++) { d += (L[i] - R[i]) ** 2; sum += (L[i] + R[i]) ** 2 }
          if (sum > 1e-4) { monoN++; if (d / sum < 0.0016) monoHits++ }
          if (monoN === 80) setMono(monoHits > 70)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // 가사 넣기 창에서 저장하면 노래방으로 바로 돌아온다
  const lyText = ly?.text
  useEffect(() => { if (lyEdit && lyText) setLyEdit(false) }, [lyText]) // eslint-disable-line react-hooks/exhaustive-deps

  const change = (n: Partial<KaraSet>) => { const v = { ...s, ...n }; setS(v); saveKaraSet(t.id, v) }

  const startPlay = async (rec: boolean) => {
    const el = a.current
    if (!el) return
    setErr('')
    if (rec) {
      try {
        if (!mic.current) { mic.current = new MicRecorder(); await mic.current.open() }
      } catch {
        mic.current = null
        setErr(tx("마이크를 쓸 수 없어요. 휴대폰 설정에서 온음의 마이크 권한을 허용해 주세요."))
        return
      }
    }
    apply(s)
    el.currentTime = 0
    frames.current = []
    try { await el.play() } catch { setErr(tx("곡을 틀 수 없어요.")); return }
    const c = audioCtx()
    map.current = { ctx: c.currentTime, pos: el.currentTime }
    if (rec) mic.current!.start()
    setPhase(rec ? 'rec' : 'sing')
    el.onended = () => { void stopPlay() }
  }

  const stopPlay = async () => {
    const el = a.current
    if (!el) return
    el.onended = null
    el.pause()
    const end = el.currentTime
    if (phase === 'rec' || mic.current) {
      const r = mic.current ? await mic.current.stop() : null
      if (r && r.pcm.length > r.sr) {
        // 녹음 첫 소리가 반주 시간으로 몇 초인지: 곡 위치 0이 울린 시각을 기준으로
        const zero = map.current.ctx - map.current.pos / s.rate
        const at = r.t0 - zero - latency()
        const sc = scoreOf(frames.current, ly, 0, end)
        setTake({ pcm: r.pcm, sr: r.sr, at, end, set: { ...s, vox: useAi ? 0 : s.vox }, score: sc, back: useAi ? aiUrl : undefined })
        setPhase('review')
        return
      }
    }
    setPhase('idle')
  }

  const st = ly && synced(ly) ? stateAt(ly, time) : null
  const lines = ly ? linesOf(ly.text) : []
  const speaker = output?.kind === 'speaker'
  const busy = phase === 'sing' || phase === 'rec'

  if (phase === 'sync' && ly) return <SyncLyrics t={t} ly={ly} el={a.current!} label={x.song} onDone={() => { a.current?.pause(); setPhase('idle') }} />

  return (
    <Page label={tx("노래방 · {0}", x.song)} onClose={() => { if (busy) a.current?.pause(); onClose() }}
      actions={<button className="textlink" onClick={() => setHelp(true)}>{tx("사용법")}</button>}>
      <div className="kara">
        <p className="kara-who">{x.singer || ' '}</p>

        <div className={'kara-ly' + (st ? ' on' : '')} aria-live="polite">
          {st ? <>
            {st.gap != null
              ? <p className="kara-gap"><Icon n="note" s={18} />{st.on < 0 ? tx("전주") : tx("간주")} · <span className="num">{tx("다음 줄까지 {0}초", Math.ceil(st.gap))}</span></p>
              : <p className="kara-l0">{st.on >= 0 ? lines[st.on] : ' '}</p>}
            <p className="kara-l1">{st.next >= 0 ? lines[st.next] : ' '}</p>
          </> : ly ? <>
            <p className="kara-l1">{lines.find((l) => l) ?? ''}</p>
            <p className="kara-hint">{tx("가사가 노래를 따라가게 하려면 박자를 맞춰 주세요.")}</p>
            <button className="pillbtn" onClick={() => setPhase('sync')} disabled={busy}><Icon n="lyric" s={18} />{tx("톡 눌러 박자 맞추기")}</button>
          </> : <>
            <p className="kara-hint">{tx("가사를 넣으면 노래방처럼 화면에 나와요.")}</p>
            <button className="pillbtn" onClick={() => setLyEdit(true)} disabled={busy}><Icon n="edit" s={18} />{tx("가사 넣기")}</button>
          </>}
        </div>

        <div className="kara-time num" aria-hidden="true">
          <span>{fmt(time)}</span>
          <div className="kara-bar"><i style={{ transform: `scaleX(${dur ? Math.min(1, time / dur) : 0})` }} /></div>
          <span>{fmt(dur)}</span>
        </div>

        {phase === 'review' && take ? (
          <Review t={t} take={take} el={a.current!} onAgain={() => { setTake(null); setPhase('idle') }} />
        ) : busy ? (
          <div className="kara-go">
            {phase === 'rec' && <div className="kara-meter" aria-hidden="true"><i style={{ transform: `scaleX(${level})` }} /></div>}
            <button className="go kara-stop" onClick={() => void stopPlay()}><Icon n="stop" s={22} />{phase === 'rec' ? tx("그만 부르기 · 점수 보기") : tx("그만 부르기")}</button>
          </div>
        ) : (
          <div className="kara-go">
            <button className="go kara-rec" onClick={() => void startPlay(true)} disabled={aiP >= 0}><Icon n="mic" s={22} />{tx("녹음하며 부르기")}</button>
            <button className="pillbtn kara-sing" onClick={() => void startPlay(false)} disabled={aiP >= 0}><Icon n="play" s={18} />{tx("녹음 없이 부르기")}</button>
            {speaker && <p className="kara-note">{tx("이어폰을 끼고 부르면 반주가 녹음에 섞이지 않아 더 깨끗해요.")}</p>}
          </div>
        )}
        {err && <p className="kara-err" role="alert">{err}</p>}
        {mono && s.vox > 0 && !useAi && <p className="kara-note" role="status">{tx("이 곡은 왼쪽·오른쪽 소리가 같아서 목소리를 줄일 수 없어요.")}</p>}

        {phase !== 'review' && (
          <div className="kara-set">
            {ai?.model && (aiUrl ? (
              <div className="kara-row">
                <span className="kara-k" id="ka">{tx("AI 반주")} <span className="kara-k2">{tx("· 가수 목소리를 AI로 지운 반주")}</span></span>
                <div className="kara-seg kara-seg2" role="radiogroup" aria-labelledby="ka">
                  <button role="radio" aria-checked={useAi} className={useAi ? 'on' : undefined} onClick={() => change({ ai: true })} disabled={busy}>{tx("AI 반주로")}</button>
                  <button role="radio" aria-checked={!useAi} className={!useAi ? 'on' : undefined} onClick={() => change({ ai: false })} disabled={busy}>{tx("원곡으로")}</button>
                </div>
              </div>
            ) : aiP >= 0 ? (
              <div className="kara-ai" role="status">
                <p className="kara-ai-t">{tx("AI로 반주 만드는 중")} <b className="num">{Math.floor(aiP * 100)}%</b></p>
                <div className="kara-bar"><i style={{ transform: `scaleX(${aiP})` }} /></div>
                <p className="kara-note">{tx("휴대폰이 곡을 직접 계산하고 있어요. 화면을 켜 둔 채 기다려 주세요. 한 번 만들면 다음부터 바로 써요.")}</p>
                <button className="textlink" onClick={aiCancel}>{tx("그만 만들기")}</button>
              </div>
            ) : (
              <div className="kara-ai">
                <button className="go kara-ai-go" onClick={() => void makeAi()} disabled={busy}><Icon n="mic" s={20} />{tx("AI로 가수 목소리 지우기")}</button>
                <p className="kara-note">{tx("목소리만 떼어 낸 깨끗한 반주를 만들어요. 처음 한 번은 곡 길이에 따라 몇 분 걸려요. 노래는 휴대폰 밖으로 나가지 않아요.")}</p>
                {aiErr && <p className="kara-err" role="alert">{aiErr}</p>}
              </div>
            ))}
            {!useAi && (
              <div className="kara-row">
                <span className="kara-k" id="kv">{ai?.model ? tx("가수 목소리 · 빠르게 줄이기") : tx("가수 목소리")}</span>
                <div className="kara-seg" role="radiogroup" aria-labelledby="kv">
                  {VOX.map(([v, l]) => <button key={v} role="radio" aria-checked={s.vox === v} className={s.vox === v ? 'on' : undefined} onClick={() => change({ vox: v })} disabled={phase === 'rec' || aiP >= 0}>{tx(l)}</button>)}
                </div>
              </div>
            )}
            <div className="kara-row kara-two">
              <div>
                <span className="kara-k">{tx("키")}</span>
                <div className="kara-pm">
                  <button onClick={() => change({ semi: Math.max(-6, s.semi - 1) })} disabled={phase === 'rec' || s.semi <= -6} aria-label={tx("키 내리기")}><Icon n="minus" s={20} /></button>
                  <b className="num">{s.semi > 0 ? '+' + s.semi : s.semi === 0 ? tx("원키") : s.semi}</b>
                  <button onClick={() => change({ semi: Math.min(6, s.semi + 1) })} disabled={phase === 'rec' || s.semi >= 6} aria-label={tx("키 올리기")}><Icon n="plus" s={20} /></button>
                </div>
              </div>
              <div>
                <span className="kara-k" id="kr">{tx("빠르기")}</span>
                <div className="kara-seg kara-seg3" role="radiogroup" aria-labelledby="kr">
                  {RATES.map(([v, l]) => <button key={v} role="radio" aria-checked={s.rate === v} className={s.rate === v ? 'on' : undefined} onClick={() => change({ rate: v })} disabled={phase === 'rec'}>{tx(l)}</button>)}
                </div>
              </div>
            </div>
            {ly && synced(ly) && !busy && <button className="textlink kara-resync" onClick={() => setPhase('sync')}>{tx("가사 박자 다시 맞추기")}</button>}
          </div>
        )}
      </div>
      {lyEdit && <LyricsPage t={t} player={player} start="edit" onClose={() => setLyEdit(false)} />}
      {help && <KaraHelp onClose={() => { setHelp(false); save('karaHelp', true) }} />}
    </Page>
  )
}

/* ───────── 녹음 뒤: 점수 · 들어보기 · 박자 맞추기 · 저장 ───────── */
function Review({ t, take, el, onAgain }: { t: Track; take: Take; el: HTMLAudioElement; onAgain: () => void }) {
  const x = info(t)
  const [shown, setShown] = useState(0)
  const [shift, setShift] = useState(0)
  const [micG, setMicG] = useState(1.2)
  const [play, setPlay] = useState(false)
  const [saving, setSaving] = useState(-1)
  const [done, setDone] = useState<{ where: string; url?: string; file?: string } | null>(null)
  const [fail, setFail] = useState('')
  const src = useRef<AudioBufferSourceNode | null>(null)
  const [best] = useState(() => load<number>('karaBest:' + t.id, 0))
  // 점수가 올라가며 나온다
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const run = (n: number) => {
      const f = Math.min(1, (n - t0) / 1400)
      setShown(Math.round(take.score.total * (1 - (1 - f) ** 3)))
      if (f < 1) raf = requestAnimationFrame(run)
    }
    raf = requestAnimationFrame(run)
    if (take.score.total > best) save('karaBest:' + t.id, take.score.total)
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopListen = () => { el.pause(); try { src.current?.stop() } catch { /* 이미 멈춤 */ } src.current = null; setPlay(false) }
  useEffect(() => () => stopListen(), []) // eslint-disable-line react-hooks/exhaustive-deps
  const listen = async () => {
    if (play) { stopListen(); return }
    const c = audioCtx()
    const b = c.createBuffer(1, take.pcm.length, take.sr)
    const ch = b.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = take.pcm[i] / 32768
    const s = c.createBufferSource(); s.buffer = b
    const g = c.createGain(); g.gain.value = micG
    s.connect(g); g.connect(c.destination)
    el.currentTime = 0
    await el.play().catch(() => {})
    const zero = c.currentTime - el.currentTime / take.set.rate
    const at = take.at + shift
    if (zero + at >= c.currentTime) s.start(zero + at); else s.start(c.currentTime, c.currentTime - (zero + at))
    s.onended = () => setPlay(false)
    src.current = s
    setPlay(true)
  }
  const doSave = async () => {
    stopListen()
    setFail(''); setSaving(0)
    try {
      const buf = await renderTake(take.back ?? t.url, take, micG, 0.9, shift, setSaving)
      const d = new Date()
      const name = tx("{0} - 노래방 {1}", x.song, `${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}${String(d.getMinutes()).padStart(2, '0')}`)
      const r = await saveTake(buf, name, setSaving)
      setDone(r)
    } catch {
      setFail(tx("저장하지 못했어요. 다시 해 보세요."))
    }
    setSaving(-1)
  }
  const sc = take.score
  return (
    <div className="kara-rev">
      <div className="kara-score" aria-label={tx("점수 {0}점", sc.total)}>
        <b className="num">{shown}</b><span>{tx("점")}</span>
      </div>
      <p className="kara-say">{tx(sc.note)}</p>
      {best > 0 && <p className="kara-best num">{sc.total > best ? tx("최고 점수를 새로 세웠어요! (전 {0}점)", best) : tx("이 곡 최고 {0}점", best)}</p>}
      <ul className="kara-parts">
        <li><span>{tx("따라 부르기")}</span><i style={{ background: `linear-gradient(to right, var(--ink) ${Math.round(sc.sing * 100)}%, var(--sf) 0)` }} /></li>
        <li><span>{tx("음 안정")}</span><i style={{ background: `linear-gradient(to right, var(--ink) ${Math.round(sc.steady * 100)}%, var(--sf) 0)` }} /></li>
        <li><span>{tx("이어 부르기")}</span><i style={{ background: `linear-gradient(to right, var(--ink) ${Math.round(sc.flow * 100)}%, var(--sf) 0)` }} /></li>
      </ul>

      <button className="go" onClick={() => void listen()} disabled={saving >= 0}><Icon n={play ? 'pause' : 'play'} s={22} />{play ? tx("멈추기") : tx("들어보기")}</button>
      <div className="kara-row kara-adj">
        <span className="kara-k">{tx("내 목소리와 반주 박자")}</span>
        <div className="kara-pm">
          <button onClick={() => setShift(+(shift - 0.03).toFixed(2))} aria-label={tx("내 목소리를 앞당기기")}><Icon n="minus" s={20} /></button>
          <b className="num">{shift === 0 ? tx("맞음") : `${shift > 0 ? '+' : '−'}${Math.abs(Math.round(shift * 1000))}ms`}</b>
          <button onClick={() => setShift(+(shift + 0.03).toFixed(2))} aria-label={tx("내 목소리를 늦추기")}><Icon n="plus" s={20} /></button>
        </div>
      </div>
      <p className="kara-note">{tx("들어 보고 내 목소리가 늦게 들리면 −, 빠르게 들리면 +를 눌러요. 다시 들어보면 바뀌어 있어요.")}</p>
      <div className="kara-row kara-adj">
        <span className="kara-k">{tx("내 목소리 크기")}</span>
        <div className="kara-pm">
          <button onClick={() => setMicG(Math.max(0.4, +(micG - 0.2).toFixed(1)))} aria-label={tx("작게")}><Icon n="minus" s={20} /></button>
          <b className="num">{Math.round(micG * 100)}%</b>
          <button onClick={() => setMicG(Math.min(3, +(micG + 0.2).toFixed(1)))} aria-label={tx("크게")}><Icon n="plus" s={20} /></button>
        </div>
      </div>

      {done ? (
        <p className="kara-ok" role="status">
          {isNative ? tx("「{0}」에 저장했어요. 「내 목록 › 내가 부른 노래」에서 들을 수 있어요.", done.where) : tx("파일을 만들었어요.")}
          {done.url && <a className="pillbtn" href={done.url} download={done.file}><Icon n="folder" s={18} />{tx("내려받기")}</a>}
        </p>
      ) : (
        <button className="pillbtn kara-save" onClick={() => void doSave()} disabled={saving >= 0}>
          <Icon n="folder" s={18} />{saving >= 0 ? tx("저장하는 중… {0}%", Math.round(saving * 100)) : tx("반주와 섞어 저장")}
        </button>
      )}
      {fail && <p className="kara-err" role="alert">{fail}</p>}
      <button className="textlink kara-again" onClick={() => { stopListen(); onAgain() }}>{tx("다시 부르기")}</button>
    </div>
  )
}

/* ───────── 톡 눌러 가사 박자 맞추기 ───────── */
function SyncLyrics({ t, ly, el, label, onDone }: { t: Track; ly: Lyrics; el: HTMLAudioElement; label: string; onDone: () => void }) {
  const lines = linesOf(ly.text)
  const idx = lines.map((l, i) => (l ? i : -1)).filter((i) => i >= 0)
  const [times, setTimes] = useState<(number | null)[]>(() => lines.map(() => null))
  const [k, setK] = useState(0) // 다음에 누를 줄(idx 안 순번)
  const [slow, setSlow] = useState(false)
  const [started, setStarted] = useState(false)
  const [now, setNow] = useState(0)
  useEffect(() => {
    let raf = 0
    const tick = () => { setNow(el.currentTime); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [el])
  useEffect(() => { el.playbackRate = slow ? 0.75 : 1; (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true }, [slow, el])
  const finish = (tt = times) => {
    el.pause()
    setLyrics(t, { text: ly.text, t: tt, off: 0 })
    onDone()
  }
  const begin = () => { el.currentTime = 0; el.play().catch(() => {}); setStarted(true); el.onended = () => finish() }
  // 사람은 줄이 시작되고 조금 늦게 누르므로 0.15초 앞당겨 적는다
  const tap = () => {
    if (!started || k >= idx.length) return
    const v = times.slice(); v[idx[k]] = Math.max(0, +(el.currentTime - 0.15).toFixed(2))
    setTimes(v)
    if (k + 1 >= idx.length) finish(v)
    else setK(k + 1)
  }
  const back = () => {
    if (k === 0) { el.currentTime = 0; return }
    const v = times.slice(); v[idx[k - 1]] = null
    setTimes(v); setK(k - 1)
    const prev = k >= 2 ? times[idx[k - 2]] : 0
    el.currentTime = Math.max(0, (prev ?? 0) - 1)
  }
  useEffect(() => () => { el.onended = null; el.pause(); el.playbackRate = 1 }, [el])
  const cur = idx[k], nx = idx[k + 1], pv = k > 0 ? idx[k - 1] : -1
  return (
    <Page label={tx("가사 박자 맞추기 · {0}", label)} onClose={() => { el.pause(); onDone() }}>
      <div className="kara sync">
        <p className="kara-hint">{started ? tx("다음 줄이 시작될 때 「톡」을 누르세요.") : tx("노래가 나오면, 큰 글씨의 줄이 시작될 때마다 아래 「톡」을 눌러요.")}</p>
        <div className="kara-ly on">
          <p className="kara-l2">{pv >= 0 ? lines[pv] : ' '}</p>
          <p className="kara-l0">{cur != null ? lines[cur] : tx("다 맞췄어요")}</p>
          <p className="kara-l1">{nx != null ? lines[nx] : ' '}</p>
        </div>
        <p className="kara-cnt num">{tx("{0} / {1}줄 · {2}", Math.min(k, idx.length), idx.length, fmt(now))}</p>
        {started
          ? <button className="go kara-tap" onClick={tap} disabled={k >= idx.length}>{tx("톡")}</button>
          : <button className="go kara-tap" onClick={begin}><Icon n="play" s={24} />{tx("노래 틀고 시작")}</button>}
        <div className="kara-syncact">
          <button className="pillbtn" onClick={back} disabled={!started}><Icon n="rew" s={18} />{tx("한 줄 뒤로")}</button>
          <button className={'pillbtn' + (slow ? ' on' : '')} aria-pressed={slow} onClick={() => setSlow(!slow)}>{tx("천천히(0.75배)")}</button>
        </div>
        {started && k > 0 && <button className="textlink" onClick={() => finish()}>{tx("여기까지 저장하고 마치기")}</button>}
        <p className="kara-note">{tx("맞추는 동안에는 가수 목소리가 그대로 나와요. 다 맞추면 노래방에서 가사가 노래를 따라가요.")}</p>
      </div>
    </Page>
  )
}

const HELP: [string, string][] = [
  ["부르기", "「녹음하며 부르기」를 누르면 반주가 나오고 내 노래를 녹음해요. 다 부르면 점수가 나와요. 녹음 없이 부를 수도 있어요."],
  ["AI로 가수 목소리 지우기", "AI가 곡에서 목소리만 떼어 내 깨끗한 반주를 만들어요. 처음 한 번은 휴대폰이 직접 계산해서 몇 분 걸리고, 다음부터는 바로 써요. 노래는 휴대폰 밖으로 나가지 않아요."],
  ["빠르게 줄이기", "기다리기 싫을 때는 그대로·조금·많이·최대 중에 골라요. 왼쪽·오른쪽 한가운데 소리를 덜어 내는 방식이라 곡에 따라 목소리가 남을 수 있어요."],
  ["키·빠르기", "키는 반음씩 올리고 내려요. 빠르기를 바꿔도 키는 그대로예요. 곡마다 기억해요."],
  ["가사", "가사를 넣고 「톡 눌러 박자 맞추기」를 하면, 다음부터 가사가 노래를 따라가요. 곡 옆 가사 파일(.lrc)이 있으면 저절로 써요."],
  ["녹음과 저장", "들어 보고 박자와 내 목소리 크기를 맞춘 뒤 「반주와 섞어 저장」을 눌러요. 휴대폰 「음악/온음/노래방」에 저장되고 「내가 부른 노래」 목록에 모여요."],
  ["이어폰", "이어폰을 끼고 부르면 반주가 녹음에 섞이지 않아 깨끗해요. 블루투스 이어폰은 소리가 늦게 들려 박자를 조금 맞춰야 할 수 있어요."],
  ["끄기", "노래방을 쓰지 않으면 「설정 › 노래방 쓰기」를 끄세요. 노래방 단추와 목록이 모두 사라져요."],
]
function KaraHelp({ onClose }: { onClose: () => void }) {
  return (
    <Sheet label={tx("노래방 사용법")} onClose={onClose} tall>
      <h2 className="q">{tx("노래방 사용법")}</h2>
      <ol className="cue-help">{HELP.map(([h, d]) => <li key={h}><b>{tx(h)}</b><span>{tx(d)}</span></li>)}</ol>
      <button className="go" onClick={onClose}>{tx("알겠어요")}</button>
    </Sheet>
  )
}

/** 「쉼」에서 노래방으로 바로 들어갈 때 부를 곡 고르기 */
export function KaraPick({ music, now, onPick, onClose }: { music: Track[]; now: Track | null; onPick: (t: Track) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const found = useMemo(() => {
    const f = music.filter((t) => { const x = info(t); return matches(x.song, q) || matches(x.singer, q) || matches(t.title, q) })
    return !q && now && !now.talk ? [now, ...f.filter((t) => t.id !== now.id)] : f
  }, [music, q, now])
  return (
    <Sheet label={tx("부를 곡 고르기")} onClose={onClose} tall>
      <div className="sh-row">
        <h2 className="q">{tx("부를 곡 고르기")}</h2>
        <button className="pillbtn" onClick={onClose}>{tx("닫기")}</button>
      </div>
      <label className="search">
        <Icon n="search" s={20} />
        <span className="sr">{tx("곡, 부른 사람 찾기")}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("곡·부른 사람 (초성도 돼요)")} autoComplete="off" enterKeyHint="search" />
      </label>
      {found.length === 0 && <p className="empty">{tx("맞는 곡이 없어요.")}</p>}
      <div className="sheet-list">
        <VirtualList items={found} className="list" render={(t) => {
          const x = info(t)
          return (
            <li key={t.id}>
              <button className="lrow" onClick={() => onPick(t)}>
                <span className="x"><span className="x1">{!q && now && t.id === now.id && <b className="newb">{tx("듣던 곡")}</b>}{x.song}</span><span className="x2">{whoLine(x) || ' '}</span></span>
                <span className="tag">{tx("부르기")}</span>
              </button>
            </li>
          )
        }} />
      </div>
    </Sheet>
  )
}
