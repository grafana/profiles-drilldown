import { defineConfig, PlaywrightTestConfig, Project } from '@playwright/test';
import path from 'path';

import { DOCKED_MENU_OPEN_LOCAL_STORAGE_KEY, FORCE_SHOW_AI_BUTTON_LOCAL_STORAGE_KEY } from './constants';

type CustomEnvConfig = {
  baseURL: string;
  projects: Project[];
  reporter: PlaywrightTestConfig['reporter'];
  timeout?: number;
  retries?: number;
  forbidOnly?: boolean;
  workers?: number;
};

export function config(config: CustomEnvConfig) {
  return defineConfig({
    // Look for test files in the "tests" directory, relative to this configuration file.
    testDir: path.join(process.cwd(), 'e2e', 'tests'),
    // Folder for test artifacts such as screenshots, videos, traces, etc.
    outputDir: '../test-results',
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: config.reporter,
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: config.forbidOnly,
    /* Retry on CI only */
    retries: config.retries && config.retries > 0 ? config.retries : 0,
    /* Opt out of parallel tests on CI. */
    workers: config.workers,
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
      /* Base URL to use in actions like `await page.goto('/')`. */
      baseURL: config.baseURL,
      // Record trace only when retrying a test for the first time.
      screenshot: 'only-on-failure',
      // Record video only when retrying a test for the first time.
      video: 'on-first-retry',
      /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
      trace: 'on-first-retry',
      storageState: {
        cookies: [],
        origins: [
          {
            origin: config.baseURL,
            localStorage: [
              {
                // ensures that Grafana's main menu is closed, for screenshots predictability
                name: DOCKED_MENU_OPEN_LOCAL_STORAGE_KEY,
                value: 'false',
              },
              {
                // ensures deterministic AI button labels in screenshots and assertions
                name: FORCE_SHOW_AI_BUTTON_LOCAL_STORAGE_KEY,
                value: 'true',
              },
            ],
          },
        ],
      },
    },
    expect: {
      timeout: Number(config.timeout) > 0 ? config.timeout : 5000,
      toHaveScreenshot: { maxDiffPixelRatio: 0.06 }, // tweak me with experience, mostly for differences between Grafana versions in graphs/panels
    },

    /* Configure projects for major browsers */
    projects: config.projects,
  });
}
