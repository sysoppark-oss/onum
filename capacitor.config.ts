import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.onum.player',
  appName: '온음',
  webDir: 'dist',
  plugins: {
    // 어두운 화면이라 상태 표시줄 글자를 밝게
    SystemBars: { style: 'DARK', insetsHandling: 'css' },
  },
};

export default config;
