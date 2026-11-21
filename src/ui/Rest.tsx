// 「쉼」: 오늘의 한 문장, 말씀 천천히 보기, 찬송가 반주(준비 중), 보기 설정, 온음이 무료인 이유
import { rt } from './rich'
import { CURRENT } from '../lib/version'
import { load } from '../lib/store'
import { applyPending, BUILD, hasPending, type Check } from '../lib/update'
import { useCallback, useState } from 'react'
import { dayIndex, type Verse } from '../lib/verses'
import { MOODS, YEAR } from '../lib/verses365'
import { setVer, VERS, shown, useKjv } from '../lib/kjv'
import { LANGS, lang, setLang, tx } from '../lib/i18n'
import { setFlag, useFlag } from '../lib/flag'
import { Icon, nf } from './common'
import { EqPage, eqLabel } from './Eq'
import { MeditatePage } from './Meditate'
import type { Track } from '../lib/library'
import { useEq } from '../lib/eq'
import { Page, XfadeChips } from './Sheets'
import type { Player } from '../lib/usePlayer'
import { Share } from '@capacitor/share'
import { isNative } from '../lib/native'
import type { Battery } from './Battery'
import { EFFECTIVE, PRIVACY } from '../lib/privacy'
import { kindOf, useChurch } from '../lib/church'
import { ChurchCard, ChurchPage, NaverBtn } from './Church'

const REPO = 'https://github.com/sysoppark-oss/onum'
const MAIL = 'sysoppark@gmail.com'

export function RestScreen({ easy, setEasy, onFolders, battery, onBattery, verseMove, setVerseMove, player, onNews, onCheck, music }: {
  easy: boolean; setEasy: (v: boolean) => void; onFolders?: () => void; battery: Battery; onBattery: () => void
  verseMove: boolean; setVerseMove: (v: boolean) => void; player: Player; onNews: () => void; onCheck: (force?: boolean) => Promise<Check | null>; music: Track[]
}) {
  const norm = player.normOn, setNorm = player.setNorm
  const kjv = useKjv()
  const notesOn = useFlag('notes', true)
  const updOn = useFlag('updateCheck', true)
  const [chk, setChk] = useState('')
  const [ready, setReady] = useState(false) // 받아 둔 새 판을 바로 바꿔 끼울 수 있음
  const [dl, setDl] = useState(() => load<number>('dlCount', 0))
  const [shared, setShared] = useState('')
  const [about, setAbout] = useState(false)
  const church = useChurch()
  const [chOpen, setChOpen] = useState(false)
  const closeCh = useCallback(() => setChOpen(false), [])
  const [reading, setReading] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const closePrivacy = useCallback(() => setPrivacy(false), [])
  const closeAbout = useCallback(() => setAbout(false), [])
  const [eqOpen, setEqOpen] = useState(false)
  const [med, setMed] = useState(false)
  const closeMed = useCallback(() => setMed(false), [])
  const closeEq = useCallback(() => setEqOpen(false), [])
  const eqs = useEq()
  const closeReading = useCallback(() => setReading(false), [])
  const v = shown(YEAR[dayIndex()], kjv)
  const [mood, setMood] = useState(false)
  const closeMood = useCallback(() => setMood(false), [])
  return (
    <div className="page rest-page">
      <div className="ph"><h1>{tx("쉼")}</h1></div>
      {church && <div className="chtop"><ChurchCard c={church} foot={kindOf(church) === 'church' ? <NaverBtn c={church} /> : undefined} /></div>}
      <section className="rest" aria-labelledby="rest-h">
        <h2 className="wl" id="rest-h">{tx("오늘의 한 문장")}</h2>
        <p className="rest-w" lang={v.lang}>{v.text}</p>
        <p className="wr">{v.ref} · {v.ver}</p>
        <button className="go rest-go" onClick={() => setReading(true)}>{tx("말씀 천천히 보기")}</button>
        <button className="ghost rest-mood" onClick={() => setMood(true)}>{tx("지금 내 마음에 맞는 말씀")}</button>
        <button className="ghost rest-mood" onClick={() => setMed(true)}>{tx("음악과 함께 묵상하기")}</button>
        <p className="rest-n">{tx("듣고 있는 음악은 그대로 흘러요")}</p>
      </section>

      <h2 className="sub">{tx("찬송가 반주 ")}<span>{tx("· 무료 · 가사 없이 곡조만")}</span></h2>
      <p className="soon">{tx("연주와 녹음을 준비하고 있어요. 다 되면 여기서 무료로 받을 수 있어요.")}</p>

      <h2 className="sub">{tx("보기")}</h2>
      <ul className="pl">
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="easy-l">{tx("쉬운 화면")}</span><span className="x2">{tx("글자와 버튼을 크게, 꼭 필요한 것만")}</span></span>
            <button className="sw" role="switch" aria-checked={easy} aria-labelledby="easy-l" onClick={() => setEasy(!easy)} />
          </div>
        </li>
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="vm-l">{tx("아래 말씀 흘려 보내기")}</span><span className="x2">{tx("끄면 「지금」 아래 말씀이 멈춘 채로 보여요")}</span></span>
            <button className="sw" role="switch" aria-checked={verseMove} aria-labelledby="vm-l" onClick={() => setVerseMove(!verseMove)} />
          </div>
        </li>
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="nt-l">{tx("음표 띄우기")}</span><span className="x2">{tx("들을 때 파형 아래에서 음표가 떠올라요")}</span></span>
            <button className="sw" role="switch" aria-checked={notesOn} aria-labelledby="nt-l" onClick={() => setFlag('notes', !notesOn)} />
          </div>
        </li>
        {isNative && (
          <li>
            <div className="lrow">
              <span className="x"><span className="x1" id="up-l">{tx("새 판 알림")}</span><span className="x2">{tx("새 판이 나오면 받아 두거나 알려 드려요(GitHub에 확인)")}</span></span>
              <button className="sw" role="switch" aria-checked={updOn} aria-labelledby="up-l" onClick={() => setFlag('updateCheck', !updOn)} />
            </div>
          </li>
        )}
        <li className="setrow">
          <span className="x"><span className="x1" id="lang-l">{tx("화면 언어")}</span><span className="x2">{tx("바꾸면 앱을 다시 열어요")}</span></span>
          <div className="seg2 ver three" role="radiogroup" aria-labelledby="lang-l">
            {LANGS.map((l) => <button key={l.id} role="radio" aria-checked={lang === l.id} className={lang === l.id ? 'on' : undefined} lang={l.id} onClick={() => lang !== l.id && setLang(l.id)}>{l.name}</button>)}
          </div>
        </li>
        <li className="setrow">
          <span className="x"><span className="x1" id="kjv-l">{tx("말씀 역본")}</span><span className="x2">{tx("저작권이 끝난 역본만 넣었어요")}</span></span>
          <div className="seg2 ver three" role="radiogroup" aria-labelledby="kjv-l">
            {VERS.map((v) => <button key={v.id} role="radio" aria-checked={kjv === v.id} className={kjv === v.id ? 'on' : undefined} lang={v.id === 'kjv' ? 'en' : v.id === 'jkg' ? 'ja' : 'ko'} onClick={() => setVer(v.id)}>{v.name}</button>)}
          </div>
        </li>
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="norm-l">{tx("곡마다 소리 크기 맞추기")}</span><span className="x2">{tx("유난히 큰 곡은 줄여서 비슷하게 들려요")}</span></span>
            <button className="sw" role="switch" aria-checked={norm} aria-labelledby="norm-l" onClick={() => setNorm(!norm)} />
          </div>
        </li>
        <li>
          <button className="lrow" onClick={() => setEqOpen(true)}>
            <span className="x"><span className="x1">{tx("소리 맞춤")}</span><span className="x2">{tx("음악 ")}{eqLabel(eqs.music.id)} {tx("· 강의 ")}{eqLabel(eqs.talk.id)}</span></span>
            <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
          </button>
        </li>
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="sil-l">{tx("곡 앞뒤 빈 소리 건너뛰기")}</span><span className="x2">{tx("녹음 앞뒤의 조용한 부분을 건너뛰어요")}</span></span>
            <button className="sw" role="switch" aria-checked={player.skipSilence} aria-labelledby="sil-l" onClick={() => player.setSkipSilence(!player.skipSilence)} />
          </div>
        </li>
        <li className="setrow">
          <span className="x"><span className="x1" id="xf-l">{tx("곡 사이 넘김")}</span><span className="x2">{player.xfade ? tx("앞 곡이 끝나기 {0}초 전부터 다음 곡과 겹쳐요", player.xfade) : tx("빈틈 없이 바로 다음 곡으로 넘어가요")}</span></span>
          <XfadeChips player={player} />
        </li>
        {battery && (
          <li>
            <button className="lrow" onClick={onBattery}>
              <span className="x"><span className="x1">{tx("화면이 꺼져도 계속 듣기")}</span><span className={'x2' + (battery.free ? '' : ' need')}>{battery.free ? tx("배터리 절약에서 빠져 있어요") : tx("설정이 필요해요 · 잠들기 중에 끊길 수 있어요")}</span></span>
              <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
            </button>
          </li>
        )}
        {onFolders && (
          <li>
            <button className="lrow" onClick={onFolders}>
              <span className="x"><span className="x1">{tx("가져올 폴더")}</span><span className="x2">{tx("듣지 않는 폴더는 빼 둘 수 있어요")}</span></span>
              <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
            </button>
          </li>
        )}
      </ul>

      <button className="sharebtn" onClick={async () => setShared(await shareApp())}><Icon n="heart" s={20} />{tx("이 앱 알려 주기")}</button>
      {shared && <p className="done-note" role="status">{shared}</p>}
      {dl > 0 && <p className="dlcount">{rt("**{0}**번 내려받았어요 · 고맙습니다", nf.format(dl))}</p>}

      <h2 className="sub">{tx("교회 · 선물 카드")}</h2>
      <ul className="pl">
        <li><button className="lrow" onClick={() => setChOpen(true)}><span className="x">
          <span className="x1">{church ? tx("카드 보내기 · 고치기") : tx("카드 만들기")}</span>
          <span className="x2">{church ? tx("QR이나 링크로 보내요") : tx("교회 이름, 선물·축하, 커플 이름을 화면 맨 위에")}</span>
        </span><Icon n="chev" s={20} /></button></li>
      </ul>
      <h2 className="sub">{tx("온음에 대하여")}</h2>
      <ul className="pl about">
        <li><button className="lrow" onClick={() => setAbout(true)}><span className="x"><span className="x1">{tx("온음이 무료인 이유")}</span></span><Icon n="chev" s={20} /></button></li>
        <li><button className="lrow" onClick={() => setPrivacy(true)}><span className="x"><span className="x1">{tx("개인정보 처리방침")}</span></span><Icon n="chev" s={20} /></button></li>
        <li>
          <button className="lrow" onClick={onNews}>
            <span className="x"><span className="x1">{tx("새로워진 점")}</span><span className="x2"><span className="num">{tx("온음 ")}{CURRENT.v}</span> · {CURRENT.name}{BUILD.run ? <> {tx("· 시험판 ")}<span className="num">{BUILD.run}</span>{tx("번")}</> : null}</span></span>
            <Icon n="chev" s={20} />
          </button>
        </li>
        {isNative && (
          <li>
            <div className="lrow">
              <span className="x"><span className="x1">{tx("새 판 확인")}</span><span className="x2" role="status">{chk === '…' ? tx("확인하는 중…") : chk || tx("새 판이 있는지 지금 알아봐요")}</span></span>
              {ready
                ? <button className="pillbtn small" onClick={() => { player.pause(); applyPending() }}>{tx("지금 바꾸기")}</button>
                : <button className="pillbtn small" disabled={chk === '…'} onClick={async () => {
                    setChk('…')
                    const u = await onCheck(true)
                    setDl(load<number>('dlCount', 0))
                    setReady(u?.kind === 'web' && hasPending())
                    setChk(!u ? tx("확인하지 못했어요. 인터넷 연결을 확인해 주세요") : u.kind === 'same' ? tx("지금이 가장 새 판이에요") : u.kind === 'web' ? tx("새 판을 받아 두었어요. 「지금 바꾸기」를 누르면 바로 바뀌어요") : tx("새 판이 나왔어요"))
                  }}>{tx("확인")}</button>}
            </div>
          </li>
        )}
      </ul>
      {eqOpen && <EqPage onClose={closeEq} />}
      {med && <MeditatePage player={player} music={music} onClose={closeMed} />}
      {about && <AboutPage onClose={closeAbout} />}
      {chOpen && <ChurchPage onClose={closeCh} />}
      {reading && <ReadPage onClose={closeReading} />}
      {privacy && <PrivacyPage onClose={closePrivacy} />}
      {mood && <MoodPage onClose={closeMood} />}
    </div>
  )
}

const moodName = (id: string) => tx(MOODS.find((m) => m.id === id)?.name ?? '')

/** 말씀을 한 문장씩 크게. list가 없으면 365구절을 오늘부터 */
export function ReadPage({ onClose, list, title = tx("말씀 천천히 보기"), startAt }: { onClose: () => void; list?: (Verse & { m: string })[]; title?: string; startAt?: number }) {
  const all = list ?? YEAR
  const [i, setI] = useState(() => startAt ?? (list ? 0 : dayIndex()))
  const v0 = all[i]
  const v = shown(v0, useKjv())
  const n = all.length
  return (
    <Page label={title} onClose={onClose}>
      <div className="read">
        {!list && <p className="read-m">{i === dayIndex() ? tx("오늘") : tx("{0}번째", i + 1)} · {moodName(v0.m)}</p>}
        <p className="read-w" aria-live="polite" lang={v.lang}>{v.text}</p>
        <p className="wr">{v.ref} · {v.ver}</p>
      </div>
      <div className="nb">
        <button className="ghost" onClick={() => setI((i + n - 1) % n)}>{tx("앞 말씀")}</button>
        <button className="go" onClick={() => setI((i + 1) % n)}>{tx("다음 말씀")}</button>
      </div>
      <p className="hint num">{i + 1} / {n}</p>
    </Page>
  )
}

/** 지금 내 마음: 마음을 고르면 그 마음의 말씀 */
export function MoodPage({ onClose }: { onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const closePick = useCallback(() => setPick(null), [])
  const groups = MOODS.reduce<{ g: string; gName: string; ms: typeof MOODS }[]>((a, m) => {
    const last = a[a.length - 1]
    if (last && last.g === m.g) last.ms.push(m); else a.push({ g: m.g, gName: m.gName, ms: [m] })
    return a
  }, [])
  const list = pick ? YEAR.filter((v) => v.m === pick) : []
  return (
    <Page label={tx("지금 내 마음")} onClose={onClose}>
      <p className="say">{tx("지금 마음에 가까운 것을 고르세요. 그 마음에 맞는 말씀을 보여 드려요.")}</p>
      {groups.map((g) => (
        <section key={g.g} className="moods" aria-labelledby={'mg-' + g.g}>
          <h3 id={'mg-' + g.g}>{lang === 'ko' && <b>{g.g}</b>} {tx(g.gName)}</h3>
          <div className="mchips">
            {g.ms.map((m) => <button key={m.id} onClick={() => setPick(m.id)}>{tx(m.name)}</button>)}
          </div>
        </section>
      ))}
      {pick && <ReadPage onClose={closePick} list={list} title={moodName(pick)} startAt={Math.floor(Math.random() * list.length)} />}
    </Page>
  )
}

/** 말씀 인용: 고른 역본의 검증된 본문만 쓴다(번역하지 않음) */
function Q({ t, r }: { t: string; r: string }) {
  const v = shown({ text: t, ref: r }, useKjv())
  return <blockquote lang={v.lang}><p>{v.text}</p><cite>{v.ref} · {v.ver}</cite></blockquote>
}

/** 앱 안 글: 온음을 만든 이유 (2026-11-20 확정본) */
function AboutPage({ onClose }: { onClose: () => void }) {
  return (
    <Page label={tx("온음이 무료인 이유")} onClose={onClose}>
      <article className="about">
        <h3>{tx("이름 이야기")}</h3>
        <p>{tx("\"온음\"은 음악에서 두 반음을 합한 음정을 부르는 말이에요. 그리고 성경의 이 말씀에서 이름을 지었어요.")}</p>
        <Q t="그 소리가 온 땅에 퍼졌고 그 말씀이 땅끝까지 이르렀도다" r="로마서 10:18" />
        <p>{tx("온 땅에 퍼진 소리, 그래서 \"온음\"이에요.")}</p>

        <h3>{tx("왜 무료인가요")}</h3>
        <p>{tx("온음에는 광고도, 구독료도, 회원 가입도 없어요. 듣는 음악이나 기록을 어디로도 보내지 않아요. 모든 것이 이 휴대폰 안에만 있어요. 돈을 벌려고 만든 앱이 아니기 때문이에요. 우리가 먼저 값없이 받은 사랑이 있어서, 그 마음을 이 작은 앱에 담아 나누고 싶었어요.")}</p>
        <Q t="너희가 거저 받았으니 거저 주어라" r="마태복음 10:8" />

        <h3>{tx("우리가 받은 사랑")}</h3>
        <Q t="하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라" r="요한복음 3:16" />
        <Q t="우리가 아직 죄인되었을 때에 그리스도께서 우리를 위하여 죽으심으로 하나님께서 우리에게 대한 자기의 사랑을 확증하셨느니라" r="로마서 5:8" />
        <Q t="성경대로 그리스도께서 우리 죄를 위하여 죽으시고 장사 지낸바 되었다가 성경대로 사흘만에 다시 살아나사" r="고린도전서 15:3-4" />
        <Q t="때가 찼고 하나님 나라가 가까왔으니 회개하고 복음을 믿으라" r="마가복음 1:15" />
        <Q t="누구든지 주의 이름을 부르는 자는 구원을 얻으리라" r="로마서 10:13" />

        <h3>{tx("누구나 확인할 수 있어요")}</h3>
        <p>{tx("온음을 만든 프로그램 원본은 모두에게 공개되어 있어요. 이 앱이 몰래 하는 일이 없다는 것을 누구나 직접 확인할 수 있어요.")}</p>
        <a className="link-row" href={REPO} target="_blank" rel="noreferrer"><Icon n="code" s={20} />{tx("프로그램 원본 보기")}</a>

        <h3>{tx("만든 이")}</h3>
        <p>{tx("기독교한국침례회 맑은물속교회(평창)")}</p>

        <h3>{tx("연락처")}</h3>
        <a className="link-row" href={`mailto:${MAIL}`}><Icon n="mail" s={20} />{MAIL}</a>
        <p>{tx("궁금한 점, 고칠 점, 신앙에 대한 물음 모두 반가워요.")}</p>

        <p className="bless">{tx("음악을 듣는 모든 순간이 평안하시기를 빕니다.")}</p>
      </article>
    </Page>
  )
}

function PrivacyPage({ onClose }: { onClose: () => void }) {
  return (
    <Page label={tx("개인정보 처리방침")} onClose={onClose}>
      <article className="about">
        <p className="lmeta">{tx("시행일 ")}{EFFECTIVE}</p>
        {PRIVACY.map(([h, ps]) => (
          <section key={h}>
            <h3>{h}</h3>
            {ps.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
      </article>
    </Page>
  )
}

const SHARE_TEXT = tx("광고 없는 무료 음악 플레이어 「온음」을 써 보세요.\n휴대폰(안드로이드): https://github.com/sysoppark-oss/onum/releases/download/test-build/onum-test.apk\n컴퓨터: https://sysoppark-oss.github.io/onum/")

/** 휴대폰은 공유 창, 컴퓨터는 공유 창이 있으면 쓰고 없으면 글을 복사한다 */
async function shareApp(): Promise<string> {
  try {
    if (isNative) { await Share.share({ title: tx("온음"), text: SHARE_TEXT, dialogTitle: tx("온음 알려 주기") }); return '' }
    if (navigator.share) { await navigator.share({ title: tx("온음"), text: SHARE_TEXT }); return '' }
    await navigator.clipboard.writeText(SHARE_TEXT)
    return tx("알려 줄 글을 복사했어요. 메시지 창에 붙여 넣으세요.")
  } catch {
    return ''
  }
}
