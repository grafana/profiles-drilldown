import { test as baseTest, PluginOptions } from '@grafana/plugin-e2e';
import { expect, type Page } from '@playwright/test';

import { DEFAULT_EXPLORE_PROFILES_URL_PARAMS } from '../config/constants';
import { AdHocViewPage } from './pages/AdHocViewPage';
import { ExploreProfilesPage } from './pages/ExploreProfilesPage';
import { SettingsPage } from './pages/SettingsPage';

type Fixtures = {
  exploreProfilesPage: ExploreProfilesPage;
  adHocViewPage: AdHocViewPage;
  settingsPage: SettingsPage;
};

type Options = {
  failOnUncaughtExceptions: boolean;
};

const withExceptionsAssertion = async <T>(
  {
    page,
    failOnUncaughtExceptions,
    use,
  }: {
    page: Page;
    failOnUncaughtExceptions: boolean;
    use: (fixture: T) => Promise<void>;
  },
  fixture: T
) => {
  if (!failOnUncaughtExceptions) {
    return await use(fixture);
  }

  const exceptions: Error[] = [];

  page.addListener('pageerror', (error) => {
    exceptions.push(error);
  });

  await use(fixture);

  expect(exceptions, `${exceptions.length} uncaught exception(s) encountered!`).toEqual([]);
};

export const test = baseTest.extend<Options & Fixtures, PluginOptions>({
  // fixture option accessible in every test case or fixture (default value = false)
  failOnUncaughtExceptions: [false, { option: true }],
  exploreProfilesPage: async ({ page, failOnUncaughtExceptions }, use) => {
    await withExceptionsAssertion(
      { page, failOnUncaughtExceptions, use },
      new ExploreProfilesPage(page, DEFAULT_EXPLORE_PROFILES_URL_PARAMS)
    );
  },
  adHocViewPage: async ({ page, failOnUncaughtExceptions }, use) => {
    await withExceptionsAssertion({ page, failOnUncaughtExceptions, use }, new AdHocViewPage(page));
  },
  settingsPage: async ({ page, failOnUncaughtExceptions }, use) => {
    await withExceptionsAssertion({ page, failOnUncaughtExceptions, use }, new SettingsPage(page));
  },
});

export { expect } from '@playwright/test';
