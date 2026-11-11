import { fireEvent, render, screen } from '@testing-library/react';
import React, { act } from 'react';

import { PanelType } from '../../../../SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { GridItemData } from '../../../../SceneByVariableRepeaterGrid/types/GridItemData';
import { CompareTarget } from '../../../../SceneExploreDiffFlameGraph/domain/types';
import { CompareControls } from './CompareControls';

jest.mock('../components/SceneLabelValuesGrid/components/SceneStatsPanel/SceneStatsPanel', () => ({
  SceneStatsPanel: { WIDTH_IN_PIXELS: 186 },
}));

const baseline: GridItemData = {
  index: 0,
  value: 'baseline',
  label: 'Baseline panel',
  queryRunnerParams: {},
  panelType: PanelType.TIMESERIES,
};
const comparison: GridItemData = { ...baseline, index: 1, value: 'comparison', label: 'Comparison panel' };

const selections: Array<[string, Map<CompareTarget, GridItemData>]> = [
  ['no selection', new Map()],
  ['baseline only', new Map([[CompareTarget.BASELINE, baseline]])],
  ['comparison only', new Map([[CompareTarget.COMPARISON, comparison]])],
  [
    'both selections',
    new Map([
      [CompareTarget.BASELINE, baseline],
      [CompareTarget.COMPARISON, comparison],
    ]),
  ],
];

describe('CompareControls', () => {
  it.each(selections)('names the clear control and preserves its behavior with %s', async (_name, compare) => {
    const onClickClear = jest.fn();
    await act(async () => {
      render(<CompareControls compare={compare} onClickCompare={jest.fn()} onClickClear={onClickClear} />);
    });

    const clearButton = screen.getByRole('button', { name: 'Clear comparison selection' });

    expect(clearButton).toHaveProperty('disabled', compare.size === 0);
    fireEvent.click(clearButton);
    expect(onClickClear).toHaveBeenCalledTimes(compare.size === 0 ? 0 : 1);
  });
});
