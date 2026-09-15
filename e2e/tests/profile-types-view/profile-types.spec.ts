import { ExplorationType } from '../../config/constants';
import { expect, test } from '../../fixtures';
import { ExploreProfilesPage } from '../../fixtures/pages/ExploreProfilesPage';

async function assertMainUiElements(exploreProfilesPage: ExploreProfilesPage) {
  // app controls
  await exploreProfilesPage.assertSelectedDataSource('Local Pyroscope A');
  await exploreProfilesPage.asserSelectedExplorationType('Profile types');
  await exploreProfilesPage.assertSelectedTimeRange('2024-03-13 19:00:00 to 2024-03-13 19:50:00');

  // body scene controls
  await exploreProfilesPage.assertSelectedService('ride-sharing-app');
  await exploreProfilesPage.assertQuickFilter('Search profile types (comma-separated regexes are supported)', '', 6);
  await exploreProfilesPage.assertSelectedLayout('Grid');
}

test.describe('Profile types view', () => {
  test.beforeEach(async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.goto(ExplorationType.ProfileTypes);
  });

  test('Main UI elements', async ({ exploreProfilesPage }) => {
    await assertMainUiElements(exploreProfilesPage);

    // body
    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot();
  });

  test('Service selector', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectService('pyroscope');

    await exploreProfilesPage.assertSelectedService('pyroscope');

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Quick filter', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.assertQuickFilterResultsCount(6);

    await exploreProfilesPage.enterQuickFilterText('samples,alloc_space');

    await exploreProfilesPage.assertQuickFilterResultsCount(2);

    await expect(exploreProfilesPage.getPanels()).toHaveCount(2);
    await expect(exploreProfilesPage.getPanelByTitle('samples (process_cpu)')).toBeVisible();
    await expect(exploreProfilesPage.getPanelByTitle('alloc_space (memory)')).toBeVisible();
  });

  test('Layout switcher', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectLayout('Rows');

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test.describe('Panel actions', () => {
    test('Labels action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnPanelMenuAction('alloc_space (memory)', 'Labels');

      await exploreProfilesPage.asserSelectedExplorationType('Labels');
      await exploreProfilesPage.assertSelectedService('ride-sharing-app');
      await exploreProfilesPage.assertSelectedProfileType('memory/alloc_space');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Flame graph action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnPanelAction('alloc_space (memory)', 'Flame graph');

      await exploreProfilesPage.asserSelectedExplorationType('Flame graph');
      await exploreProfilesPage.assertSelectedService('ride-sharing-app');
      await exploreProfilesPage.assertSelectedProfileType('memory/alloc_space');

      await exploreProfilesPage.waitForSceneBodyRendered();
      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Favorite action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnPanelAction('alloc_space (memory)', 'Favorite');

      await exploreProfilesPage.selectExplorationType('Favorites');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot();
    });
  });

  test('Settings button', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.getByLabel('View/edit tenant settings').click();

    await expect(exploreProfilesPage.getByTestId('page-title')).toHaveText('Profiles settings (tenant)');

    await exploreProfilesPage.getByLabel('Back to Profiles Drilldown').click();

    await assertMainUiElements(exploreProfilesPage);

    // body
    // tweak max diff pixel ratio because sometimes the screenshot is 1px bigger in height
    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      maxDiffPixelRatio: 0.02,
    });
  });
});
