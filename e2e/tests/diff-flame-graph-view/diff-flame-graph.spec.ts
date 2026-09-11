import { ExplorationType, EXPLORE_PROFILES_DIFF_RANGES_URL_PARAMS } from '../../config/constants';
import { expect, test } from '../../fixtures';
import { ExploreProfilesPage } from '../../fixtures/pages/ExploreProfilesPage';

test.describe('Diff flame graph view', () => {
  test.beforeEach(async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.goto(ExplorationType.DiffFlameGraph, EXPLORE_PROFILES_DIFF_RANGES_URL_PARAMS);
  });

  test('Main UI elements', async ({ exploreProfilesPage }) => {
    // app controls
    await exploreProfilesPage.assertSelectedDataSource('Local Pyroscope A');
    await exploreProfilesPage.asserSelectedExplorationType('Diff flame graph');

    // body scene controls
    await exploreProfilesPage.assertSelectedService('ride-sharing-app');
    await exploreProfilesPage.assertSelectedProfileType('process_cpu/cpu');

    // panels
    const expectedTimeRange = '2024-03-13 19:00:00 to 2024-03-13 19:50:00';

    await expect(exploreProfilesPage.getComparisonTimePickerButton('baseline')).toContainText(expectedTimeRange);
    await exploreProfilesPage.assertFilters([], 'filtersBaseline');

    await expect(exploreProfilesPage.getComparisonTimePickerButton('comparison')).toContainText(expectedTimeRange);
    await exploreProfilesPage.assertFilters([], 'filtersComparison');

    // diff flame graph panel
    const diffFlameGraphPanel = exploreProfilesPage.getByTestId('diff-flame-graph-panel');
    await expect(diffFlameGraphPanel.locator('h6')).toContainText('Diff flame graph for ride-sharing-app (cpu)');
    await expect(diffFlameGraphPanel.getByRole('button', { name: /Explain Diff Flame Graph/i })).toBeVisible();

    // If the "Auto-select" banner is shown, click it to set baseline/comparison ranges so the flame graph loads
    const autoSelectButton = exploreProfilesPage.getByRole('button', { name: 'Auto-select' });
    if (await autoSelectButton.isVisible()) {
      await exploreProfilesPage.clickDiffFlameGraphAutoSelect();
    }

    await exploreProfilesPage.waitForSceneBodyRendered();

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Service selector', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectService('pyroscope');

    await exploreProfilesPage.assertSelectedService('pyroscope');
    await exploreProfilesPage.mouse.move(0, 0); // prevents the time picker tooltip to appear on the screenshot

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Profile type selector', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectProfileType('memory/alloc_space');

    await exploreProfilesPage.assertSelectedProfileType('memory/alloc_space');

    // Changing profile type can clear diff ranges; if the "Auto-select" banner is shown, click it to set baseline/comparison ranges
    const autoSelectButton = exploreProfilesPage.getByRole('button', { name: 'Auto-select' });
    if (await autoSelectButton.isVisible()) {
      await exploreProfilesPage.clickDiffFlameGraphAutoSelect();
    }

    // Wait for diff flame graph to load (top table + flame graph)
    await expect(exploreProfilesPage.getFlamegraph()).toBeVisible({ timeout: 15000 });
    await expect(exploreProfilesPage.getTopTable()).toBeVisible({ timeout: 5000 });

    await exploreProfilesPage.waitForSceneBodyRendered();

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Dependency between the service selected and the profile type selector options', async ({
    exploreProfilesPage,
  }) => {
    // ride-sharing-app exposes a subset of profile types (same as flame-graph / labels specs)
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
    const baselineFilter = ['vehicle', '=', 'scooter'];
    const comparisonFilter = ['vehicle', '!=', 'scooter'];

    test.beforeEach(async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.addFilter(baselineFilter, 'filtersBaseline');
      await exploreProfilesPage.assertFilters([baselineFilter], 'filtersBaseline');

      await exploreProfilesPage.addFilter(comparisonFilter, 'filtersComparison');
      await exploreProfilesPage.assertFilters([comparisonFilter], 'filtersComparison');
    });

    test('Filters are persisted when changing the profile type', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.selectProfileType('memory/alloc_space');

      await exploreProfilesPage.assertFilters([baselineFilter], 'filtersBaseline');
      await exploreProfilesPage.assertFilters([comparisonFilter], 'filtersComparison');
    });

    test('Filters are cleared when changing the service', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.selectService('pyroscope');

      await exploreProfilesPage.assertFilters([], 'filtersBaseline');
      await exploreProfilesPage.assertFilters([], 'filtersComparison');
    });
  });

  test.describe('Filter suggestions', () => {
    // see https://github.com/grafana/profiles-drilldown/issues/821
    test('Each panel suggests the labels found in its own time range', async ({ exploreProfilesPage }) => {
      await expect(await exploreProfilesPage.openFilterSuggestions('filtersComparison')).toContainText('vehicle');
      await exploreProfilesPage.closeFilterSuggestions();

      // the static test data is from 2024-03-13, so this range contains no profiles at all
      await exploreProfilesPage.selectComparisonQuickRange('comparison', 'Last 5 minutes');

      const comparisonSuggestions = await exploreProfilesPage.openFilterSuggestions('filtersComparison');

      await expect(comparisonSuggestions).not.toContainText('Loading...');
      await expect(comparisonSuggestions.getByRole('option')).toHaveCount(0);

      await exploreProfilesPage.closeFilterSuggestions();

      // the baseline panel still has the original time range
      const baselineSuggestions = await exploreProfilesPage.openFilterSuggestions('filtersBaseline');

      await expect(baselineSuggestions.getByRole('option').first()).toBeVisible();
      await expect(baselineSuggestions).toContainText('vehicle');
    });
  });

  test.describe('Baseline panel', () => {
    test('Baseline time picker', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.selectService('pyroscope'); // clears the flame graph ranges

      await exploreProfilesPage.selectComparisonTimeRange('baseline', '2024-03-13 19:21', '2024-03-13 19:34');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Baseline time picker selection mode', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.selectService('pyroscope'); // clears the flame graph ranges

      await exploreProfilesPage.switchComparisonSelectionMode('baseline', 'Time picker');

      await exploreProfilesPage.clickAndDragOnComparisonPanel('baseline', { x: 200, y: 200 }, { x: 360, y: 200 });

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Baseline flame graph selection mode', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.switchComparisonSelectionMode('baseline', 'Flame graph');

      // If the "Auto-select" banner is shown, click it to set baseline/comparison ranges so the flame graph is usable
      const autoSelectButton = exploreProfilesPage.getByRole('button', { name: 'Auto-select' });
      if (await autoSelectButton.isVisible()) {
        await exploreProfilesPage.clickDiffFlameGraphAutoSelect();
      }

      await exploreProfilesPage.clickAndDragOnComparisonPanel('baseline', { x: 200, y: 200 }, { x: 360, y: 200 });

      await exploreProfilesPage.waitForSceneBodyRendered();
      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });
  });

  test.describe('Comparison panel', () => {
    test('Comparison time picker', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.selectService('pyroscope'); // clears the flame graph ranges

      await exploreProfilesPage.selectComparisonTimeRange('comparison', '2024-03-13 19:37', '2024-03-13 19:41');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Comparison time picker selection mode', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.selectService('pyroscope'); // clears the flame graph ranges

      await exploreProfilesPage.switchComparisonSelectionMode('comparison', 'Time picker');

      await exploreProfilesPage.clickAndDragOnComparisonPanel('comparison', { x: 470, y: 200 }, { x: 510, y: 200 });

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    // Comment out for now as it's not working in Grafana 12.3.0 and the React19 upgrade at the same time - there is a 22% difference in the scene body
    // test('Comparison flame graph selection mode', async ({ exploreProfilesPage }) => {
    //   await exploreProfilesPage.switchComparisonSelectionMode('comparison', 'Flame graph');

    //   // If the "Auto-select" banner is shown, click it to set baseline/comparison ranges so the flame graph is usable
    //   const autoSelectButton = exploreProfilesPage.getByRole('button', { name: 'Auto-select' });
    //   if (await autoSelectButton.isVisible()) {
    //     await exploreProfilesPage.clickDiffFlameGraphAutoSelect();
    //   }

    //   await exploreProfilesPage.clickAndDragOnComparisonPanel('comparison', { x: 470, y: 200 }, { x: 510, y: 200 });

    //   await exploreProfilesPage.waitForSceneBodyRendered();
    //   await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
    //     stylePath: './e2e/fixtures/css/hide-all-controls.css',
    //   });
    // });
  });

  test.describe('Sync time ranges', () => {
    test('Syncing flame graph range selection', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnSyncTimerangesButton('baseline');

      await exploreProfilesPage.clickAndDragOnComparisonPanel('comparison', { x: 470, y: 200 }, { x: 510, y: 200 }),
        await exploreProfilesPage.assertNoSpinner();

      await exploreProfilesPage.waitForSceneBodyRendered();
      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Syncing time picker range selection', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnSyncTimerangesButton('comparison');
      await exploreProfilesPage.switchComparisonSelectionMode('baseline', 'Time picker');

      // If the "Auto-select" banner is shown, click it to set baseline/comparison ranges before drag/screenshot
      const autoSelectButton = exploreProfilesPage.getByRole('button', { name: 'Auto-select' });
      if (await autoSelectButton.isVisible()) {
        await exploreProfilesPage.clickDiffFlameGraphAutoSelect();
      }

      // Time picker drag may not trigger the same render-diff / ds/query sequence as flame graph drag,
      // so waitForApiResponses can hang until test timeout. Drag then wait for UI to settle.
      await exploreProfilesPage.clickAndDragOnComparisonPanel('baseline', { x: 470, y: 200 }, { x: 510, y: 200 });
      await exploreProfilesPage.assertNoSpinner();

      await exploreProfilesPage.waitForSceneBodyRendered();
      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });
  });
});
