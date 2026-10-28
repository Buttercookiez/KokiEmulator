import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.koki.emulator',
  appName: "Koki's Emulator",
  webDir: 'dist',
  backgroundColor: '#111111',
  loggingBehavior: 'debug',
  server: { hostname: 'localhost', androidScheme: 'https' },
  android: { allowMixedContent: false },
};

export default config;
