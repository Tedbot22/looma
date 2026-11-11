import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Fills the store's web address into index.html (canonical link, share picture, structured data).
// Uses VITE_SITE_URL if you set it, otherwise the Vercel production address. With neither, those lines are left out.
function siteUrlInHtml(siteUrl: string): Plugin {
  return {
    name: 'site-url-in-html',
    transformIndexHtml(html) {
      if (siteUrl) return html.replaceAll('__SITE_URL__', siteUrl)
      return html
        .split('\n')
        .filter((line) => !line.includes('__SITE_URL__'))
        .join('\n')
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL // e.g. looma.vercel.app (set by Vercel while building)
  const siteUrl = (env.VITE_SITE_URL || (vercelHost ? `https://${vercelHost}` : '')).replace(/\/$/, '')

  return {
    plugins: [react(), tailwindcss(), siteUrlInHtml(siteUrl)],
  }
})
