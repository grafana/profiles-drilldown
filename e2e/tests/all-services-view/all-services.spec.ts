import { ExplorationType } from '../../config/constants';
import { expect, test } from '../../fixtures';

test.describe('All services view', () => {
  test.beforeEach(async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.goto(ExplorationType.AllServices);
  });

  test('Main UI elements', async ({ exploreProfilesPage }) => {
    // app controls
    await exploreProfilesPage.assertSelectedDataSource('Local Pyroscope A');
    await exploreProfilesPage.asserSelectedExplorationType('All services');
    await exploreProfilesPage.assertSelectedTimeRange('2024-03-13 19:00:00 to 2024-03-13 19:50:00');

    // body scene controls
    await exploreProfilesPage.assertSelectedProfileType('process_cpu/cpu');
    await exploreProfilesPage.assertQuickFilter('Search services (comma-separated regexes are supported)', '', 3);
    await exploreProfilesPage.assertSelectedLayout('Grid');

    // body
    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot();
  });

  test('Profile type selector', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectProfileType('memory/inuse_objects');

    await exploreProfilesPage.assertSelectedProfileType('memory/inuse_objects');

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot();
  });

  test('Quick filter', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.assertQuickFilterResultsCount(3);

    await exploreProfilesPage.enterQuickFilterText('sharing,load');

    await exploreProfilesPage.assertQuickFilterResultsCount(2);

    await expect(exploreProfilesPage.getPanels()).toHaveCount(2);
    await expect(exploreProfilesPage.getPanelByTitle('load-generator')).toBeVisible();
    await expect(exploreProfilesPage.getPanelByTitle('ride-sharing-app')).toBeVisible();
  });

  test.describe('Panel reuse', () => {
    test('Narrowing the list keeps the matching panels mounted', async ({ exploreProfilesPage }) => {
      await expect(exploreProfilesPage.getPanels()).toHaveCount(3);

      await exploreProfilesPage.tagMountedPanels();

      await exploreProfilesPage.enterQuickFilterText('sharing,load');
      await expect(exploreProfilesPage.getPanels()).toHaveCount(2);

      // both matching services were already on screen, so the grid must keep their panels rather
      // than rebuild every item: rebuilding unmounts the whole grid and blanks it before it refills
      expect(await exploreProfilesPage.countTaggedPanels()).toBe(2);
    });

    test('Time range change keeps the panels mounted when the service list is unchanged', async ({
      exploreProfilesPage,
    }) => {
      await expect(exploreProfilesPage.getPanels()).toHaveCount(3);

      await exploreProfilesPage.tagMountedPanels();

      await exploreProfilesPage.clickOnZoomOut();

      await expect(exploreProfilesPage.getTimePickerButton()).not.toContainText(
        '2024-03-13 19:00:00 to 2024-03-13 19:50:00'
      );
      await expect(exploreProfilesPage.getPanels()).toHaveCount(3);

      expect(await exploreProfilesPage.countTaggedPanels()).toBe(3);
    });
  });

  test('Layout switcher', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectLayout('Rows');

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test.describe('Panel actions', () => {
    test('Profile types action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnPanelAction('ride-sharing-app', 'Profile types');

      await exploreProfilesPage.asserSelectedExplorationType('Profile types');
      await exploreProfilesPage.assertSelectedService('ride-sharing-app');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot();
    });

    test('Labels action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.selectProfileType('memory/alloc_space');

      await exploreProfilesPage.clickOnPanelAction('ride-sharing-app', 'Labels');

      await exploreProfilesPage.asserSelectedExplorationType('Labels');
      await exploreProfilesPage.assertSelectedService('ride-sharing-app');
      await exploreProfilesPage.assertSelectedProfileType('memory/alloc_space');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Flame graph action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.selectProfileType('memory/alloc_space');

      await exploreProfilesPage.clickOnPanelAction('ride-sharing-app', 'Flame graph');

      await exploreProfilesPage.asserSelectedExplorationType('Flame graph');
      await exploreProfilesPage.assertSelectedService('ride-sharing-app');
      await exploreProfilesPage.assertSelectedProfileType('memory/alloc_space');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Favorite action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnPanelAction('ride-sharing-app', 'Favorite');

      await exploreProfilesPage.selectExplorationType('Favorites');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot();
    });
  });
});
