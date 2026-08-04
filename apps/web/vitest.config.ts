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
      { find: '@supabase/auth-helpers-nextjs', replacement: path.resolve(__dirname, 'test/supabaseStub.ts') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
})
