import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    // Page-seam tests open pages at site addresses, as the content scripts see them.
    environmentOptions: { happyDOM: { url: 'https://www.youtube.com/' } },
  },
});
