import { type DataSourceInstanceSettings } from '@grafana/data';
import {
  getDataSourceInstanceList,
  getDataSourceInstanceSettings,
  getDefaultDataSourceInstanceListItem,
} from '@grafana/plugin-compat/datasources';

import { PYROSCOPE_DATA_SOURCE_PLUGIN_ID, TEMPO_DATA_SOURCE_PLUGIN_ID } from '../../../../constants';
import { logger } from '../../tracking/logger';
import { getSettingsAndDefault } from '../datasources';

jest.mock('@grafana/plugin-compat/datasources', () => ({
  getDataSourceInstanceList: jest.fn(),
  getDataSourceInstanceSettings: jest.fn(),
  getDefaultDataSourceInstanceListItem: jest.fn(),
}));

jest.mock('../../tracking/logger', () => ({
  logger: { error: jest.fn() },
}));

const instances = [{ uid: 'first' }, { uid: 'second' }];
const settings = [
  { uid: 'first', jsonData: { overridesDefault: true } },
  { uid: 'second', jsonData: {} },
] as DataSourceInstanceSettings[];

const getDataSourceInstanceListMock = jest.mocked(getDataSourceInstanceList);
const getDataSourceInstanceSettingsMock = jest.mocked(getDataSourceInstanceSettings);
const getDefaultDataSourceInstanceListItemMock = jest.mocked(getDefaultDataSourceInstanceListItem);

describe('getSettingsAndDefault', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getDataSourceInstanceListMock.mockResolvedValue([{ uid: 'first' }, { uid: 'second' }]);
    getDefaultDataSourceInstanceListItemMock.mockResolvedValue({ uid: 'second' });
    getDataSourceInstanceSettingsMock.mockImplementation(async (uid) =>
      settings.find((dataSource) => dataSource.uid === uid)
    );
  });

  it.each([PYROSCOPE_DATA_SOURCE_PLUGIN_ID, TEMPO_DATA_SOURCE_PLUGIN_ID] as const)(
    'should return settings and the default UID for %s',
    async (pluginId) => {
      await expect(getSettingsAndDefault<DataSourceInstanceSettings[]>(pluginId)).resolves.toEqual({
        settings: [
          { uid: 'first', jsonData: { overridesDefault: true } },
          { uid: 'second', jsonData: {} },
        ],
        defaultUid: 'second',
      });

      expect(getDataSourceInstanceListMock).toHaveBeenCalledWith({ pluginId });
      expect(getDefaultDataSourceInstanceListItemMock).toHaveBeenCalledWith([{ uid: 'first' }, { uid: 'second' }]);
      expect(getDataSourceInstanceSettingsMock).toHaveBeenCalledTimes(2);
      expect(getDataSourceInstanceSettingsMock).toHaveBeenNthCalledWith(1, 'first');
      expect(getDataSourceInstanceSettingsMock).toHaveBeenNthCalledWith(2, 'second');
    }
  );

  it('should return an undefined UID when there is no default data source', async () => {
    getDefaultDataSourceInstanceListItemMock.mockResolvedValue(undefined);

    await expect(getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID)).resolves.toEqual({
      settings: [
        { uid: 'first', jsonData: { overridesDefault: true } },
        { uid: 'second', jsonData: {} },
      ],
      defaultUid: undefined,
    });
  });

  it('should return empty settings when there are no data sources', async () => {
    getDataSourceInstanceListMock.mockResolvedValue([]);
    getDefaultDataSourceInstanceListItemMock.mockResolvedValue(undefined);

    await expect(getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID)).resolves.toEqual({
      settings: [],
      defaultUid: undefined,
    });
    expect(getDefaultDataSourceInstanceListItemMock).toHaveBeenCalledWith([]);
    expect(getDataSourceInstanceSettingsMock).not.toHaveBeenCalled();
  });

  it('should filter out missing data source settings', async () => {
    getDataSourceInstanceSettingsMock.mockResolvedValueOnce(undefined);

    await expect(getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID)).resolves.toEqual({
      settings: [{ uid: 'second', jsonData: {} }],
      defaultUid: 'second',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should keep successfully loaded data sources and log settings errors', async () => {
    const error = new Error('Failed to load settings');
    getDataSourceInstanceSettingsMock.mockRejectedValueOnce(error);

    await expect(getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID)).resolves.toEqual({
      settings: [{ uid: 'second', jsonData: {} }],
      defaultUid: 'second',
    });
    expect(logger.error).toHaveBeenCalledWith(error, {
      message: 'Failed to get settings for the datasource: first',
    });
  });

  it('should share the pending request between concurrent calls for the same plugin', async () => {
    const results = await Promise.all([
      getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID),
      getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID),
    ]);

    expect(results).toEqual([
      { settings, defaultUid: 'second' },
      { settings, defaultUid: 'second' },
    ]);
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(1);
    expect(getDefaultDataSourceInstanceListItemMock).toHaveBeenCalledTimes(1);
    expect(getDataSourceInstanceSettingsMock).toHaveBeenCalledTimes(2);
  });

  it('should keep concurrent requests for different plugins separate', async () => {
    getDataSourceInstanceListMock.mockResolvedValueOnce([{ uid: 'first' }]).mockResolvedValueOnce([{ uid: 'second' }]);
    getDefaultDataSourceInstanceListItemMock.mockImplementation(async (items) => items[0]);

    const results = await Promise.all([
      getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID),
      getSettingsAndDefault(TEMPO_DATA_SOURCE_PLUGIN_ID),
    ]);

    expect(results).toEqual([
      { settings: [{ uid: 'first', jsonData: { overridesDefault: true } }], defaultUid: 'first' },
      { settings: [{ uid: 'second', jsonData: {} }], defaultUid: 'second' },
    ]);
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(2);
    expect(getDataSourceInstanceListMock).toHaveBeenCalledWith({ pluginId: PYROSCOPE_DATA_SOURCE_PLUGIN_ID });
    expect(getDataSourceInstanceListMock).toHaveBeenCalledWith({ pluginId: TEMPO_DATA_SOURCE_PLUGIN_ID });
  });

  it('should load fresh settings after a successful request completes', async () => {
    await getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID);
    getDataSourceInstanceListMock.mockResolvedValue([instances[1]]);

    await expect(getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID)).resolves.toEqual({
      settings: [{ uid: 'second', jsonData: {} }],
      defaultUid: 'second',
    });
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['data source listing', getDataSourceInstanceListMock],
    ['default selection', getDefaultDataSourceInstanceListItemMock],
  ])('should propagate errors and retry after %s fails', async (_, load) => {
    const error = new Error('Failed to load data sources');
    load.mockRejectedValueOnce(error);

    await expect(getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID)).rejects.toBe(error);
    expect(getDataSourceInstanceSettingsMock).not.toHaveBeenCalled();

    await expect(getSettingsAndDefault(PYROSCOPE_DATA_SOURCE_PLUGIN_ID)).resolves.toEqual({
      defaultUid: 'second',
      settings: [
        {
          jsonData: {
            overridesDefault: true,
          },
          uid: 'first',
        },
        {
          jsonData: {},
          uid: 'second',
        },
      ],
    });
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(2);
    expect(getDataSourceInstanceSettingsMock).toHaveBeenCalledTimes(2);
  });
});
