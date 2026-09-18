import { ExplorationType } from '../../config/constants';
import { expect, test } from '../../fixtures';
import dense24hHeatmap from './fixtures/heatmap-dense-24h.json';
import duplicateYBucketsHeatmap from './fixtures/heatmap-duplicate-y-buckets.json';
import sparse12hHeatmap from './fixtures/heatmap-sparse-12h.json';
import sparse30mHeatmap from './fixtures/heatmap-sparse-30m.json';

const productionResponses = [
  { name: 'heatmap-dense-24h', response: dense24hHeatmap },
  { name: 'heatmap-sparse-30m', response: sparse30mHeatmap },
  { name: 'heatmap-sparse-12h', response: sparse12hHeatmap },
  { name: 'heatmap-duplicate-y-buckets', response: duplicateYBucketsHeatmap },
];

function getResponseTimeRange(response: (typeof productionResponses)[number]['response']) {
  const timestamps = response.series.flatMap((series) => series.slots.map((slot) => Number(slot.timestamp)));
  const start = Math.min(...timestamps) - 60_000;
  const end = Math.max(...timestamps) + 60_000;

  return {
    expectedDate: new Date(start).toISOString().slice(0, 10),
    urlParams: new URLSearchParams({
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
    }),
  };
}

test.describe('Span profiles heatmap', () => {
  for (const { name, response } of productionResponses) {
    test(`renders the ${name} production response`, async ({ exploreProfilesPage }) => {
      await exploreProfilesPage.route('**/querier.v1.QuerierService/SelectHeatmap', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response),
        });
      });

      const timeRange = getResponseTimeRange(response);
      await exploreProfilesPage.goto(ExplorationType.FlameGraph, timeRange.urlParams);
      await expect(exploreProfilesPage.getTimePickerButton()).toContainText(timeRange.expectedDate);

      const visualizationPicker = exploreProfilesPage.getSpanProfileVisualizationPicker();
      const spanHeatmap = visualizationPicker.getByLabel('Span heatmap');
      await expect(spanHeatmap).toBeEnabled({ timeout: 15000 });
      await spanHeatmap.click();

      await expect(exploreProfilesPage.page).toHaveURL(/showSpanHeatmap=true/);

      const panel = exploreProfilesPage.getSpanHeatmapPanel();
      await expect(panel).toBeVisible();
      await expect(panel.getByText('CPU time consumed per trace span')).toBeVisible();
      await expect(panel.getByText('Top span exemplars')).toBeVisible();
      await expect(panel.locator('tbody tr').first()).toBeVisible();

      const canvas = exploreProfilesPage.getSpanHeatmapCanvas();
      await expect(canvas).toBeVisible();
      const dimensions = await canvas.evaluate((element: HTMLCanvasElement) => ({
        width: element.width,
        height: element.height,
      }));
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.height).toBeGreaterThan(0);
      const bounds = await canvas.boundingBox();
      expect(bounds?.width).toBeGreaterThan(0);
      expect(bounds?.height).toBeGreaterThan(0);

      await expect(panel).toHaveScreenshot(`${name}.png`, {
        maxDiffPixelRatio: 0.01,
        stylePath: './e2e/fixtures/css/hide-all-controls.css',
      });
    });
  }
});
