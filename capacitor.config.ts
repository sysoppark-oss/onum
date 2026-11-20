import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.onum.player',
  appName: '온음',
  webDir: 'dist',
  plugins: {
    // 어두운 화면이라 상태 표시줄 글자를 밝게
    SystemBars: { style: 'DARK', insetsHandling: 'css' },
    // 화면 부분 자동 업데이트: 온음이 직접 GitHub에서 받아 끼운다. Capgo 서버에는 아무것도 보내지 않는다.
    CapacitorUpdater: { autoUpdate: false, statsUrl: '', updateUrl: '', channelUrl: '', appReadyTimeout: 15000, resetWhenUpdate: true },
  },
};

export default config;
