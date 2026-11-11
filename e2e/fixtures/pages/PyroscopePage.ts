import { expect, Mouse, type Page, Request, Route } from '@playwright/test';

export class PyroscopePage {
  readonly page: Page;
  readonly mouse: Mouse;

  pathname: string;
  urlParams: string;

  constructor(page: Page, pathname: string, urlParams: string) {
    this.page = page;
    this.mouse = page.mouse;
    this.pathname = pathname;
    this.urlParams = urlParams;
  }

  async goto(urlParams: string | undefined = undefined) {
    const url = urlParams !== undefined ? `${this.pathname}?${urlParams}` : `${this.pathname}?${this.urlParams}`;

    await this.page.goto(url);
    await this.page.locator('.pyroscope-app').waitFor();
    await expect(this.getByRole('alert', { name: /fatal error/i })).not.toBeVisible();
  }

  locator(selector: string, options?: Record<string, unknown>) {
    return this.page.locator(selector, options);
  }

  getByTestId(testId: string | RegExp) {
    return this.page.getByTestId(testId);
  }

  getByLabel(label: string, options?: Record<string, unknown>) {
    return this.page.getByLabel(label, options);
  }

  getByText(text: Parameters<Page['getByText']>[0], options?: Parameters<Page['getByText']>[1]) {
    return this.page.getByText(text, options);
  }

  getByRole(role: Parameters<Page['getByRole']>[0], options?: Parameters<Page['getByRole']>[1]) {
    return this.page.getByRole(role, options);
  }

  // TODO: check if we can delete it once legacy comparison views have been removed from the code base
  clickOnNavLink(label: string) {
    return this.page.getByLabel(label).click();
  }

  // TODO: check if we can delete it once legacy comparison views have been removed from the code base
  getTitle() {
    return this.page.getByTestId('page-title');
  }

  async getQueryAnalysisSpan() {
    const queryAnalysisTooltip = this.page.getByTestId('queryAnalysis-tooltip');
    const queryAnalysisSpan = queryAnalysisTooltip.locator('span');

    const slowExpect = expect.configure({ timeout: 10000 });
    await slowExpect(queryAnalysisSpan).toBeVisible();
    return queryAnalysisSpan;
  }

  // TODO: check if we can delete it once legacy comparison views have been removed from the code base
  async assertNoLoadingPanels() {
    const slowExpect = expect.configure({ timeout: 10000 });

    const loadingPanels = this.page.getByLabel('Panel loading bar');
    const loadingPanelsCount = await loadingPanels.count();

    for (let i = 0; i < loadingPanelsCount; i += 1) {
      await slowExpect(loadingPanels.nth(i)).not.toBeVisible();
    }
  }

  async clickOnMenuItem(itemText: string) {
    // TODO: improve after upgrading Grafana version (which has a different navigation menu)
    await this.page.locator(`a:has-text("${itemText}")`).first().click();
  }

  waitForRequest(
    urlOrPredicate: Parameters<Page['waitForRequest']>[0],
    options?: Parameters<Page['waitForRequest']>[1]
  ) {
    return this.page.waitForRequest(urlOrPredicate, options);
  }

  waitForResponse(
    urlOrPredicate: Parameters<Page['waitForResponse']>[0],
    options?: Parameters<Page['waitForResponse']>[1]
  ) {
    return this.page.waitForResponse(urlOrPredicate, options);
  }

  waitForTimeout(timeout: number) {
    return this.page.waitForTimeout(timeout);
  }

  route(url: string, handler: (route: Route, request: Request) => any, options?: Record<string, any>) {
    return this.page.route(url, handler, options);
  }

  pause() {
    return this.page.pause();
  }
}
