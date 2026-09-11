import { ExplorationType } from '../../config/constants';
import { expect, test } from '../../fixtures';

test.describe('Flame graph view', () => {
  test.beforeEach(async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.goto(ExplorationType.FlameGraph);
  });

  test('Main UI elements', async ({ exploreProfilesPage }) => {
    // app controls
    await exploreProfilesPage.assertSelectedDataSource('Local Pyroscope A');
    await exploreProfilesPage.asserSelectedExplorationType('Flame graph');
    await exploreProfilesPage.assertSelectedTimeRange('2024-03-13 19:00:00 to 2024-03-13 19:50:00');

    // body scene controls
    await exploreProfilesPage.assertSelectedService('ride-sharing-app');
    await exploreProfilesPage.assertSelectedProfileType('process_cpu/cpu');
    await exploreProfilesPage.assertFilters([]);

    // flame graph panel
    const flameGraphPanel = exploreProfilesPage.getByTestId('flame-graph-panel');
    await expect(flameGraphPanel.locator('h6')).toContainText('Flame graph for ride-sharing-app (cpu)');
    await expect(flameGraphPanel.getByRole('button', { name: /Explain Flame Graph/i })).toBeVisible();

    // body
    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Service selector', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectService('pyroscope');

    await exploreProfilesPage.assertSelectedService('pyroscope');

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Profile type selector', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectProfileType('memory/alloc_space');

    await exploreProfilesPage.assertSelectedProfileType('memory/alloc_space');

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Dependency between the service selected and the profile type selector options', async ({
    exploreProfilesPage,
  }) => {
    await exploreProfilesPage.assertProfileTypeSelectorOptions(
      ['process_cpu', 'memory'],
      [
        ['cpu', 'samples'],
        ['alloc_objects', 'alloc_space', 'inuse_objects', 'inuse_space'],
      ]
    );

    await exploreProfilesPage.selectService('pyroscope');

    await exploreProfilesPage.assertProfileTypeSelectorOptions(
      ['process_cpu', 'mutex', 'memory', 'goroutine', 'block'],
      [
        ['cpu', 'samples'],
        ['contentions', 'delay'],
        ['alloc_objects', 'alloc_space', 'inuse_objects', 'inuse_space'],
        ['goroutine'],
        ['contentions', 'delay'],
      ]
    );
  });

  test.describe('Filters', () => {
    test('Adding a filter', async ({ exploreProfilesPage }) => {
      const filter = ['vehicle', '=', 'scooter'];
      await exploreProfilesPage.addFilter(filter);
      await exploreProfilesPage.assertFilters([filter]);

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Filters are persisted when changing the profile type', async ({ exploreProfilesPage }) => {
      const filter = ['vehicle', '=', 'bike'];
      await exploreProfilesPage.addFilter(filter);

      await exploreProfilesPage.selectProfileType('memory/alloc_space');

      await exploreProfilesPage.assertFilters([filter]);
    });

    test('Filters are cleared when changing the service', async ({ exploreProfilesPage }) => {
      const filter = ['vehicle', '=', 'car'];
      await exploreProfilesPage.addFilter(filter);

      await exploreProfilesPage.selectService('pyroscope');

      await exploreProfilesPage.assertFilters([]);
    });
  });

  test.describe('Panel actions', () => {
    test('Favorite action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnPanelMenuAction('CPU time consumed', 'Favorite');

      await exploreProfilesPage.selectExplorationType('Favorites');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot();
    });
  });
});
