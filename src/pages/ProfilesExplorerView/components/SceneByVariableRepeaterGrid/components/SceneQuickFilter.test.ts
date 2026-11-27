import { sceneUtils } from '@grafana/scenes';
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

  it('clears the input and cancels pending typing when navigation removes searchText', () => {
    const model = new SceneQuickFilter({ placeholder: '' });
    const deactivate = model.activate();
    model.updateFromUrl({ searchText: 'old' });
    type(model, 'pending');

    sceneUtils.syncStateFromSearchParams(model, new URLSearchParams());

    expect(model.state.inputText).toBe('');
    expect(model.getUrlState().searchText).toBe('');
    jest.advanceTimersByTime(SceneQuickFilter.DEBOUNCE_DELAY);
    expect(model.state.inputText).toBe('');
    expect(model.getUrlState().searchText).toBe('');
    deactivate();
  });

  it('preserves pending typing when a URL update does not include searchText', () => {
    const model = new SceneQuickFilter({ placeholder: '' });
    type(model, 'pending');

    model.updateFromUrl({});

    expect(model.state.inputText).toBe('pending');
    jest.advanceTimersByTime(SceneQuickFilter.DEBOUNCE_DELAY);
    expect(model.getUrlState().searchText).toBe('pending');
  });

  it('restores committed input on deactivation and keeps it consistent on reactivation', () => {
    const model = new SceneQuickFilter({ placeholder: '' });
    const deactivate = model.activate();
    model.updateFromUrl({ searchText: 'committed' });
    type(model, 'pending');

    deactivate();

    expect(model.state.inputText).toBe('committed');
    const deactivateAgain = model.activate();
    jest.advanceTimersByTime(SceneQuickFilter.DEBOUNCE_DELAY);
    expect(model.state.inputText).toBe('committed');
    expect(model.getUrlState().searchText).toBe('committed');
    deactivateAgain();
  });

  it('cancels pending changes on clear', () => {
    const model = new SceneQuickFilter({ placeholder: '' });
    const deactivate = model.activate();
    type(model, 'pending');

    model.clearSearchText();

    jest.advanceTimersByTime(SceneQuickFilter.DEBOUNCE_DELAY);
    expect(model.state.searchText).toBe('');
    expect(model.state.inputText).toBe('');
    deactivate();
  });

  it('cancels pending changes on reset', () => {
    const model = new SceneQuickFilter({ placeholder: '' });
    const deactivate = model.activate();
    type(model, 'pending');

    model.reset();

    jest.advanceTimersByTime(SceneQuickFilter.DEBOUNCE_DELAY);
    expect(model.state.searchText).toBe('');
    expect(model.state.inputText).toBe('');
    deactivate();
  });

  it('cancels pending changes on navigation', () => {
    const model = new SceneQuickFilter({ placeholder: '' });
    const deactivate = model.activate();
    type(model, 'pending');

    model.updateFromUrl({ searchText: 'from-url' });

    jest.advanceTimersByTime(SceneQuickFilter.DEBOUNCE_DELAY);
    expect(model.state.searchText).toBe('from-url');
    expect(model.state.inputText).toBe('from-url');
    deactivate();
  });

  it('cancels pending changes on deactivation', () => {
    const model = new SceneQuickFilter({ placeholder: '' });
    const deactivate = model.activate();
    type(model, 'pending');

    deactivate();

    jest.advanceTimersByTime(SceneQuickFilter.DEBOUNCE_DELAY);
    expect(model.state.searchText).toBe('');
    expect(model.state.inputText).toBe('');
  });
});
