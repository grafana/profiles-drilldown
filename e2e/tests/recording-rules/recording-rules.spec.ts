import { ExplorationType } from '../../config/constants';
import { expect, test } from '../../fixtures';

// Feature-control override. Anonymous e2e does not initialize Grafana's OFREP client,
// so the shared localStorage provider is what enables metricsFromProfiles for these tests.
const METRICS_FROM_PROFILES_OPEN_FEATURE_KEY = 'grafana.openfeature.metricsFromProfiles';

test.beforeEach(async ({ settingsPage }) => {
  await settingsPage.page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, 'true');
  }, METRICS_FROM_PROFILES_OPEN_FEATURE_KEY);
  await settingsPage.goto();
});

test.afterEach(async ({ settingsPage }) => {
  await settingsPage.resetTestSettings(false);
});

test.describe('Recording rules', () => {
  // prevents unwanted settings modifications while running multiple tests in parallel
  test.describe.configure({ mode: 'serial' });

  test.describe('Settings', () => {
    test('is not available by default', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.goto(ExplorationType.FlameGraph);

      await expect(exploreProfilesPage.recordingRulesButton).not.toBeVisible();

      await exploreProfilesPage.clickOnFlameGraphNode({ x: 250, y: 10 });
      await expect(exploreProfilesPage.getFlameGraphContextualMenuItem('Create recording rule')).not.toBeVisible();
      await expect(exploreProfilesPage.getFlameGraphContextualMenuItem('Create recording rule')).not.toBeVisible();
    });

    test('can be enabled', async ({ settingsPage, exploreProfilesPage }) => {
      await settingsPage.setMetricsFromProfilesEnabled(true);
      const setResponse = exploreProfilesPage.waitForResponse(
        (r) => r.url().includes('SettingsService/Set') && r.request().method() === 'POST' && r.ok()
      );
      await settingsPage.getSaveSettingsButton().click();
      await setResponse;
      await expect(settingsPage.getSuccessAlertDialog()).toBeVisible();

      await exploreProfilesPage.goto(ExplorationType.AllServices);
      await exploreProfilesPage.assertNoSpinner();
      await expect(exploreProfilesPage.recordingRulesButton).toBeVisible({ timeout: 15000 });

      await exploreProfilesPage.goto(ExplorationType.FlameGraph);
      // Flame graph context menu is wired only when useFetchPluginSettings has enableMetricsFromProfiles;
      // same-page navigation can reuse stale query — reload so GET runs again (matches Create and display).
      await exploreProfilesPage.page.reload();
      await exploreProfilesPage.assertNoSpinner();
      await expect(exploreProfilesPage.getFlamegraph()).toBeVisible({ timeout: 15000 });
      await expect(exploreProfilesPage.recordingRulesButton).toBeVisible({ timeout: 15000 });
      await exploreProfilesPage.clickOnFlameGraphNode({ x: 250, y: 10 });
      await expect(exploreProfilesPage.getFlameGraphContextualMenuItem('Create recording rule')).toBeVisible({
        timeout: 15000,
      });
    });

    test('create a recording rule for all services', async ({ settingsPage, exploreProfilesPage }) => {
      await settingsPage.setMetricsFromProfilesEnabled(true);
      await settingsPage.getSaveSettingsButton().click();
      await expect(settingsPage.getSuccessAlertDialog()).toBeVisible();

      await exploreProfilesPage.goto(ExplorationType.AllServices);
      await expect(exploreProfilesPage.recordingRulesButton).toBeVisible({ timeout: 15000 });
      await exploreProfilesPage.clickOnViewRecordingRulesButton();
      await expect(exploreProfilesPage.addRecordingRuleButton).toBeVisible();
      await exploreProfilesPage.clickOnAddRecordingRuleButton();

      await expect(exploreProfilesPage.recordingRulesModalServiceName).toContainText('All services');
    });

    test('create a recording rule for a single service', async ({ settingsPage, exploreProfilesPage }) => {
      await settingsPage.setMetricsFromProfilesEnabled(true);
      await settingsPage.getSaveSettingsButton().click();
      await expect(settingsPage.getSuccessAlertDialog()).toBeVisible();

      await exploreProfilesPage.goto(ExplorationType.ProfileTypes);
      await expect(exploreProfilesPage.recordingRulesButton).toBeVisible({ timeout: 15000 });
      await exploreProfilesPage.clickOnViewRecordingRulesButton();
      await expect(exploreProfilesPage.addRecordingRuleButton).toBeVisible();
      await exploreProfilesPage.clickOnAddRecordingRuleButton();

      await expect(exploreProfilesPage.recordingRulesModalServiceName).toContainText('ride-sharing-app');
    });
  });

  test('Create and display', async ({ settingsPage, exploreProfilesPage }) => {
    await settingsPage.setMetricsFromProfilesEnabled(true);
    await settingsPage.getSaveSettingsButton().click();
    await expect(settingsPage.getSuccessAlertDialog()).toBeVisible();

    await exploreProfilesPage.goto(ExplorationType.FlameGraph);
    await exploreProfilesPage.page.reload();
    await exploreProfilesPage.assertNoSpinner();
    await expect(exploreProfilesPage.recordingRulesButton).toBeVisible({ timeout: 15000 });
    await exploreProfilesPage.clickOnFlameGraphNode({ x: 250, y: 10 });
    await exploreProfilesPage.getFlameGraphContextualMenuItem('Create recording rule').click();

    // Create rule with specific function name
    await exploreProfilesPage.fillRecordingRuleForm({
      metricName: 'test_specific_function_metric',
      functionName: 'test_specific_function_name',
    });
    await exploreProfilesPage.submitRecordingRuleForm();

    // Go to recording rules page and verify the function name is displayed
    await exploreProfilesPage.goToRecordingRulesPage();
    await exploreProfilesPage.assertRecordingRuleInTable(
      'profiles_recorded_test_specific_function_metric',
      'test_specific_function_name'
    );
  });
});
