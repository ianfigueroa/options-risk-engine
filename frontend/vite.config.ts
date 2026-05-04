import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/apiClient.ts',
        'src/formatters.ts',
        'src/marketUtils.ts',
        'src/valuationUtils.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
