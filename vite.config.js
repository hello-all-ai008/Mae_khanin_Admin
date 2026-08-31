import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Fail the build loudly instead of shipping a bundle that white-screens at runtime.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const missing = REQUIRED_ENV.filter((name) => !env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing required env: ${missing.join(', ')}. Copy .env.example to .env.local and set them.`
    )
  }

  return {
    plugins: [react()],
  }
})
