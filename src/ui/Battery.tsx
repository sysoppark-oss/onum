// 화면이 꺼져도 음악이 멈추지 않게: 배터리 최적화에서 빼 달라고 안내
import { useCallback, useEffect, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { askBattery, getBattery, isNative, openAppSettings } from '../lib/native'
import { Icon } from './common'
import { Page } from './Sheets'

export type Battery = { free: boolean; maker: string } | null

/** 설정 화면에 다녀오면 다시 확인한다 */
export function useBattery(): [Battery, () => void] {
  const [b, setB] = useState<Battery>(null)
  const check = useCallback(() => { getBattery().then(setB) }, [])
  useEffect(() => {
    if (!isNative) return
    check()
    const h = CapApp.addListener('resume', check)
    return () => { h.then((x) => x.remove()) }
  }, [check])
  return [b, check]
}

export function BatteryPage({ b, onClose }: { b: Battery; onClose: () => void }) {
  const samsung = !!b?.maker.includes('samsung')
  return (
    <Page label="화면이 꺼져도 계속 듣기" onClose={onClose}>
      <p className="say">휴대폰은 배터리를 아끼려고 오래 켜 둔 앱을 <b>멈출 때가 있어요.</b></p>
      <p className="hint">잠들기 예약이나 긴 강의가 중간에 끊기지 않게, 온음을 배터리 절약에서 빼 주세요. 온음은 음악을 틀지 않을 때는 아무 일도 하지 않아요.</p>
      {b?.free ? (
        <p className="ok-note" role="status"><Icon n="check" s={20} w={2.8} />배터리 절약에서 빠져 있어요</p>
      ) : (
        <section className="bstep">
          <h3><span className="bn">1</span>허용하기</h3>
          <p className="hint">"배터리 사용량 최적화를 중지할까요?" 창이 뜨면 <b>허용</b>을 누르세요.</p>
          <button className="go" onClick={askBattery}>허용하러 가기</button>
        </section>
      )}
      {samsung && (
        <section className="bstep">
          <h3><span className="bn">{b?.free ? 1 : 2}</span>삼성 휴대폰은 한 가지 더</h3>
          <p className="hint">앱 정보에서 <b>배터리</b>를 누르고 <b>제한 없음</b>을 고르세요. 휴대폰마다 이름이 조금 다를 수 있어요.</p>
          <button className="ghost" onClick={openAppSettings}>앱 정보 열기</button>
        </section>
      )}
      <button className="textbtn plain" onClick={onClose}>{b?.free ? '닫기' : '나중에 하기'}</button>
    </Page>
  )
}
