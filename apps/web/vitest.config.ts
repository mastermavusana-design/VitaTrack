import { defineConfig } from 'vitest/config'
import path from 'path'

// R1 data-layer tests. Runs the real src/lib/dataStore against an in-memory
// IndexedDB + Supabase stub (see test/setup.ts, test/supabaseStub.ts).
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: [
      // R3: dataStore now imports the browser client from '@/lib/supabaseClient';
      // redirect that to the stub so the mock injects (must precede the '@' alias).
      { find: '@/lib/supabaseClient', replacement: path.resolve(__dirname, 'test/supabaseStub.ts') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
})
