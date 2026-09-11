import { ExplorationType } from '../../config/constants';
import { expect, test } from '../../fixtures';

test.describe('Labels view', () => {
  test.beforeEach(async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.goto(ExplorationType.Labels);
  });

  test('Main UI elements', async ({ exploreProfilesPage }) => {
    // app controls
    await exploreProfilesPage.assertSelectedDataSource('Local Pyroscope A');
    await exploreProfilesPage.asserSelectedExplorationType('Labels');
    await exploreProfilesPage.assertSelectedTimeRange('2024-03-13 19:00:00 to 2024-03-13 19:50:00');

    // body scene controls
    await exploreProfilesPage.assertSelectedService('ride-sharing-app');
    await exploreProfilesPage.assertSelectedProfileType('process_cpu/cpu');
    await exploreProfilesPage.assertFilters([]);
    await exploreProfilesPage.assertQuickFilter('Search labels (comma-separated regexes are supported)', '', 7);
    await exploreProfilesPage.assertSelectedPanelType('Time series');
    await exploreProfilesPage.assertSelectedLayout('Grid');
    await exploreProfilesPage.assertHideNoDataSwitcher(false);

    // body
    await exploreProfilesPage.assertNoSpinner();

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Service selector', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectService('pyroscope');

    await exploreProfilesPage.assertSelectedService('pyroscope');
    await exploreProfilesPage.assertNoSpinner();

    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
    });
  });

  test('Profile type selector', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.selectProfileType('memory/alloc_space');

    await exploreProfilesPage.assertSelectedProfileType('memory/alloc_space');
    await exploreProfilesPage.assertNoSpinner();

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
      const filter = ['region', '=', 'eu-north'];
      await exploreProfilesPage.addFilter(filter);
      await exploreProfilesPage.assertFilters([filter]);

      await exploreProfilesPage.assertNoSpinner();

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
    test('Select action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.assertNoSpinner();

      await exploreProfilesPage.clickOnPanelAction('region (3)', 'Select');

      await expect(exploreProfilesPage.getGroupByContainer()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test('Expand panel action', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.assertNoSpinner();

      await exploreProfilesPage.clickOnPanelAction('region (3)', 'Expand panel');

      await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });
  });

  test.describe('Group by labels selector', () => {
    test.beforeEach(async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.assertNoSpinner();
      await exploreProfilesPage.selectGroupByLabel('region (3)');
      await exploreProfilesPage.assertNoSpinner();
    });

    test('Selects a label and displays the breakdown in a new grid', async ({ exploreProfilesPage }) => {
      await expect(exploreProfilesPage.getGroupByContainer()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });

    test.describe('After selecting a label', () => {
      test('Main UI elements', async ({ exploreProfilesPage }) => {
        await expect(exploreProfilesPage.getCompareButton()).toBeVisible();
        await expect(exploreProfilesPage.getCompareButton()).toBeDisabled();

        await expect(exploreProfilesPage.getClearComparisonButton()).toBeVisible();
        await expect(exploreProfilesPage.getClearComparisonButton()).toBeDisabled();
      });

      test('Quick filter', async ({ exploreProfilesPage }) => {
        await exploreProfilesPage.assertQuickFilterResultsCount(3);

        await exploreProfilesPage.enterQuickFilterText('us-east');

        await exploreProfilesPage.assertQuickFilterResultsCount(1);

        await expect(exploreProfilesPage.getGroupByPanels()).toHaveCount(1);
        await expect(exploreProfilesPage.getPanelByTitle('us-east')).toBeVisible();
      });

      test.describe('Panel actions', () => {
        test('Flame graph action', async ({ exploreProfilesPage }) => {
          await exploreProfilesPage.clickOnPanelAction('us-east', 'Flame graph');

          await exploreProfilesPage.asserSelectedExplorationType('Flame graph');
          await exploreProfilesPage.assertSelectedService('ride-sharing-app');
          await exploreProfilesPage.assertSelectedProfileType('process_cpu/cpu');
          await exploreProfilesPage.assertFilters([['region', '=', 'us-east']]);

          await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
            stylePath: './e2e/fixtures/css/hide-all-controls.css',
          });
        });
      });

      test.describe('Compare flow', () => {
        test('Selecting different baseline and comparison items then clicking on the "Compare" button', async ({
          exploreProfilesPage,
        }) => {
          await exploreProfilesPage.selectForComparison('us-east', 'Baseline');

          await expect(exploreProfilesPage.getCompareButton()).toBeDisabled();
          await expect(exploreProfilesPage.getCompareButton()).toHaveText('Compare (1/2)');

          await exploreProfilesPage.selectForComparison('eu-north', 'Comparison');

          await expect(exploreProfilesPage.getCompareButton()).not.toBeDisabled();
          await expect(exploreProfilesPage.getCompareButton()).toHaveText('Compare (2/2)');

          await exploreProfilesPage.getCompareButton().click();

          await expect(exploreProfilesPage.getByTestId('diff-flame-graph-panel')).toBeVisible({ timeout: 15000 });
          await exploreProfilesPage.assertNoSpinner();
          await expect(exploreProfilesPage.getComparisonPanel('baseline')).toBeVisible();
          await expect(exploreProfilesPage.getComparisonPanel('comparison')).toBeVisible();
          // One refresh on the compare panel re-runs time-range queries so graphs re-render
          await exploreProfilesPage.clickComparisonPanelRefresh('baseline');
          await exploreProfilesPage.assertNoSpinner();

          await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
            stylePath: './e2e/fixtures/css/hide-all-controls.css',
          });
        });

        test('Selecting the same baseline and comparison item then clicking on the "Compare" button', async ({
          exploreProfilesPage,
        }) => {
          await exploreProfilesPage.selectForComparison('us-east', 'Baseline');

          await expect(exploreProfilesPage.getCompareButton()).toBeDisabled();
          await expect(exploreProfilesPage.getCompareButton()).toHaveText('Compare (1/2)');

          await exploreProfilesPage.selectForComparison('us-east', 'Comparison');

          await expect(exploreProfilesPage.getCompareButton()).not.toBeDisabled();
          await expect(exploreProfilesPage.getCompareButton()).toHaveText('Compare (2/2)');

          await exploreProfilesPage.getCompareButton().click();

          await expect(exploreProfilesPage.getByTestId('diff-flame-graph-panel')).toBeVisible({ timeout: 15000 });
          await exploreProfilesPage.assertNoSpinner();
          await expect(exploreProfilesPage.getComparisonPanel('baseline')).toBeVisible();
          await expect(exploreProfilesPage.getComparisonPanel('comparison')).toBeVisible();
          await exploreProfilesPage.clickComparisonPanelRefresh('baseline');
          await exploreProfilesPage.assertNoSpinner();

          await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
            stylePath: './e2e/fixtures/css/hide-all-controls.css',
          });
        });
      });

      test.describe('Actions which reset the main timeseries', () => {
        test.beforeEach(async ({ exploreProfilesPage }) => {
          const filter = ['vehicle', '=', 'scooter'];
          await exploreProfilesPage.addFilter(filter);
          await exploreProfilesPage.assertFilters([filter]);
        });

        test('Profile type selector', async ({ exploreProfilesPage }) => {
          await exploreProfilesPage.selectProfileType('process_cpu/samples');
          await exploreProfilesPage.assertSelectedProfileType('process_cpu/samples');
          await exploreProfilesPage.assertNoSpinner();

          await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
            stylePath: './e2e/fixtures/css/hide-all-controls.css',
          });
        });

        test('Service selector', async ({ exploreProfilesPage }) => {
          await exploreProfilesPage.selectProfileType('process_cpu/samples');
          await exploreProfilesPage.assertSelectedProfileType('process_cpu/samples');

          await exploreProfilesPage.selectService('pyroscope');
          await exploreProfilesPage.assertSelectedService('pyroscope');

          await exploreProfilesPage.assertNoSpinner();

          await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
            stylePath: './e2e/fixtures/css/hide-all-controls.css',
          });
        });
      });
    });
  });

  test('Quick filter', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.assertQuickFilterResultsCount(7);

    await exploreProfilesPage.enterQuickFilterText('region,vehicle');

    await exploreProfilesPage.assertQuickFilterResultsCount(2);

    await expect(exploreProfilesPage.getGroupByPanels()).toHaveCount(2);
    await expect(exploreProfilesPage.getPanelByTitle('region (3)')).toBeVisible();
    await expect(exploreProfilesPage.getPanelByTitle('vehicle (4)')).toBeVisible();
  });

  test('Panel type switcher', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.assertNoSpinner();

    for (const panelType of ['Totals', 'Maxima', 'Histograms']) {
      await exploreProfilesPage.selectPanelType(panelType);

      await expect(exploreProfilesPage.getGroupByContainer()).toHaveScreenshot({
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    }
  });

  test('Layout switcher', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.assertNoSpinner();

    await exploreProfilesPage.selectLayout('Rows');
    await exploreProfilesPage.assertNoSpinner();

    // Match favorites/all-services layout switcher: full scene body is less flaky than groupByContainer alone
    await expect(exploreProfilesPage.getSceneBody()).toHaveScreenshot({
      stylePath: './e2e/fixtures/css/hide-all-controls.css',
      maxDiffPixelRatio: 0.03,
    });
  });

  test('Hide no data switcher', async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.enterQuickFilterText('region,vehicle');
    await exploreProfilesPage.addFilter(['pyroscope_spy', '!=', 'gospy']);

    await expect(exploreProfilesPage.getGroupByPanels()).toHaveCount(2);
    await exploreProfilesPage.assertPanelHasNoData('region (3)');
    await exploreProfilesPage.assertPanelHasNoData('vehicle (4)');

    await exploreProfilesPage.selectHidePanelsWithoutNoData();

    await expect(exploreProfilesPage.getGroupByPanels()).toHaveCount(0);
    await expect(exploreProfilesPage.getGroupByContainer().getByText(/No profiles found/)).toBeVisible();
  });
});
