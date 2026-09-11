import { ExplorationType } from '../../config/constants';
import { expect, test } from '../../fixtures';
import SelectMergeProfileResponse from './fixtures/SelectMergeProfile.json';

const pyroscopeUrlParams = new URLSearchParams({
  // we use the "pyroscope" service because the static data from "ride-sharing-app" does not work with the GitHub integration
  from: 'now-5m',
  to: 'now',
  'var-serviceName': 'pyroscope',
});

test.describe('Flame graph view', () => {
  test.beforeEach(async ({ exploreProfilesPage }) => {
    await exploreProfilesPage.goto(ExplorationType.FlameGraph, pyroscopeUrlParams);
  });

  test.describe('GitHub Integration', () => {
    const nodePosition = { x: 125, y: 55 };
    const functionName = 'github.com/grafana/dskit/services.(*BasicService).main';
    const startLine = '153';
    // see ellipsis hack in SceneFunctionDetailsPanel.tsx
    const fileName = '‎github.com/grafana/dskit@v0.0.0-20231221015914-de83901bf4d6/services/basic_service.go';

    test('When clicking on a flame graph node and then "Function details", it opens a details panel', async ({
      exploreProfilesPage,
    }) => {
      // to prevent flakiness, we choose this profile type for the arrangement of its nodes
      await exploreProfilesPage.selectProfileType('block/delay');

      const topTable = exploreProfilesPage.getTopTable();
      await topTable.getByText('Total').click();
      await topTable.getByText('Total').click();
      await expect(topTable.getByText(functionName)).toBeVisible();

      // Fixed {x:30,y:60} can hit a different frame (e.g. runtime.chanrecv2); panel then shows that
      // frame's name instead of the expected BasicService.main. Try several positions and keep the
      // first open where the function name row matches (mock + stacktrace must align for assertions).
      await exploreProfilesPage.route('**/SelectMergeProfile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(SelectMergeProfileResponse),
        });
      });

      const flamegraph = exploreProfilesPage.getFlamegraph();
      await expect(flamegraph).toBeVisible({ timeout: 15000 });
      const box = await flamegraph.boundingBox();
      expect(box).toBeTruthy();
      const candidates = [
        nodePosition,
        { x: Math.round(box!.width * 0.35), y: Math.round(box!.height * 0.2) },
        { x: Math.round(box!.width * 0.5), y: Math.round(box!.height * 0.35) },
        { x: Math.round(box!.width * 0.25), y: Math.round(box!.height * 0.45) },
      ];

      const detailsPanel = exploreProfilesPage.getByTestId('function-details-panel');
      let openedCorrectFrame = false;
      for (const pos of candidates) {
        await flamegraph.click({ position: pos });
        const menuItem = exploreProfilesPage.getFlameGraphContextualMenuItem('Function details');
        try {
          await expect(menuItem).toBeVisible({ timeout: 2000 });
        } catch {
          await exploreProfilesPage.page.keyboard.press('Escape');
          continue;
        }
        await menuItem.click();
        await expect(detailsPanel).toBeVisible({ timeout: 10000 });
        const span = detailsPanel.getByTestId('row-function-name').locator('span');
        const text = await span.textContent();
        if (text?.trim() === functionName) {
          openedCorrectFrame = true;
          break;
        }
        await detailsPanel.getByLabel('close').click();
        await expect(detailsPanel).not.toBeVisible({ timeout: 5000 });
      }
      expect(openedCorrectFrame).toBe(true);

      await expect(detailsPanel).toBeVisible();
      await expect(detailsPanel.getByText('Function Details')).toBeVisible();

      const functionNameRow = detailsPanel.getByTestId('row-function-name');
      await expect(functionNameRow.getByText('Function name')).toBeVisible();
      await expect(functionNameRow.locator('span')).toHaveText(functionName);

      const startLineRow = detailsPanel.getByTestId('row-start-line');
      await expect(startLineRow.getByText('Start line')).toBeVisible();
      await expect(startLineRow.locator('span')).toHaveText(startLine);

      const filePathRow = detailsPanel.getByTestId('row-file-path');
      await expect(filePathRow.getByText('File')).toBeVisible();
      await expect(filePathRow.getByText(fileName)).toBeVisible();

      const repositoryRow = detailsPanel.getByTestId('row-repository');
      await expect(repositoryRow.getByText('Repository')).toBeVisible();
      await expect(repositoryRow.getByText('Connect to grafana/pyroscope')).toBeVisible();

      const commitRow = detailsPanel.getByTestId('row-commit');
      await expect(commitRow.getByText('Commit')).toBeVisible();

      const codeContainer = detailsPanel.getByTestId('function-details-code-container');
      await expect(codeContainer.getByText('Breakdown per line')).toBeVisible();
      await expect(codeContainer.getByText('View on GitHub')).toBeVisible();
      await expect(codeContainer.getByText('Optimize Code')).toBeVisible();

      await expect(codeContainer.getByTestId('function-details-code')).toBeVisible();
    });

    test('The details panel is automatically closed when loading new data', async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.clickOnFlameGraphNode(nodePosition);
      await exploreProfilesPage.getFlameGraphContextualMenuItem('Function details').click();

      await expect(exploreProfilesPage.getByTestId('function-details-panel')).toBeVisible();

      await Promise.all([
        exploreProfilesPage.selectProfileType('memory/alloc_space'),
        // only needed for this test: we have to throttle the query requests to force the correct loading state in SceneFlameGraph
        exploreProfilesPage.route('**/query?*', async (route) => {
          await new Promise((f) => setTimeout(f, 250));
          await route.continue();
        }),
      ]);

      await expect(exploreProfilesPage.getByTestId('function-details-panel')).not.toBeVisible();
    });
  });
});
