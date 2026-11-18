import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode}) => ({
  base: './',
  publicDir: mode === 'nds' ? '.cache/nds-public-source' : mode === 'psp' ? '.cache/psp-public' : 'public',
  plugins: [react(), {
    name: 'koki-system-title',
    transformIndexHtml(html) {
      const title = mode === 'psp' ? 'Koki PSP' : mode === 'nds' ? 'Koki NDS' : null;
      return title ? html.replace(/<title>Koki[’']s Emulator<\/title>/, '<title>' + title + '</title>') : html;
    },
  }],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    watch: { ignored: ['**/.cache/**', '**/android/**', '**/android-nds/**', '**/dist-nds/**', '**/release-nds/**', '**/release/**', '**/electron/**'] },
  },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['src/**/*.test.ts'], environment: 'node', setupFiles: ['src/test-setup.ts'] },
}));
