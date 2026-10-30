import { type DataSourceInstanceListItem, type DataSourceInstanceSettings } from '@grafana/data';
import {
  getDataSourceInstanceList,
  getDataSourceInstanceSettings,
  getDefaultDataSourceInstanceListItem,
} from '@grafana/plugin-compat/datasources';

import { getTempoDataSourceOptions, selectTempoDataSourceUid, TempoDataSourceJsonData } from '../domain/tempo';

jest.mock('@grafana/plugin-compat/datasources', () => ({
  getDataSourceInstanceList: jest.fn(),
  getDataSourceInstanceSettings: jest.fn(),
  getDefaultDataSourceInstanceListItem: jest.fn(),
}));

jest.mock('@shared/infrastructure/tracking/logger', () => ({
  logger: { debug: jest.fn() },
}));

const getDataSourceInstanceListMock = jest.mocked(getDataSourceInstanceList);
const getDataSourceInstanceSettingsMock = jest.mocked(getDataSourceInstanceSettings);
const getDefaultDataSourceInstanceListItemMock = jest.mocked(getDefaultDataSourceInstanceListItem);

describe('selectTempoDataSourceUid', () => {
  it('should keep the current selection ahead of linked and default data sources', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'abc', name: 'prod-traces', tracesToProfilesDataSourceUid: 'prod-profiles' },
          { uid: 'def', name: 'dev-traces' },
          { uid: 'default', name: 'staging-traces', isDefault: true },
        ],
        'def',
        'prod-profiles'
      )
    ).toBe('def');
  });

  it('should select the unique linked data source when the current selection is unavailable', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'default', name: 'staging-traces', isDefault: true },
          { uid: 'abc', name: 'prod-traces', tracesToProfilesDataSourceUid: 'prod-profiles' },
        ],
        'ghi',
        'prod-profiles'
      )
    ).toBe('abc');
  });

  it('should select the data source linked to the current profiles data source without a current selection', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'abc', name: 'prod-traces', tracesToProfilesDataSourceUid: 'prod-profiles' },
          { uid: 'def', name: 'dev-traces', tracesToProfilesDataSourceUid: 'dev-profiles' },
        ],
        undefined,
        'dev-profiles'
      )
    ).toBe('def');
  });

  it('should select the default data source when the current selection and profile link do not match', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'abc', name: 'prod-traces', tracesToProfilesDataSourceUid: 'prod-profiles' },
          { uid: 'default', name: 'staging-traces', isDefault: true },
        ],
        'ghi',
        'dev-profiles'
      )
    ).toBe('default');
  });

  it('should select the only data source when no preferred source matches', () => {
    expect(selectTempoDataSourceUid([{ uid: 'abc', name: 'prod-traces' }], 'ghi', 'dev-profiles')).toBe('abc');
  });

  it('should return undefined when no data sources are available', () => {
    expect(selectTempoDataSourceUid([])).toBeUndefined();
  });

  it('should return undefined when multiple data sources have no preferred match', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'abc', name: 'prod-traces' },
          { uid: 'def', name: 'dev-traces' },
        ],
        'ghi',
        'prod-profiles'
      )
    ).toBeUndefined();
  });

  it('should return undefined when multiple data sources link to the current profiles data source without a default', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'abc', name: 'prod-traces', tracesToProfilesDataSourceUid: 'prod-profiles' },
          { uid: 'def', name: 'dev-traces', tracesToProfilesDataSourceUid: 'prod-profiles' },
        ],
        undefined,
        'prod-profiles'
      )
    ).toBeUndefined();
  });

  it('should select the default when multiple data sources link to the current profiles data source', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'abc', name: 'prod-traces', tracesToProfilesDataSourceUid: 'prod-profiles' },
          { uid: 'def', name: 'dev-traces', tracesToProfilesDataSourceUid: 'prod-profiles' },
          { uid: 'default', name: 'staging-traces', isDefault: true },
        ],
        undefined,
        'prod-profiles'
      )
    ).toBe('default');
  });

  it('should select the default instead of an unlinked data source when the profiles data source UID is omitted', () => {
    expect(
      selectTempoDataSourceUid([
        { uid: 'abc', name: 'prod-traces' },
        {
          uid: 'default',
          name: 'staging-traces',
          isDefault: true,
          tracesToProfilesDataSourceUid: 'prod-profiles',
        },
      ])
    ).toBe('default');
  });
});

describe('getTempoDataSourceOptions', () => {
  const prod = { uid: 'prod', name: 'prod-traces' } as DataSourceInstanceListItem;
  const dev = { uid: 'dev', name: 'dev-traces' } as DataSourceInstanceListItem;
  const prodSettings = {
    ...prod,
    jsonData: { tracesToProfiles: { datasourceUid: 'prod-profiles' } },
  } as DataSourceInstanceSettings<TempoDataSourceJsonData>;
  const devSettings = { ...dev, jsonData: {} } as DataSourceInstanceSettings<TempoDataSourceJsonData>;

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    getDataSourceInstanceListMock.mockResolvedValue([]);
    getDataSourceInstanceSettingsMock.mockResolvedValue(undefined);
    getDefaultDataSourceInstanceListItemMock.mockResolvedValue(undefined);
  });

  it('should return no options when no Tempo data sources exist', async () => {
    const result = await getTempoDataSourceOptions();

    expect(result).toEqual([]);
    expect(getDataSourceInstanceListMock).toHaveBeenCalledWith({ pluginId: 'tempo' });
    expect(getDataSourceInstanceSettingsMock).not.toHaveBeenCalled();
  });

  it('should map settings and mark only the default data source', async () => {
    getDataSourceInstanceListMock.mockResolvedValue([prod, dev]);
    getDataSourceInstanceSettingsMock
      .mockResolvedValueOnce({ ...prodSettings, name: 'renamed-traces' })
      .mockResolvedValueOnce(devSettings);
    getDefaultDataSourceInstanceListItemMock.mockResolvedValue(dev);

    const result = await getTempoDataSourceOptions();

    expect(result).toEqual([
      {
        uid: 'prod',
        name: 'renamed-traces',
        isDefault: false,
        tracesToProfilesDataSourceUid: 'prod-profiles',
      },
      { uid: 'dev', name: 'dev-traces', isDefault: true, tracesToProfilesDataSourceUid: undefined },
    ]);
    expect(getDataSourceInstanceSettingsMock).toHaveBeenNthCalledWith(1, 'prod');
    expect(getDataSourceInstanceSettingsMock).toHaveBeenNthCalledWith(2, 'dev');
    expect(getDefaultDataSourceInstanceListItemMock).toHaveBeenCalledWith([
      { uid: 'prod', name: 'prod-traces' },
      { uid: 'dev', name: 'dev-traces' },
    ]);
  });

  it('should set the default to false when no default data source exists', async () => {
    getDataSourceInstanceListMock.mockResolvedValue([dev]);
    getDataSourceInstanceSettingsMock.mockResolvedValue(devSettings);

    const result = await getTempoDataSourceOptions();

    expect(result).toEqual([
      { uid: 'dev', name: 'dev-traces', isDefault: false, tracesToProfilesDataSourceUid: undefined },
    ]);
  });

  it('should skip data sources whose settings are unavailable', async () => {
    getDataSourceInstanceListMock.mockResolvedValue([prod, dev]);
    getDataSourceInstanceSettingsMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(devSettings);

    const result = await getTempoDataSourceOptions();

    expect(result).toEqual([{ uid: 'dev', name: 'dev-traces', isDefault: false }]);
  });

  it('should return undefined when another settings lookup fails', async () => {
    getDataSourceInstanceListMock.mockResolvedValue([prod, dev]);
    getDataSourceInstanceSettingsMock
      .mockRejectedValueOnce(new Error('Settings lookup failed'))
      .mockResolvedValueOnce(devSettings);

    const result = await getTempoDataSourceOptions();

    expect(result).toBeUndefined();
  });

  it('should return undefined when listing data sources fails', async () => {
    getDataSourceInstanceListMock.mockRejectedValue(new Error('Listing failed'));

    const result = await getTempoDataSourceOptions();

    expect(result).toBeUndefined();
    expect(getDataSourceInstanceSettingsMock).not.toHaveBeenCalled();
    expect(getDefaultDataSourceInstanceListItemMock).not.toHaveBeenCalled();
  });

  it('should return options even if the default lookup fails', async () => {
    getDataSourceInstanceListMock.mockResolvedValue([dev]);
    getDataSourceInstanceSettingsMock.mockResolvedValue(devSettings);
    getDefaultDataSourceInstanceListItemMock.mockRejectedValue(new Error('Default lookup failed'));

    const result = await getTempoDataSourceOptions();

    expect(result).toEqual([{ isDefault: false, name: 'dev-traces', uid: 'dev' }]);
  });

  it('should share a pending data source list between concurrent callers', async () => {
    const list = deferred<DataSourceInstanceListItem[]>();
    getDataSourceInstanceListMock.mockReturnValueOnce(list.promise);

    const pending = Promise.all([getTempoDataSourceOptions(), getTempoDataSourceOptions()]);
    list.resolve([]);

    const results = await pending;
    expect(results).toEqual([[], []]);

    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(1);
    expect(getDefaultDataSourceInstanceListItemMock).toHaveBeenCalledTimes(1);
  });

  it('should fetch fresh options after a successful request completes', async () => {
    getDataSourceInstanceListMock.mockResolvedValueOnce([prod]).mockResolvedValueOnce([dev]);
    getDataSourceInstanceSettingsMock.mockResolvedValueOnce(prodSettings).mockResolvedValueOnce(devSettings);

    let result = await getTempoDataSourceOptions();

    expect(result).toEqual([
      { uid: 'prod', name: 'prod-traces', tracesToProfilesDataSourceUid: 'prod-profiles', isDefault: false },
    ]);

    result = await getTempoDataSourceOptions();

    expect(result).toEqual([{ uid: 'dev', name: 'dev-traces', isDefault: false }]);
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(2);
  });

  it('should share a failure between concurrent callers and allow a fresh request', async () => {
    getDataSourceInstanceListMock.mockRejectedValueOnce(new Error('Listing failed')).mockResolvedValueOnce([dev]);
    getDataSourceInstanceSettingsMock.mockResolvedValue(devSettings);

    const concurrent = await Promise.all([getTempoDataSourceOptions(), getTempoDataSourceOptions()]);

    expect(concurrent).toEqual([undefined, undefined]);
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(1);

    const afterFailure = await getTempoDataSourceOptions();

    expect(afterFailure).toEqual([{ uid: 'dev', name: 'dev-traces', isDefault: false }]);
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(2);
  });
});
