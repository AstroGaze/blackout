import { configDefaults, defineConfig, type TestProjectInlineConfiguration } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

/** Tests that time Blackout's work, which other tests running alongside would slow. */
const TIMING_TESTS = 'src/**/*.timing.test.ts';

const project = (test: TestProjectInlineConfiguration['test']): TestProjectInlineConfiguration => ({
  // The plugin sets up the fake extension APIs, which a project doesn't inherit.
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    // Page-seam tests open pages at site addresses, as the content scripts see them.
    environmentOptions: {
      happyDOM: {
        url: 'https://www.youtube.com/',
        // Live chat runs in a frame inside the watch page.
        settings: { enableIframePageLoading: true },
      },
    },
    ...test,
  },
});

export default defineConfig({
  test: {
    projects: [
      // Saved pages are large, and parsing many at once is slow; speed is the timing tests' job.
      project({ name: 'pages', exclude: [...configDefaults.exclude, TIMING_TESTS], testTimeout: 20_000 }),
      // Run after the others, on their own.
      project({ name: 'timing', include: [TIMING_TESTS], sequence: { groupOrder: 1 } }),
    ],
  },
});
