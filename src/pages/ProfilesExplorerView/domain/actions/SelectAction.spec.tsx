import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { PanelType } from '../../components/SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { SelectAction } from './SelectAction';

jest.mock('@shared/domain/reportInteraction', () => ({ reportInteraction: jest.fn() }));

describe('SelectAction stable IDs', () => {
  it('identifies repeated actions by type and stable item value, not label or position', () => {
    const item = {
      index: 0,
      value: 'service/a',
      label: 'Translated label',
      queryRunnerParams: { serviceName: 'service/a' },
      panelType: PanelType.TIMESERIES,
    };
    const model = new SelectAction({ type: 'view-profiles', item, skipVariablesInterpolation: true });
    const publish = jest.spyOn(model, 'publishEvent');
    const { rerender } = render(<SelectAction.Component model={model} />);
    fireEvent.click(screen.getByTestId('profiles-view-profiles-service%2Fa'));
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ item: expect.objectContaining({ value: 'service/a' }) }),
      }),
      true
    );
    const other = new SelectAction({
      type: 'view-profiles',
      item: { ...item, index: 5, label: 'Another translation' },
    });
    rerender(<SelectAction.Component model={other} />);
    expect(screen.getByTestId('profiles-view-profiles-service%2Fa')).toBeVisible();
  });
});
