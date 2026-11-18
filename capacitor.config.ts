import type { CapacitorConfig } from '@capacitor/cli';

const psp = process.env.KOKI_SYSTEM === 'psp';
const nds = process.env.KOKI_SYSTEM === 'nds';
const config: CapacitorConfig = {
  appId: psp ? 'com.koki.psp' : nds ? 'com.koki.nds' : 'com.koki.emulator',
  appName: psp ? 'Koki PSP' : nds ? 'Koki NDS' : "Koki's Emulator",
  webDir: psp ? 'dist-psp' : nds ? 'dist-nds' : 'dist',
  backgroundColor: '#111111',
  loggingBehavior: 'debug',
  server: { hostname: 'localhost', androidScheme: 'https' },
  android: { path: psp ? 'android-psp' : nds ? 'android-nds' : 'android', allowMixedContent: false },
};

export default config;
