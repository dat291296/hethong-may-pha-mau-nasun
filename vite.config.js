import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateSentryDsn } from './src/shared/diagnostics/remoteReporting.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_')
  const monitoringOrigin = environment.VITE_REMOTE_REPORTING_ENABLED === 'true'
    ? validateSentryDsn(environment.VITE_SENTRY_DSN).origin : null
  let outputDirectory = 'dist'
  return {
    plugins: [react(), {
      name: 'monitoring-csp',
      apply: 'build',
      configResolved(config) { outputDirectory = config.build.outDir },
      async closeBundle() {
        if (!monitoringOrigin) return
        const file = join(outputDirectory, '_headers')
        const content = await readFile(file, 'utf8')
        await writeFile(file, content.replace("connect-src 'self'", `connect-src 'self' ${monitoringOrigin}`))
      },
    }],
    base: '/',
    define: {
      'import.meta.env.VITE_BUILD_REVISION': JSON.stringify(process.env.GITHUB_SHA || ''),
    },
    build: {
      sourcemap: false,
      minify: 'oxc',
      reportCompressedSize: true,
      // Strip browser logs from public artifacts; diagnostics retain only allowlisted codes.
      rolldownOptions: {
        output: {
          minify: { compress: { dropConsole: true, dropDebugger: true } },
          manualChunks(id) {
            if (id.includes('node_modules/@supabase/')) return 'supabase';
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-is/') ||
              id.includes('node_modules/scheduler/')
            ) return 'react-vendor';
            if (id.includes('node_modules/recharts/')) return 'recharts-vendor';
            return undefined;
          },
        },
      },
    },
  }
})

