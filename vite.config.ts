import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE=1: 브라우저 시험판용으로 파일 하나에 다 담는다.
// 기본(설치형 앱): 조각으로 나눠, 파일 태그 읽기 도구는 필요할 때만 불러온다.
export default defineConfig({
  plugins: [react(), ...(process.env.SINGLE ? [viteSingleFile()] : [])],
})
