import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Blackout',
    description: "Hides spoilers for the media you haven't finished yet.",
    permissions: ['storage'],
    // The AI model's server, asked for when the user connects it (spec: Permissions).
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      // Covers live in Shadow DOMs on other sites, where relative font URLs
      // would resolve against the site. Inline the font into the CSS instead.
      assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? true : undefined),
    },
  }),
});
