import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { SceneQuickFilter } from './SceneQuickFilter';

jest.mock('@shared/domain/reportInteraction', () => ({ reportInteraction: jest.fn() }));

describe('SceneQuickFilter stable IDs', () => {
  it('targets the actual input and clear control independent of placeholder', () => {
    const model = new SceneQuickFilter({ placeholder: 'Search services' });
    render(<SceneQuickFilter.Component model={model} />);
    const input = screen.getByTestId('profiles-quick-filter');
    fireEvent.change(input, { target: { value: 'ride' } });
    expect(model.state.searchText).toBe('ride');
    expect(input).toHaveValue('ride');
    fireEvent.click(screen.getByTestId('profiles-quick-filter-clear'));
    expect(model.state.searchText).toBe('');
    expect(input).toHaveValue('');
  });
});
