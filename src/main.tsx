import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PC·브라우저용: 인터넷 없이도 켜지게 (설치형 앱에서는 필요 없음)
if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
