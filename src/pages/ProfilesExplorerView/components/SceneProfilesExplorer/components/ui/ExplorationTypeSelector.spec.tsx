import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { ExplorationTypeSelector } from './ExplorationTypeSelector';

describe('ExplorationTypeSelector stable IDs', () => {
  it('keeps IDs when selection and translated labels change, preserving the active marker', () => {
    const onChange = jest.fn();
    const options = [
      { value: 'all', label: 'All services' },
      { value: 'flame-graph', label: 'Flame graph' },
    ];
    const { rerender } = render(<ExplorationTypeSelector options={options} value="all" onChange={onChange} />);
    const flame = document.getElementById('profiles-exploration-flame-graph')!;
    expect(flame).toHaveTextContent('Flame graph');
    fireEvent.click(flame);
    expect(onChange).toHaveBeenCalledWith('flame-graph');
    expect(screen.getByTestId('is-active')).toHaveAttribute('id', 'profiles-exploration-all');
    rerender(
      <ExplorationTypeSelector
        options={[
          { value: 'all', label: 'Tous' },
          { value: 'flame-graph', label: 'Flamme' },
        ]}
        value="flame-graph"
        onChange={onChange}
      />
    );
    expect(document.getElementById('profiles-exploration-flame-graph')).toHaveTextContent('Flamme');
    expect(screen.getByTestId('is-active')).toHaveAttribute('id', 'profiles-exploration-flame-graph');
  });
});
