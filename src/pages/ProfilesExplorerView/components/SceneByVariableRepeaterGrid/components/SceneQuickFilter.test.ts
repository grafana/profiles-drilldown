import React from 'react';

import { SceneQuickFilter } from './SceneQuickFilter';

describe('SceneQuickFilter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function type(model: SceneQuickFilter, value: string) {
    model.onChange({ target: { value } } as React.ChangeEvent<HTMLInputElement>);
  }

  it('updates the input immediately but commits URL state only after typing stops', () => {
    const model = new SceneQuickFilter({ placeholder: '' });
    type(model, 'a');
    jest.advanceTimersByTime(200);
    type(model, 'ab');
    expect(model.state.inputText).toBe('ab');
    expect(model.getUrlState().searchText).toBe('');
    jest.advanceTimersByTime(249);
    expect(model.getUrlState().searchText).toBe('');
    jest.advanceTimersByTime(1);
    expect(model.getUrlState().searchText).toBe('ab');
  });

  it.each(['clear', 'reset', 'navigate', 'deactivate'])('cancels pending changes on %s', (action) => {
    const model = new SceneQuickFilter({ placeholder: '' });
    const deactivate = model.activate();
    type(model, 'pending');
    if (action === 'clear') {
      model.clearSearchText();
    } else if (action === 'reset') {
      model.reset();
    } else if (action === 'navigate') {
      model.updateFromUrl({ searchText: 'from-url' });
    } else {
      deactivate();
    }
    jest.advanceTimersByTime(SceneQuickFilter.DEBOUNCE_DELAY);
    expect(model.state.searchText).toBe(action === 'navigate' ? 'from-url' : '');
    expect(model.state.inputText).toBe(action === 'deactivate' ? 'pending' : model.state.searchText);
    if (action !== 'deactivate') {
      deactivate();
    }
  });
});
