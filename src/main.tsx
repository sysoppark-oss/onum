import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'
import App from './App.tsx'
import { Guard } from './ui/Guard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guard><App /></Guard>
  </StrictMode>,
)

// PC·브라우저용: 인터넷 없이도 켜지게 (설치형 앱에서는 필요 없음)
if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
