import { usePluginComponent } from '@grafana/runtime';
import { sceneGraph, SceneTimeRange } from '@grafana/scenes';
import { DataQuery } from '@grafana/schema';
import { OpenFeatureTestProvider } from '@openfeature/react-sdk';
import { OpenFeature } from '@openfeature/web-sdk';
import { useFlagQueryLibrary } from '@shared/infrastructure/featureFlags/featureFlags';
import { PLUGIN_OPEN_FEATURE_DOMAIN } from '@shared/infrastructure/featureFlags/openFeature';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { LoadSearchScene } from './LoadSearchScene';
import { asSceneObject, getSaveSearchMock, getUtilsMock } from './testHelpers';

jest.mock('react-inlinesvg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('svg', {}),
  };
});
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  usePluginComponent: jest.fn(),
}));
jest.mock('./saveSearch', () => ({
  useSavedSearches: jest.fn(),
  applySavedSearchToScene: jest.fn(),
  useHasSavedSearches: jest.fn(),
}));
jest.mock('@shared/infrastructure/featureFlags/featureFlags', () => ({
  useFlagQueryLibrary: jest.fn(),
}));
jest.mock('./utils', () => ({
  getDatasourceVariable: jest.fn(),
  getFiltersVariable: jest.fn(),
  getProfilesExplorerScene: jest.fn(),
}));

const saveSearch = getSaveSearchMock();
const utils = getUtilsMock();
const useFlagQueryLibraryMock = jest.mocked(useFlagQueryLibrary);
const usePluginComponentMock = jest.mocked(usePluginComponent);
const actualFeatureFlags = jest.requireActual<typeof import('@shared/infrastructure/featureFlags/featureFlags')>(
  '@shared/infrastructure/featureFlags/featureFlags'
);

const ExposedComponent = () => <div>Exposed component</div>;

const renderLoadSearch = () => {
  const scene = new LoadSearchScene({ dsUid: 'test-datasource-uid', dsName: 'test-datasource-uid' });

  return render(
    <OpenFeatureTestProvider
      domain={PLUGIN_OPEN_FEATURE_DOMAIN}
      delayMs={1}
      flagValueMap={{ [actualFeatureFlags.QUERY_LIBRARY_FEATURE_FLAG_KEY]: true }}
    >
      <scene.Component model={scene} />
    </OpenFeatureTestProvider>
  );
};

function FakeExposedComponent({ onSelectQuery }: { onSelectQuery(query: DataQuery): void }) {
  return (
    <div>
      <button
        onClick={() => {
          onSelectQuery({
            refId: 'A',
            datasource: {
              type: 'grafana-pyroscope-datasource',
              uid: 'test-ds',
            },
            query: '{job="test1"}',
          } as DataQuery);
        }}
      >
        Select
      </button>
    </div>
  );
}

describe('LoadSearchScene', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getDatasourceVariable.mockReturnValue({
      getValue: () => 'test-datasource-uid',
      subscribeToState: jest.fn(),
      changeValueTo: jest.fn(),
      state: { text: 'test-datasource-uid' },
    });
    utils.getFiltersVariable.mockReturnValue({ setState: jest.fn() });
    utils.getProfilesExplorerScene.mockReturnValue({ state: { isEmbedded: false } });
    saveSearch.useSavedSearches.mockReturnValue({
      deleteSearch: jest.fn(),
      saveSearch: jest.fn(),
      searches: [],
      isLoading: false,
    });
    jest.spyOn(sceneGraph, 'getAncestor').mockReturnValue(asSceneObject({ state: { isEmbedded: false } }));
    jest.spyOn(sceneGraph, 'getTimeRange').mockReturnValue({
      state: { value: { from: 'now-1h', to: 'now', raw: { from: 'now-1h', to: 'now' } } },
    } as unknown as SceneTimeRange);
    jest.mocked(usePluginComponent).mockReturnValue({ component: undefined, isLoading: false });
    jest.mocked(useFlagQueryLibrary).mockReturnValue(false);
  });

  afterEach(async () => {
    await OpenFeature.clearProviders();
  });

  describe('when the query library flag resolves after mount', () => {
    beforeEach(() => {
      useFlagQueryLibraryMock.mockImplementation(actualFeatureFlags.useFlagQueryLibrary);
      usePluginComponentMock.mockReturnValue({ component: ExposedComponent, isLoading: false });
      saveSearch.useHasSavedSearches.mockReturnValue(true);
    });

    it('should switch load controls to Saved queries', async () => {
      renderLoadSearch();

      expect(screen.getByRole('button', { name: 'Load saved search' })).toBeInTheDocument();
      expect(screen.queryByText('Exposed component')).not.toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Exposed component')).toBeVisible();
      });
      expect(screen.queryByRole('button', { name: 'Load saved search' })).not.toBeInTheDocument();
    });
  });

  test('Disables button when there are no saved searches', () => {
    saveSearch.useHasSavedSearches.mockReturnValue(false);

    const scene = new LoadSearchScene({ dsUid: 'test-datasource-uid', dsName: 'test-datasource-uid' });
    render(<scene.Component model={scene} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  test('Enables button when there are saved searches', () => {
    saveSearch.useHasSavedSearches.mockReturnValue(true);

    const scene = new LoadSearchScene({ dsUid: 'test-datasource-uid', dsName: 'test-datasource-uid' });
    render(<scene.Component model={scene} />);

    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
  });

  test('Opens modal when button is clicked', () => {
    saveSearch.useHasSavedSearches.mockReturnValue(true);

    const scene = new LoadSearchScene({ dsUid: 'test-datasource-uid', dsName: 'test-datasource-uid' });
    render(<scene.Component model={scene} />);

    expect(screen.queryByText('Load a previously saved search')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('Load a previously saved search')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close'));

    expect(screen.queryByText('Load a previously saved search')).not.toBeInTheDocument();
  });

  test('Returns null when the scene is embedded', () => {
    // LoadSearchScene returns null when query library is supported but no exposed component is available
    jest.mocked(useFlagQueryLibrary).mockReturnValue(true);
    jest.mocked(usePluginComponent).mockReturnValue({ component: undefined, isLoading: false });

    const scene = new LoadSearchScene({ dsUid: 'test-datasource-uid', dsName: 'test-datasource-uid' });
    const { container } = render(<scene.Component model={scene} />);

    expect(container.firstChild).toBeNull();
  });

  test('Uses the exposed component if available', () => {
    const component = () => <div>Exposed component</div>;
    jest.mocked(useFlagQueryLibrary).mockReturnValue(true);
    jest.mocked(usePluginComponent).mockReturnValue({ component, isLoading: false });

    const scene = new LoadSearchScene({ dsUid: 'test-datasource-uid', dsName: 'test-datasource-uid' });
    render(<scene.Component model={scene} />);

    expect(screen.getByText('Exposed component')).toBeInTheDocument();
  });

  describe('Loading a search', () => {
    beforeEach(() => {
      jest.mocked(useFlagQueryLibrary).mockReturnValue(true);
      // @ts-expect-error
      jest.mocked(usePluginComponent).mockReturnValue({ component: FakeExposedComponent, isLoading: false });
      saveSearch.useHasSavedSearches.mockReturnValue(true);
    });

    test('Applies filters when a query is selected from the exposed component', () => {
      const scene = new LoadSearchScene({ dsUid: 'test-datasource-uid', dsName: 'test-datasource-uid' });
      render(<scene.Component model={scene} />);

      fireEvent.click(screen.getByText('Select'));

      expect(saveSearch.applySavedSearchToScene).toHaveBeenCalledWith(scene, '{job="test1"}', 'test-ds');
    });
  });
});
