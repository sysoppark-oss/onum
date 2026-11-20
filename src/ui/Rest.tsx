// 「쉼」: 오늘의 한 문장, 말씀 천천히 보기, 찬송가 반주(준비 중), 보기 설정, 온음이 무료인 이유
import { useCallback, useState } from 'react'
import { DAILY, today } from '../lib/verses'
import { Icon } from './common'
import { Page } from './Sheets'
import type { Battery } from './Battery'

const REPO = 'https://github.com/sysoppark-oss/onum'
const MAIL = 'sysoppark@gmail.com'

export function RestScreen({ easy, setEasy, onFolders, battery, onBattery, norm, setNorm, verseMove, setVerseMove }: {
  easy: boolean; setEasy: (v: boolean) => void; onFolders?: () => void; battery: Battery; onBattery: () => void
  norm: boolean; setNorm: (v: boolean) => void; verseMove: boolean; setVerseMove: (v: boolean) => void
}) {
  const [about, setAbout] = useState(false)
  const [reading, setReading] = useState(false)
  const closeAbout = useCallback(() => setAbout(false), [])
  const closeReading = useCallback(() => setReading(false), [])
  const v = today()
  return (
    <div className="page rest-page">
      <div className="ph"><h1>쉼</h1></div>
      <section className="rest" aria-labelledby="rest-h">
        <h2 className="wl" id="rest-h">오늘의 한 문장</h2>
        <p className="rest-w">{v.text}</p>
        <p className="wr">{v.ref} · 개역한글</p>
        <button className="go rest-go" onClick={() => setReading(true)}>말씀 천천히 보기</button>
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
            <span className="x"><span className="x1" id="vm-l">아래 말씀 천천히 바꾸기</span><span className="x2">끄면 「지금」 아래 말씀이 멈춘 채로 보여요</span></span>
            <button className="sw" role="switch" aria-checked={verseMove} aria-labelledby="vm-l" onClick={() => setVerseMove(!verseMove)} />
          </div>
        </li>
        <li>
          <div className="lrow">
            <span className="x"><span className="x1" id="norm-l">곡마다 소리 크기 맞추기</span><span className="x2">유난히 큰 곡은 줄여서 비슷하게 들려요</span></span>
            <button className="sw" role="switch" aria-checked={norm} aria-labelledby="norm-l" onClick={() => setNorm(!norm)} />
          </div>
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

      <button className="why" onClick={() => setAbout(true)}>온음이 무료인 이유 <Icon n="chev" s={16} /></button>
      {about && <AboutPage onClose={closeAbout} />}
      {reading && <ReadPage onClose={closeReading} />}
    </div>
  )
}

/** 말씀을 한 문장씩 크게 */
export function ReadPage({ onClose }: { onClose: () => void }) {
  const start = Math.max(0, DAILY.findIndex((d) => d.ref === today().ref))
  const [i, setI] = useState(start)
  const v = DAILY[i]
  return (
    <Page label="말씀 천천히 보기" onClose={onClose}>
      <div className="read">
        <p className="read-w" aria-live="polite">{v.text}</p>
        <p className="wr">{v.ref} · 개역한글</p>
      </div>
      <div className="nb">
        <button className="ghost" onClick={() => setI((i + DAILY.length - 1) % DAILY.length)}>앞 말씀</button>
        <button className="go" onClick={() => setI((i + 1) % DAILY.length)}>다음 말씀</button>
      </div>
      <p className="hint num">{i + 1} / {DAILY.length}</p>
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
