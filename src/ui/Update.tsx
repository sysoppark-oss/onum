// 새 판이 나왔어요: 휴대폰 쪽이 바뀐 판은 내려받기를 브라우저로 연다.
// 앱이 직접 설치하면 Google Play 프로텍트가 「유해한 앱」으로 막아서, 설치는 늘 하던 대로 한다.
import { useState } from 'react'
import { openDownload } from '../lib/native'
import { BUILD, type Remote } from '../lib/update'
import { save } from '../lib/store'
import { Sheet } from './common'

export function UpdateSheet({ r, onClose }: { r: Remote; onClose: () => void }) {
  const [st, setSt] = useState<'ready' | 'ok' | 'fail'>('ready')
  const go = async () => setSt(r.apk && (await openDownload(r.apk)) ? 'ok' : 'fail')
  const later = () => { save('skipApk', r.sha); onClose() }
  return (
    <Sheet label="새 판이 나왔어요" onClose={later}>
      <div>
        <h2 className="q">새 판이 나왔어요 · 시험판 <span className="num">{r.run}</span>번</h2>
        {st === 'ready' && <p className="say">이번 판은 휴대폰 쪽도 바뀌어서 새로 설치해야 해요.</p>}
        {st === 'ok' && <p className="say" role="status">내려받기를 열었어요. 다 받아지면 알림이나 내려받은 파일을 눌러 설치해 주세요.</p>}
        {st === 'fail' && <p className="say" role="alert">내려받기를 열지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.</p>}
      </div>
      {st === 'ready' && <p className="hint">지금 쓰는 판은 <span className="num">{BUILD.run || '?'}</span>번이에요. 「받기」를 누르면 브라우저에서 내려받아요. 듣던 목록·편집곡·설정은 그대로 남아요.</p>}
      <div className="nb">
        {st !== 'ok' && <button className="ghost" onClick={later}>나중에</button>}
        {st !== 'ok' && <button className="go" onClick={go}>{st === 'ready' ? '받기' : '다시 하기'}</button>}
        {st === 'ok' && <button className="go" onClick={onClose}>닫기</button>}
      </div>
    </Sheet>
  )
}
