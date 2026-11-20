// 낮·밤 자동: 오전 6시부터 저녁 7시 전까지는 밝게, 나머지는 어둡게.
import { useEffect, useState } from 'react'
import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { isNative } from './native'

export type Mode = 'day' | 'night'

export function modeAt(d = new Date()): Mode {
  const h = d.getHours()
  return h >= 6 && h < 19 ? 'day' : 'night'
}

function apply(m: Mode) {
  document.documentElement.dataset.theme = m
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m === 'day' ? '#ffffff' : '#0e0f11')
  // 상태 표시줄 글자: 밝은 화면엔 어둡게, 어두운 화면엔 밝게
  if (isNative) SystemBars.setStyle({ style: m === 'day' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {})
}

export function useDayNight(): Mode {
  const [m, setM] = useState<Mode>(modeAt)
  useEffect(() => {
    apply(m)
    const h = setInterval(() => setM(modeAt()), 30000)
    return () => clearInterval(h)
  }, [m])
  return m
}
