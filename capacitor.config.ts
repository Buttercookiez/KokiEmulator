import type { CapacitorConfig } from '@capacitor/cli';

const nds = process.env.KOKI_SYSTEM === 'nds';
const config: CapacitorConfig = {
  appId: nds ? 'com.koki.nds' : 'com.koki.emulator',
  appName: nds ? 'Koki NDS' : "Koki's Emulator",
  webDir: nds ? 'dist-nds' : 'dist',
  backgroundColor: '#111111',
  loggingBehavior: 'debug',
  server: { hostname: 'localhost', androidScheme: 'https' },
  android: { path: nds ? 'android-nds' : 'android', allowMixedContent: false },
};

export default config;
