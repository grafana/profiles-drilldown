import { expect, type Page } from '@playwright/test';

import { DEFAULT_EXPLORE_PROFILES_URL_PARAMS, ExplorationType } from '../../config/constants';
import { PyroscopePage } from './PyroscopePage';

type Coords = {
  x: number;
  y: number;
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ExploreProfilesPage extends PyroscopePage {
  constructor(readonly page: Page, defaultUrlParams: URLSearchParams) {
    const urlParams = new URLSearchParams(defaultUrlParams);

    super(page, '/a/grafana-pyroscope-app/explore', urlParams.toString());
  }

  goto(explorationType: ExplorationType, urlSearchParams = new URLSearchParams()) {
    const urlParams = new URLSearchParams({
      ...Object.fromEntries(DEFAULT_EXPLORE_PROFILES_URL_PARAMS),
      ...Object.fromEntries(urlSearchParams),
    });

    urlParams.set('explorationType', explorationType);

    return super.goto(urlParams.toString());
  }

  /* Data source */

  getDataSourceSelector() {
    return this.locator('#dataSource');
  }

  async assertSelectedDataSource(expectedDataSource: string) {
    const name = await this.getDataSourceSelector().textContent();
    await expect(name?.trim()).toBe(expectedDataSource);
  }

  /* Exploration type */

  getExplorationTypeSelector() {
    return this.getByTestId('exploration-types');
  }

  async asserSelectedExplorationType(expectedLabel: string) {
    const label = await this.getExplorationTypeSelector().locator('button[data-testid="is-active"]').textContent();
    await expect(label?.trim()).toBe(expectedLabel);
  }

  selectExplorationType(explorationType: string) {
    return this.getExplorationTypeSelector().getByLabel(explorationType).click();
  }

  /* Time picker/refresh */

  getTimePickerButton() {
    return this.getByTestId('data-testid TimePicker Open Button');
  }

  async assertSelectedTimeRange(expectedTimeRange: string | RegExp) {
    await expect(this.getTimePickerButton()).toContainText(expectedTimeRange);
  }

  async selectTimeRange(quickRangeLabel: string) {
    await this.getTimePickerButton().click();
    await this.getByTestId('data-testid TimePicker Overlay Content').getByText(quickRangeLabel).click();
  }

  getZoomOutButton() {
    return this.getByLabel('Zoom out time range');
  }

  clickOnZoomOut() {
    return this.getZoomOutButton().click();
  }

  getRefreshPicker() {
    return this.getByTestId('data-testid RefreshPicker run button');
  }

  clickOnRefresh() {
    return this.getRefreshPicker().click();
  }

  /* Header elements */

  get recordingRulesButton() {
    return this.getByLabel('Recording rules');
  }

  clickOnViewRecordingRulesButton() {
    return this.recordingRulesButton.click();
  }

  get addRecordingRuleButton() {
    return this.getByLabel('Add recording rule');
  }

  async clickOnAddRecordingRuleButton() {
    return this.addRecordingRuleButton.click();
  }

  get recordingRulesModalServiceName() {
    return this.getByTestId('Create recording rule modal service name field');
  }

  get recordingRulesModalMetricName() {
    return this.getByLabel('Metric name', { type: 'input' });
  }

  get recordingRulesModalFunctionName() {
    return this.getByLabel('Function name', { type: 'input' });
  }

  async fillRecordingRuleForm(options: { metricName?: string; functionName?: string }) {
    if (options.metricName) {
      await this.recordingRulesModalMetricName.fill(options.metricName);
    }
    if (options.functionName) {
      await this.recordingRulesModalFunctionName.fill(options.functionName);
    }
  }

  async submitRecordingRuleForm() {
    await this.getByRole('button', { name: 'Create' }).click();
  }

  get recordingRulesDropdown() {
    return this.getByLabel('Recording rules');
  }

  get recordingRulesViewRecordingRules() {
    return this.getByLabel('View recording rules');
  }

  clickOnViewRecordingRulesDropdown() {
    return this.recordingRulesDropdown.click();
  }

  clickOnViewRecordingRulesViewRecordingRules() {
    return this.recordingRulesViewRecordingRules.click();
  }

  async goToRecordingRulesPage() {
    await this.clickOnViewRecordingRulesDropdown();
    await this.clickOnViewRecordingRulesViewRecordingRules();
  }

  async assertRecordingRuleInTable(metricName: string, functionName: string) {
    const table = this.getRecordingRulesTable();
    const row = table.locator('tr').filter({ hasText: metricName }).first();
    await expect(row).toBeVisible();
    if (functionName) {
      await expect(row).toContainText(functionName);
    } else {
      await expect(row).toContainText('Total (all functions)');
    }
  }

  getRecordingRulesTable() {
    return this.page.locator('table');
  }

  /* Service */

  getServiceSelector() {
    return this.getByTestId('serviceName').locator('input');
  }

  async assertSelectedService(expectedService: string) {
    await expect(this.getServiceSelector()).toHaveValue(expectedService);
  }

  async selectService(serviceName: string) {
    await this.getServiceSelector().click();
    // Find the menu that contains this service (not another [role="menu"] on the page)
    const menuWithService = this.locator('[role="menu"]').filter({
      has: this.getByText(serviceName, { exact: true }),
    });
    await menuWithService.first().waitFor({ state: 'visible', timeout: 10000 });
    await menuWithService.first().getByText(serviceName, { exact: true }).click();
  }

  /* Profile type */

  getProfileTypeSelector() {
    return this.getByTestId('profileMetricId').locator('input');
  }

  async assertSelectedProfileType(expectedProfileType: string) {
    await expect(this.getProfileTypeSelector()).toHaveValue(expectedProfileType);
  }

  async selectProfileType(profileType: string) {
    const [category, type] = profileType.split('/');

    // Wait for profile type options to finish loading before opening the dropdown (avoids flaky timeouts)
    const selector = this.getProfileTypeSelector();
    await expect(this.getByTestId('profileMetricId')).not.toContainText('Loading...', { timeout: 15000 });

    await selector.click();

    // Match category/type case-insensitively (e.g. "Memory" vs "memory") for different Grafana/React versions
    const categoryRegex = new RegExp(`^${escapeRegex(category)}$`, 'i');
    const typeRegex = new RegExp(`^${escapeRegex(type)}$`, 'i');

    // Click by menu item role/name so we don't depend on which [role="menu"] contains them (avoids wrong menu when multiple dropdowns exist)
    const categoryItem = this.getByRole('menuitemcheckbox', { name: categoryRegex });
    await categoryItem.first().waitFor({ state: 'visible', timeout: 10000 });
    await categoryItem.first().click();

    const typeItem = this.getByRole('menuitemcheckbox', { name: typeRegex });
    await typeItem.first().waitFor({ state: 'visible', timeout: 5000 });
    await typeItem.first().click();
  }

  async assertProfileTypeSelectorOptions(expectedCategories: string[], expectedTypesPerCategory: string[][]) {
    await this.getProfileTypeSelector().click();

    // Cascader renders one [role="menu"] per column; use the first column only so submenu types
    // (e.g. cpu, samples) are not mixed into the top-level categories list.
    const firstColumnMenu = this.locator('[role="menu"]').first();
    const menuItems = firstColumnMenu.locator('[role="menuitemcheckbox"]');
    const categories = await menuItems.allTextContents();

    expect(categories).toEqual(expectedCategories);

    const allMenus = this.locator('[role="menu"]');

    for (let i = 0; i < categories.length; i += 1) {
      await menuItems.nth(i).click();

      const expectedTypes = expectedTypesPerCategory[i];
      // After clicking a category, types appear in the second column only. Do not use
      // filter({ has: getByText(expectedTypes[0]) }) — the first column can also contain
      // that label (e.g. category "goroutine" vs type "goroutine"), which would read
      // every column's checkboxes and fail the assertion.
      await expect.poll(async () => allMenus.count(), { timeout: 5000 }).toBeGreaterThanOrEqual(2);
      const submenu = allMenus.nth(1);
      await submenu.waitFor({ state: 'visible', timeout: 5000 });
      const categoryTypes = await submenu.locator('[role="menuitemcheckbox"]').allTextContents();

      expect(categoryTypes).toEqual(expectedTypes);
    }
  }

  /* Quick filter */

  getQuickFilterInput() {
    return this.getByLabel('Quick filter');
  }

  async assertQuickFilter(explectedPlaceholder: string, expectedValue: string, expectedResultsCount: number) {
    await expect(this.getQuickFilterInput()).toHaveAttribute('placeholder', explectedPlaceholder);
    await expect(this.getQuickFilterInput()).toHaveValue(expectedValue);
    await this.assertQuickFilterResultsCount(expectedResultsCount);
  }

  async enterQuickFilterText(searchText: string) {
    await this.getQuickFilterInput().fill(searchText);
    await this.waitForTimeout(250); // see SceneQuickFilter.DEBOUNCE_DELAY
  }

  async assertQuickFilterResultsCount(expectedCount: number) {
    await expect(this.getByTestId('quick-filter-results-count')).toHaveText(String(expectedCount));
  }

  /* Layout switcher */

  getLayoutSwitcher() {
    return this.getByLabel('Layout switcher');
  }

  async assertSelectedLayout(expectedLayoutName: string) {
    const layoutName = await this.getLayoutSwitcher().locator('input[checked]~label').textContent();
    await expect(layoutName?.trim()).toBe(expectedLayoutName);
  }

  selectLayout(layoutName: string) {
    return this.getLayoutSwitcher().getByLabel(layoutName).click();
  }

  /* Hide panels without data switcher */

  getHideNoDataSwitcher() {
    return this.getByTestId('noDataSwitcher');
  }

  async assertHideNoDataSwitcher(isChecked: boolean) {
    if (isChecked) {
      await expect(this.getHideNoDataSwitcher()).toBeChecked();
    } else {
      await expect(this.getHideNoDataSwitcher()).not.toBeChecked();
    }
  }

  async selectHidePanelsWithoutNoData() {
    // weirdly the mouse is on the "Flame graph" panel action at this point
    // so we have to move it for the label to become actionable
    await this.mouse.move(0, 0);
    await this.getHideNoDataSwitcher().check({ force: true });
  }

  /* Panel type switcher */

  getPanelTypeSwitcher() {
    return this.getByLabel('Panel type switcher');
  }

  async assertSelectedPanelType(expectedPanelType: string) {
    const panelType = await this.getPanelTypeSwitcher().locator('input[checked]~label').textContent();
    await expect(panelType?.trim()).toBe(expectedPanelType);
  }

  selectPanelType(panelType: string) {
    return this.getPanelTypeSwitcher().getByLabel(panelType).click();
  }

  /* Scene body & grid panels */

  getSceneBody() {
    return this.getByTestId('sceneBody');
  }

  /**
   * Waits until the scene body has finished laying out (panels/flame graph expanded).
   * At 1080p the body is ~642px after Grafana chrome; we require height >= 600 so screenshots
   * are not taken while the layout is still collapsed/loading.
   */
  async waitForSceneBodyRendered() {
    const sceneBody = this.getSceneBody();
    await expect(async () => {
      const height = await sceneBody.evaluate((el) => (el as HTMLElement).offsetHeight);
      expect(height).toBeGreaterThanOrEqual(600);
    }).toPass({ timeout: 15000 });
  }

  /**
   * Marks the panel DOM nodes that are currently mounted. The marker is an expando property, which
   * survives re-renders but not an unmount/remount, so counting the survivors after an interaction
   * tells us whether the grid reused its panels or tore them all down and rebuilt them.
   */
  tagMountedPanels() {
    return this.getSceneBody().evaluate((body) => {
      body.querySelectorAll('[data-viz-panel-key]').forEach((el) => {
        (el as HTMLElement & { __e2ePanelTag?: boolean }).__e2ePanelTag = true;
      });
    });
  }

  countTaggedPanels() {
    return this.getSceneBody().evaluate(
      (body) =>
        Array.from(body.querySelectorAll('[data-viz-panel-key]')).filter(
          (el) => (el as HTMLElement & { __e2ePanelTag?: boolean }).__e2ePanelTag
        ).length
    );
  }

  getPanelByTitle(title: string) {
    return this.getSceneBody().locator(`[data-viz-panel-key]:has([title="${title}"])`);
  }

  getPanels() {
    return this.getSceneBody().locator(`[data-viz-panel-key]`);
  }

  async clickOnPanelAction(panelTitle: string, actionLabel: string) {
    const panel = await this.getPanelByTitle(panelTitle);
    await panel.getByRole('button', { name: actionLabel, exact: true }).click();

    // we have to move the mouse to prevent the action tooltip to cover (e.g.) the profile type selector
    await this.mouse.move(0, 0);
  }

  async clickOnPanelMenuAction(panelTitle: string, actionLabel: string) {
    const panel = await this.getPanelByTitle(panelTitle);
    await panel.hover();
    await panel.getByRole('button', { name: `Menu for panel ${panelTitle}`, exact: true }).click();
    await this.getByRole('menuitem', { name: actionLabel, exact: true }).click();

    await this.mouse.move(0, 0);
  }

  async assertPanelHasNoData(panelTitle: string) {
    await expect(this.getPanelByTitle(panelTitle).getByText('No data')).toBeVisible();
  }

  async assertNoSpinner() {
    await expect(this.getByTestId('Spinner')).toHaveCount(0);
  }

  /* Filters */

  getFilters(filterKey: string) {
    return this.locator(`#query-builder-${filterKey}`);
  }

  async assertFilters(expectedFilters: string[][], filterKey = 'filters') {
    const filters = this.getFilters(filterKey).getByTestId('filtersList').getByLabel('Filter', { exact: true });

    await expect(filters).toHaveCount(expectedFilters.length);

    for (let i = 0; i < expectedFilters.length; i += 1) {
      const [expectedLabel, expectedOperator, expectedValue] = expectedFilters[i];

      const filter = filters.nth(0);
      const filterParts = filter.locator('button');

      await expect(filterParts.nth(0)).toHaveText(expectedLabel);
      await expect(filterParts.nth(1)).toHaveText(expectedOperator);
      await expect(filterParts.nth(2)).toHaveText(expectedValue);
    }
  }

  async addFilter(parts: string[], filterKey = 'filters') {
    await this.getFilters(filterKey).getByRole('combobox').click();

    const selectMenu = this.getByLabel('Select options menu');

    for (const part of parts) {
      await selectMenu.getByText(part, { exact: true }).click();
    }
  }

  /** Opens the filter input and returns the suggestions menu, which lists the labels found in the current time range. */
  async openFilterSuggestions(filterKey = 'filters') {
    await this.getFilters(filterKey).getByRole('combobox').click();

    return this.getByLabel('Select options menu');
  }

  closeFilterSuggestions() {
    return this.page.keyboard.press('Escape');
  }

  /* Flame graph component */

  getSpanProfileVisualizationPicker() {
    return this.getByLabel('Profile timeline visualization');
  }

  getSpanHeatmapPanel() {
    return this.getByTestId('span-heatmap-panel');
  }

  getSpanHeatmapCanvas() {
    return this.getSpanHeatmapPanel().locator('canvas');
  }

  getExportDataButton() {
    return this.getByLabel('Export profile data');
  }

  getFlamegraph() {
    return this.getByTestId('flameGraph');
  }

  getTopTable() {
    return this.getByTestId('topTable');
  }

  /** Clicks the "Auto-select" button in the diff flame graph banner to set baseline/comparison ranges so the flame graph is shown. */
  clickDiffFlameGraphAutoSelect() {
    return this.getByRole('button', { name: 'Auto-select' }).click();
  }

  clickOnFlameGraphNode({ x, y }: { x: number; y: number }) {
    return this.getFlamegraph().click({ position: { x, y } });
  }

  getFlameGraphContextualMenu() {
    return this.getByLabel('Context menu');
  }

  getFlameGraphContextualMenuItem(menuItemLabel: string) {
    return this.getFlameGraphContextualMenu().getByRole('menuitem', { name: menuItemLabel, exact: false });
  }

  closeFlameGraphContextualMenu() {
    return this.getByTestId('header-container').first().click();
  }

  /* Group by */

  getGroupByContainer() {
    return this.getByTestId('groupByLabelsContainer');
  }

  getGroupByPanels() {
    return this.getGroupByContainer().locator(`[data-viz-panel-key]`);
  }

  getGroupByLabelsSelector() {
    return this.getGroupByContainer().getByLabel('Labels selector', { exact: true });
  }

  /**
   * Selects a group-by label (radio when horizontal layout, or option when collapsed to Select).
   * Label counts like "vehicle (4)" can drift to "vehicle (3)" with data/UI changes—match by prefix
   * when exact label is not found.
   */
  async selectGroupByLabel(label: string) {
    const container = this.getGroupByContainer();
    const radios = container.getByRole('radio');
    const prefix = label.replace(/\s*\(\d+\)\s*$/, '');
    const prefixRegex = new RegExp(`^${escapeRegex(prefix)}\\b`);
    const targetRadio = container.getByRole('radio', { name: prefixRegex });

    // Wait for group-by labels to load (radios may appear after the initial "All" radio)
    await expect
      .poll(
        async () => {
          if ((await targetRadio.count()) > 0) {
            return true;
          }
          // Narrow layout fallback: no radios at all, only a Select
          if ((await radios.count()) === 0) {
            return (await container.locator('input[role="combobox"]').count()) > 0;
          }
          return false;
        },
        { timeout: 15000 }
      )
      .toBeTruthy();

    if ((await targetRadio.count()) > 0) {
      // Wide layout: prefer exact name match, fall back to prefix
      const exactRadio = container.getByRole('radio', { name: label, exact: true });
      if ((await exactRadio.count()) > 0) {
        await exactRadio.click();
        return;
      }
      const withCount = container.getByRole('radio', {
        name: new RegExp(`^${escapeRegex(prefix)}\\s*\\(\\d+\\)$`),
      });
      if ((await withCount.count()) > 0) {
        await withCount.first().click();
        return;
      }
      await targetRadio.first().click();
      return;
    }

    // Narrow layout: Labels selector is a Select; open and pick option
    await container.getByLabel('Labels selector', { exact: true }).click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  getCompareButton() {
    return this.getGroupByContainer().getByRole('button', { name: 'Compare' });
  }

  getClearComparisonButton() {
    // getByRole('button', { name:... }) does not work :man_shrug:
    return this.getGroupByContainer().getByTestId('clearComparison');
  }

  getStatsPanel(labelValue: string) {
    return this.getGroupByContainer().getByTestId(`stats-panel-${labelValue}`);
  }

  async selectForComparison(panelTitle: string, target: string) {
    await this.getStatsPanel(panelTitle).getByText(target).click();
  }

  /* Diff panels */

  getComparisonPanel(target: 'baseline' | 'comparison') {
    return this.getByTestId(`panel-${target}`);
  }

  /** Clicks the refresh/run button on a compare panel header (re-runs timeseries query). */
  clickComparisonPanelRefresh(target: 'baseline' | 'comparison' = 'baseline') {
    return this.getComparisonPanel(target).getByTestId('data-testid RefreshPicker run button').click();
  }

  getComparisonTimePickerButton(target: 'baseline' | 'comparison') {
    return this.getByTestId(`panel-${target}`).getByTestId('data-testid TimePicker Open Button');
  }

  async selectComparisonQuickRange(target: 'baseline' | 'comparison', quickRangeLabel: string) {
    await this.getComparisonTimePickerButton(target).click();
    await this.getByTestId('data-testid TimePicker Overlay Content').getByText(quickRangeLabel).click();
  }

  async selectComparisonTimeRange(target: 'baseline' | 'comparison', from: string, to: string) {
    await this.getComparisonTimePickerButton(target).click();

    const overlay = this.getByTestId('data-testid TimePicker Overlay Content');

    await overlay.getByTestId('data-testid Time Range to field').fill(to);
    await overlay.getByTestId('data-testid Time Range from field').fill(from);

    await overlay.getByTestId('data-testid TimePicker submit button').click();
  }

  async switchComparisonSelectionMode(target: 'baseline' | 'comparison', label: 'Time picker' | 'Flame graph') {
    await this.getComparisonPanel(target).getByLabel('Range selection mode').getByLabel(label).click();
  }

  async clickAndDragOnComparisonPanel(target: 'baseline' | 'comparison', coordsFrom: Coords, coordsTo: Coords) {
    const panel = this.getComparisonPanel(target);

    await panel.hover({ position: coordsFrom });
    await this.mouse.down();

    await panel.hover({ position: coordsTo });
    await this.mouse.up();
  }

  clickOnSyncTimerangesButton(target: 'baseline' | 'comparison') {
    return this.getComparisonPanel(target)
      .getByRole('button', { name: /^sync time ranges/i })
      .click();
  }
}
