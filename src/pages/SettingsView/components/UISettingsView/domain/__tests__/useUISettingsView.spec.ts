import { AppEvents } from '@grafana/data';
import { DEFAULT_SETTINGS } from '@shared/infrastructure/settings/PluginSettings';
import { act, renderHook } from '@testing-library/react';

import { useUISettingsView } from '../../domain/useUISettingsView';
import plugin from './fixtures/plugin.json';

// appEvents dependency
const appEvents = {
  publish: jest.fn(),
};

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getAppEvents: () => appEvents,
}));

// reportInteraction dependency
jest.mock('@shared/domain/reportInteraction', () => ({
  reportInteraction: jest.fn(),
}));

// useFetchPluginSettings dependency
const mutate = jest.fn();

jest.mock('@shared/infrastructure/settings/useFetchPluginSettings', () => ({
  useFetchPluginSettings: () => ({
    settings: DEFAULT_SETTINGS,
    error: null,
    mutate,
  }),
}));

const setMaxNodes = jest.fn();

jest.mock('@shared/domain/url-params/useMaxNodesFromUrl', () => ({
  useMaxNodesFromUrl: () => [, setMaxNodes],
}));

// useHistory dependency
jest.mock('react-router-dom', () => ({
  useLocation: () => ({
    state: {
      referrer: 'http://unit.test/pass',
    },
  }),
  useNavigate: () => jest.fn(),
}));

// tests
describe('useUISettingsView(plugin)', () => {
  it('returns an object with "data" and "actions" fields', () => {
    // @ts-expect-error
    const { result } = renderHook(() => useUISettingsView(plugin));

    expect(result.current).toEqual({
      data: { ...DEFAULT_SETTINGS, fetchError: null },
      actions: {
        toggleCollapsedFlamegraphs: expect.any(Function),
        updateMaxNodes: expect.any(Function),
        toggleEnableFlameGraphDotComExport: expect.any(Function),
        toggleEnableFunctionDetails: expect.any(Function),
        toggleEnableMetricsFromProfiles: expect.any(Function),
        saveSettings: expect.any(Function),
      },
    });
  });

  describe('actions.toggleCollapsedFlamegraphs()', () => {
    it('toggles the value of data.collapsedFlamegraphs', () => {
      // @ts-expect-error
      const { result } = renderHook(() => useUISettingsView(plugin));

      const { data, actions } = result.current;

      expect(data.collapsedFlamegraphs).toBe(DEFAULT_SETTINGS.collapsedFlamegraphs);

      act(() => {
        actions.toggleCollapsedFlamegraphs();
      });

      expect(result.current.data.collapsedFlamegraphs).toBe(true);
    });
  });

  describe('actions.updateMaxNodes(event)', () => {
    it('updates the value of data.maxNodes', () => {
      // @ts-expect-error
      const { result } = renderHook(() => useUISettingsView(plugin));

      const { data, actions } = result.current;

      expect(data.maxNodes).toBe(DEFAULT_SETTINGS.maxNodes);

      act(() => {
        actions.updateMaxNodes({ target: { value: '42' } } as React.ChangeEvent<HTMLInputElement>);
      });

      expect(result.current.data.maxNodes).toBe(42);
    });
  });

  describe('actions.toggleEnableFlameGraphDotComExport()', () => {
    it('toggles the value of data.enableFlameGraphDotComExport', () => {
      // @ts-expect-error
      const { result } = renderHook(() => useUISettingsView(plugin));

      const { data, actions } = result.current;

      expect(data.enableFlameGraphDotComExport).toBe(DEFAULT_SETTINGS.enableFlameGraphDotComExport);

      act(() => {
        actions.toggleEnableFlameGraphDotComExport();
      });

      expect(result.current.data.enableFlameGraphDotComExport).toBe(false);
    });
  });

  describe('actions.toggleEnableFunctionDetails()', () => {
    it('toggles the value of data.toggleEnableFunctionDetails', () => {
      // @ts-expect-error
      const { result } = renderHook(() => useUISettingsView(plugin));

      const { data, actions } = result.current;

      expect(data.enableFunctionDetails).toBe(DEFAULT_SETTINGS.enableFunctionDetails);

      act(() => {
        actions.toggleEnableFunctionDetails();
      });

      expect(result.current.data.enableFunctionDetails).toBe(false);
    });
  });

  describe('actions.saveSettings()', () => {
    it('stores the plugin settings & updates the URL search param', async () => {
      // @ts-expect-error
      const { result } = renderHook(() => useUISettingsView(plugin));

      const { saveSettings } = result.current.actions;

      await saveSettings();

      expect(mutate).toHaveBeenCalledWith(DEFAULT_SETTINGS);
      expect(setMaxNodes).toHaveBeenCalledWith(DEFAULT_SETTINGS.maxNodes);
    });

    describe('if no error occurred when storing the settings', () => {
      it(`publishes an "${AppEvents.alertSuccess.name}" application event`, async () => {
        mutate.mockResolvedValue({ ok: true });

        // @ts-expect-error
        const { result } = renderHook(() => useUISettingsView(plugin));

        const { saveSettings } = result.current.actions;

        await saveSettings();

        expect(appEvents.publish).toHaveBeenCalledWith({
          type: AppEvents.alertSuccess.name,
          payload: ['Plugin settings successfully saved!'],
        });
      });
    });

    describe('if an error occurred when storing the settings', () => {
      it(`publishes an "${AppEvents.alertError.name}" application event`, async () => {
        const updateError = new Error('Ooops! settingsApiClient.update error.');
        mutate.mockRejectedValue(updateError);

        // prevent console noise in the output
        jest.spyOn(console, 'error').mockImplementation(() => {});

        // @ts-expect-error
        const { result } = renderHook(() => useUISettingsView(plugin));

        const { saveSettings } = result.current.actions;

        await saveSettings();

        expect(appEvents.publish).toHaveBeenCalledWith({
          type: AppEvents.alertError.name,
          payload: ['Error while saving the plugin settings!', 'Please try again later, sorry for the inconvenience.'],
        });
      });
    });
  });
});
