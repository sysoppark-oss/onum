// 「쉼」: 오늘의 한 문장, 말씀 천천히 보기, 찬송가 반주(준비 중), 보기 설정, 온음이 무료인 이유
import { CURRENT } from '../lib/version'
import { useCallback, useState } from 'react'
import { dayIndex, type Verse } from '../lib/verses'
import { MOODS, YEAR } from '../lib/verses365'
import { setKjv, shown, useKjv } from '../lib/kjv'
import { Icon } from './common'
import { Page, XfadeChips } from './Sheets'
import type { Player } from '../lib/usePlayer'
import { Share } from '@capacitor/share'
import { isNative } from '../lib/native'
import type { Battery } from './Battery'
import { EFFECTIVE, PRIVACY } from '../lib/privacy'

const REPO = 'https://github.com/sysoppark-oss/onum'
const MAIL = 'sysoppark@gmail.com'

export function RestScreen({ easy, setEasy, onFolders, battery, onBattery, verseMove, setVerseMove, player, onNews }: {
  easy: boolean; setEasy: (v: boolean) => void; onFolders?: () => void; battery: Battery; onBattery: () => void
  verseMove: boolean; setVerseMove: (v: boolean) => void; player: Player; onNews: () => void
}) {
  const norm = player.normOn, setNorm = player.setNorm
  const kjv = useKjv()
  const [shared, setShared] = useState('')
  const [about, setAbout] = useState(false)
  const [reading, setReading] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const closePrivacy = useCallback(() => setPrivacy(false), [])
  const closeAbout = useCallback(() => setAbout(false), [])
  const closeReading = useCallback(() => setReading(false), [])
  const v = shown(YEAR[dayIndex()], kjv)
  const [mood, setMood] = useState(false)
  const closeMood = useCallback(() => setMood(false), [])
  return (
    <div className="page rest-page">
      <div className="ph"><h1>쉼</h1></div>
      <section className="rest" aria-labelledby="rest-h">
        <h2 className="wl" id="rest-h">오늘의 한 문장</h2>
        <p className="rest-w" lang={v.lang}>{v.text}</p>
        <p className="wr">{v.ref} · {v.ver}</p>
        <button className="go rest-go" onClick={() => setReading(true)}>말씀 천천히 보기</button>
        <button className="ghost rest-mood" onClick={() => setMood(true)}>지금 내 마음에 맞는 말씀</button>
        <p className="rest-n">듣고 있는 음악은 그대로 흘러요</p>
      </section>

      <h2 className="sub">찬송가 반주 <span>· 무료 · 가사 없이 곡조만</span></h2>
      <p className="soon">연주와 녹음을 준비하고 있어요. 다 되면 여기서 무료로 받을 수 있어요.</p>

      <h2 className="sub">보기</h2>
      <ul className="pl">
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="easy-l">쉬운 화면</span><span className="x2">글자와 버튼을 크게, 꼭 필요한 것만</span></span>
            <button className="sw" role="switch" aria-checked={easy} aria-labelledby="easy-l" onClick={() => setEasy(!easy)} />
          </div>
        </li>
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="vm-l">아래 말씀 흘려 보내기</span><span className="x2">끄면 「지금」 아래 말씀이 멈춘 채로 보여요</span></span>
            <button className="sw" role="switch" aria-checked={verseMove} aria-labelledby="vm-l" onClick={() => setVerseMove(!verseMove)} />
          </div>
        </li>
        <li className="setrow">
          <span className="x"><span className="x1" id="kjv-l">말씀 역본</span><span className="x2">{kjv ? '영어 흠정역(KJV)으로 보여요' : '한글 개역한글로 보여요'}</span></span>
          <div className="seg2 ver" role="radiogroup" aria-labelledby="kjv-l">
            <button role="radio" aria-checked={!kjv} className={!kjv ? 'on' : undefined} onClick={() => setKjv(false)}>개역한글</button>
            <button role="radio" aria-checked={kjv} className={kjv ? 'on' : undefined} onClick={() => setKjv(true)} lang="en">KJV</button>
          </div>
        </li>
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="norm-l">곡마다 소리 크기 맞추기</span><span className="x2">유난히 큰 곡은 줄여서 비슷하게 들려요</span></span>
            <button className="sw" role="switch" aria-checked={norm} aria-labelledby="norm-l" onClick={() => setNorm(!norm)} />
          </div>
        </li>
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="sil-l">곡 앞뒤 빈 소리 건너뛰기</span><span className="x2">녹음 앞뒤의 조용한 부분을 건너뛰어요</span></span>
            <button className="sw" role="switch" aria-checked={player.skipSilence} aria-labelledby="sil-l" onClick={() => player.setSkipSilence(!player.skipSilence)} />
          </div>
        </li>
        <li className="setrow">
          <span className="x"><span className="x1" id="xf-l">곡 사이 넘김</span><span className="x2">{player.xfade ? `앞 곡이 끝나기 ${player.xfade}초 전부터 다음 곡과 겹쳐요` : '빈틈 없이 바로 다음 곡으로 넘어가요'}</span></span>
          <XfadeChips player={player} />
        </li>
        {battery && (
          <li>
            <button className="lrow" onClick={onBattery}>
              <span className="x"><span className="x1">화면이 꺼져도 계속 듣기</span><span className={'x2' + (battery.free ? '' : ' need')}>{battery.free ? '배터리 절약에서 빠져 있어요' : '설정이 필요해요 · 잠들기 중에 끊길 수 있어요'}</span></span>
              <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
            </button>
          </li>
        )}
        {onFolders && (
          <li>
            <button className="lrow" onClick={onFolders}>
              <span className="x"><span className="x1">가져올 폴더</span><span className="x2">듣지 않는 폴더는 빼 둘 수 있어요</span></span>
              <span className="go-r" aria-hidden="true"><Icon n="chev" s={18} /></span>
            </button>
          </li>
        )}
      </ul>

      <button className="sharebtn" onClick={async () => setShared(await shareApp())}><Icon n="heart" s={20} />이 앱 알려 주기</button>
      {shared && <p className="done-note" role="status">{shared}</p>}
      <div className="whys">
        <button className="why" onClick={() => setAbout(true)}>온음이 무료인 이유 <Icon n="chev" s={16} /></button>
        <button className="why" onClick={() => setPrivacy(true)}>개인정보 처리방침 <Icon n="chev" s={16} /></button>
      </div>
      <button className="why ver" onClick={onNews}><span className="num">온음 {CURRENT.v}</span> · {CURRENT.name} · 새로워진 점 <Icon n="chev" s={16} /></button>
      {about && <AboutPage onClose={closeAbout} />}
      {reading && <ReadPage onClose={closeReading} />}
      {privacy && <PrivacyPage onClose={closePrivacy} />}
      {mood && <MoodPage onClose={closeMood} />}
    </div>
  )
}

const moodName = (id: string) => MOODS.find((m) => m.id === id)?.name ?? ''

/** 말씀을 한 문장씩 크게. list가 없으면 365구절을 오늘부터 */
export function ReadPage({ onClose, list, title = '말씀 천천히 보기', startAt }: { onClose: () => void; list?: (Verse & { m: string })[]; title?: string; startAt?: number }) {
  const all = list ?? YEAR
  const [i, setI] = useState(() => startAt ?? (list ? 0 : dayIndex()))
  const v0 = all[i]
  const v = shown(v0, useKjv())
  const n = all.length
  return (
    <Page label={title} onClose={onClose}>
      <div className="read">
        {!list && <p className="read-m">{i === dayIndex() ? '오늘' : `${i + 1}번째`} · {moodName(v0.m)}</p>}
        <p className="read-w" aria-live="polite" lang={v.lang}>{v.text}</p>
        <p className="wr">{v.ref} · {v.ver}</p>
      </div>
      <div className="nb">
        <button className="ghost" onClick={() => setI((i + n - 1) % n)}>앞 말씀</button>
        <button className="go" onClick={() => setI((i + 1) % n)}>다음 말씀</button>
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
    <Page label="지금 내 마음" onClose={onClose}>
      <p className="say">지금 마음에 가까운 것을 고르세요. 그 마음에 맞는 말씀을 보여 드려요.</p>
      {groups.map((g) => (
        <section key={g.g} className="moods" aria-labelledby={'mg-' + g.g}>
          <h3 id={'mg-' + g.g}><b>{g.g}</b> {g.gName}</h3>
          <div className="mchips">
            {g.ms.map((m) => <button key={m.id} onClick={() => setPick(m.id)}>{m.name}</button>)}
          </div>
        </section>
      ))}
      {pick && <ReadPage onClose={closePick} list={list} title={moodName(pick)} startAt={Math.floor(Math.random() * list.length)} />}
    </Page>
  )
}

function Q({ t, r }: { t: string; r: string }) {
  return <blockquote><p>{t}</p><cite>{r} · 개역한글</cite></blockquote>
}

/** 앱 안 글: 온음을 만든 이유 (2026-11-20 확정본) */
function AboutPage({ onClose }: { onClose: () => void }) {
  return (
    <Page label="온음이 무료인 이유" onClose={onClose}>
      <article className="about">
        <h3>이름 이야기</h3>
        <p>"온음"은 음악에서 두 반음을 합한 음정을 부르는 말이에요. 그리고 성경의 이 말씀에서 이름을 지었어요.</p>
        <Q t="그 소리가 온 땅에 퍼졌고 그 말씀이 땅끝까지 이르렀도다" r="로마서 10:18" />
        <p>온 땅에 퍼진 소리, 그래서 "온음"이에요.</p>

        <h3>왜 무료인가요</h3>
        <p>온음에는 광고도, 구독료도, 회원 가입도 없어요. 듣는 음악이나 기록을 어디로도 보내지 않아요. 모든 것이 이 휴대폰 안에만 있어요. 돈을 벌려고 만든 앱이 아니기 때문이에요. 우리가 먼저 값없이 받은 사랑이 있어서, 그 마음을 이 작은 앱에 담아 나누고 싶었어요.</p>
        <Q t="너희가 거저 받았으니 거저 주어라" r="마태복음 10:8" />

        <h3>우리가 받은 사랑</h3>
        <Q t="하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라" r="요한복음 3:16" />
        <Q t="우리가 아직 죄인되었을 때에 그리스도께서 우리를 위하여 죽으심으로 하나님께서 우리에게 대한 자기의 사랑을 확증하셨느니라" r="로마서 5:8" />
        <Q t="성경대로 그리스도께서 우리 죄를 위하여 죽으시고 장사 지낸바 되었다가 성경대로 사흘만에 다시 살아나사" r="고린도전서 15:3-4" />
        <Q t="때가 찼고 하나님 나라가 가까왔으니 회개하고 복음을 믿으라" r="마가복음 1:15" />
        <Q t="누구든지 주의 이름을 부르는 자는 구원을 얻으리라" r="로마서 10:13" />

        <h3>누구나 확인할 수 있어요</h3>
        <p>온음을 만든 프로그램 원본은 모두에게 공개되어 있어요. 이 앱이 몰래 하는 일이 없다는 것을 누구나 직접 확인할 수 있어요.</p>
        <a className="link-row" href={REPO} target="_blank" rel="noreferrer"><Icon n="code" s={20} />프로그램 원본 보기</a>

        <h3>만든 이</h3>
        <p>기독교한국침례회 맑은물속교회(평창)</p>

        <h3>연락처</h3>
        <a className="link-row" href={`mailto:${MAIL}`}><Icon n="mail" s={20} />{MAIL}</a>
        <p>궁금한 점, 고칠 점, 신앙에 대한 물음 모두 반가워요.</p>

        <p className="bless">음악을 듣는 모든 순간이 평안하시기를 빕니다.</p>
      </article>
    </Page>
  )
}

function PrivacyPage({ onClose }: { onClose: () => void }) {
  return (
    <Page label="개인정보 처리방침" onClose={onClose}>
      <article className="about">
        <p className="lmeta">시행일 {EFFECTIVE}</p>
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

const SHARE_TEXT = '광고 없는 무료 음악 플레이어 「온음」을 써 보세요.\n휴대폰(안드로이드): https://github.com/sysoppark-oss/onum/releases/download/test-build/onum-test.apk\n컴퓨터: https://sysoppark-oss.github.io/onum/'

/** 휴대폰은 공유 창, 컴퓨터는 공유 창이 있으면 쓰고 없으면 글을 복사한다 */
async function shareApp(): Promise<string> {
  try {
    if (isNative) { await Share.share({ title: '온음', text: SHARE_TEXT, dialogTitle: '온음 알려 주기' }); return '' }
    if (navigator.share) { await navigator.share({ title: '온음', text: SHARE_TEXT }); return '' }
    await navigator.clipboard.writeText(SHARE_TEXT)
    return '알려 줄 글을 복사했어요. 메시지 창에 붙여 넣으세요.'
  } catch {
    return ''
  }
}
