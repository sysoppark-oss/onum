import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE=1: 브라우저 시험판용으로 파일 하나에 다 담는다.
// 기본(설치형 앱): 조각으로 나눠, 파일 태그 읽기 도구는 필요할 때만 불러온다.
// PC 웹 앱(GitHub Pages)에만 넣는 CSP: 우리 파일의 스크립트만 실행하고, 밖으로는 새 판 확인(GitHub)만 나간다.
// 설치형 앱에는 넣지 않는다(앱 안 화면은 Capacitor가 다리를 끼워 넣는 방식이 달라 따로 다뤄야 한다).
//  · wasm-unsafe-eval: 노래연습 AI 계산기(onnxruntime-web)의 WebAssembly
//  · blob: — 고른 음악 파일·만든 반주를 듣고 읽는 주소, 계산기가 띄우는 일꾼(worker)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://api.github.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')
const csp = () => ({
  name: 'onum-csp',
  transformIndexHtml: (html: string) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  base: './', // GitHub Pages의 /onum/ 아래에서도, 설치형 앱에서도 동작
  plugins: [react(), ...(process.env.SINGLE ? [viteSingleFile()] : []), ...(process.env.ONUM_CSP ? [csp()] : [])],
})
