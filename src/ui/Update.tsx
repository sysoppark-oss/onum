// 새 판이 나왔어요: 안드로이드 쪽이 바뀐 판은 APK를 받아 설치 화면까지 연다(「설치」는 사람이 한 번 누른다)
import { useState } from 'react'
import { installApk } from '../lib/native'
import { BUILD, type Remote } from '../lib/update'
import { save } from '../lib/store'
import { Sheet } from './common'

export function UpdateSheet({ r, onClose }: { r: Remote; onClose: () => void }) {
  const [st, setSt] = useState<'ready' | 'work' | 'ok' | 'perm' | 'fail'>('ready')
  const [f, setF] = useState(0)
  const go = async () => {
    if (!r.apk) { setSt('fail'); return }
    setSt('work'); setF(0)
    const x = await installApk(r.apk, setF)
    setSt(x === 'ok' ? 'ok' : x === 'need_permission' ? 'perm' : 'fail')
  }
  const later = () => { save('skipApk', r.sha); onClose() }
  return (
    <Sheet label="새 판이 나왔어요" onClose={st === 'work' ? () => {} : later}>
      <div>
        <h2 className="q">새 판이 나왔어요 · 시험판 <span className="num">{r.run}</span>번</h2>
        {st === 'ready' && <p className="say">이번 판은 휴대폰 쪽도 바뀌어서 새로 설치해야 해요. 받은 뒤 「설치」를 한 번 눌러 주세요.</p>}
        {st === 'work' && <p className="say" role="status">받고 있어요… <span className="num">{Math.round(f * 100)}%</span></p>}
        {st === 'ok' && <p className="say" role="status">설치 화면을 열었어요. 「설치」를 누르면 끝나요.</p>}
        {st === 'perm' && <p className="say" role="alert">설정 화면에서 「이 출처 허용」을 켜고 돌아와서, 다시 눌러 주세요.</p>}
        {st === 'fail' && <p className="say" role="alert">받지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.</p>}
      </div>
      {st === 'work' && <div className="xbar" aria-hidden="true"><b style={{ width: `${Math.round(f * 100)}%` }} /></div>}
      {st === 'ready' && <p className="hint">지금 쓰는 판은 <span className="num">{BUILD.run || '?'}</span>번이에요. 듣던 목록·편집곡·설정은 그대로 남아요.</p>}
      <div className="nb">
        {(st === 'ready' || st === 'fail' || st === 'perm') && <button className="ghost" onClick={later}>나중에</button>}
        {(st === 'ready' || st === 'fail' || st === 'perm') && <button className="go" onClick={go}>{st === 'ready' ? '받아서 설치' : '다시 하기'}</button>}
        {st === 'ok' && <button className="go" onClick={onClose}>닫기</button>}
      </div>
    </Sheet>
  )
}
