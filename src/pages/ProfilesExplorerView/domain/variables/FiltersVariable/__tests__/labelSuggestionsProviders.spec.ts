import {
  AdHocFiltersVariable,
  AdHocFilterWithLabels,
  ConstantVariable,
  EmbeddedScene,
  SceneCanvasText,
  SceneTimeRange,
  SceneVariableSet,
} from '@grafana/scenes';
import { labelsRepository } from '@shared/infrastructure/labels/labelsRepository';
import { DATA_SOURCE_VARIABLE, PROFILE_METRIC_VARIABLE } from 'src/constants';

import { LabelsApiClient } from '../../../../infrastructure/labels/http/LabelsApiClient';
import { getTagKeysProvider, getTagValuesProvider } from '../labelSuggestionsProviders';

jest.mock('@shared/infrastructure/labels/labelsRepository', () => ({
  labelsRepository: { setApiClient: jest.fn(), listLabels: jest.fn(), listLabelValues: jest.fn() },
}));
jest.mock('../../../../infrastructure/labels/http/LabelsApiClient', () => ({ LabelsApiClient: jest.fn() }));
jest.mock('@shared/infrastructure/tracking/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../../../components/SceneProfilesExplorer/SceneProfilesExplorer', () => ({
  SceneProfilesExplorer: jest.fn(),
}));

function setup({ dataSource = 'ds-uid', filters = [] as AdHocFilterWithLabels[] } = {}) {
  const variable = new AdHocFiltersVariable({ name: 'filtersAllServices', filters });

  const scene = new EmbeddedScene({
    $timeRange: new SceneTimeRange({ from: '2024-03-13T18:00:00.000Z', to: '2024-03-13T18:50:00.000Z' }),
    $variables: new SceneVariableSet({
      variables: [
        new ConstantVariable({ name: DATA_SOURCE_VARIABLE, value: dataSource }),
        new ConstantVariable({ name: PROFILE_METRIC_VARIABLE, value: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds' }),
        variable,
      ],
    }),
    body: new SceneCanvasText({ text: '' }),
  });

  return { variable, scene };
}

describe('labelSuggestionsProviders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should request label names from the selected data source', async () => {
    jest.mocked(labelsRepository.listLabels).mockResolvedValue([]);
    const { variable } = setup({ dataSource: 'selected-pyroscope' });

    await getTagKeysProvider(variable, null);

    expect(LabelsApiClient).toHaveBeenCalledTimes(1);
    expect(LabelsApiClient).toHaveBeenCalledWith({ dataSourceUid: 'selected-pyroscope' });
    expect(labelsRepository.setApiClient).toHaveBeenCalledTimes(1);
    expect(labelsRepository.listLabels).toHaveBeenCalledTimes(1);
    expect(labelsRepository.listLabelValues).not.toHaveBeenCalled();
  });

  it('should scope label names to the profile type and the other filters', async () => {
    jest.mocked(labelsRepository.listLabels).mockResolvedValue([]);
    const { variable } = setup({ filters: [{ key: 'region', operator: '=', value: 'eu-north' }] });

    await getTagKeysProvider(variable, null);

    expect(labelsRepository.listLabels).toHaveBeenCalledWith({
      query: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{region="eu-north"}',
      from: 1710352800000,
      to: 1710355800000,
    });
  });

  it('should ignore filters on the edited key when loading label values', async () => {
    jest.mocked(labelsRepository.listLabelValues).mockResolvedValue([]);
    const { variable } = setup({
      filters: [
        { key: 'region', operator: '=', value: 'eu-north' },
        { key: 'region', operator: '!=', value: 'us-east' },
        { key: 'cluster', operator: '=', value: 'cluster-eu-west1' },
      ],
    });

    await getTagValuesProvider(variable, { key: 'region', operator: '=', value: '' });

    expect(labelsRepository.listLabelValues).toHaveBeenCalledTimes(1);
    expect(labelsRepository.listLabelValues).toHaveBeenCalledWith({
      label: 'region',
      query: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{cluster="cluster-eu-west1"}',
      from: 1710352800000,
      to: 1710355800000,
    });
    expect(labelsRepository.listLabels).not.toHaveBeenCalled();
  });

  it('should replace the default suggestions with Pyroscope labels', async () => {
    jest.mocked(labelsRepository.listLabels).mockResolvedValue([{ label: 'Region', value: 'region' }]);
    const { variable } = setup();

    await expect(getTagKeysProvider(variable, null)).resolves.toEqual({
      replace: true,
      values: [{ text: 'Region', value: 'region' }],
    });
  });

  it('should reject when the label lookup fails', async () => {
    jest.mocked(labelsRepository.listLabels).mockRejectedValue(new Error('Not found'));
    const { variable } = setup();

    await expect(getTagKeysProvider(variable, null)).rejects.toThrow('Not found');

    expect(labelsRepository.listLabels).toHaveBeenCalledTimes(1);
  });

  it('should reject without calling the API when no data source is selected', async () => {
    const { variable } = setup({ dataSource: '' });
    // The async wrapper handles both the synchronous provider in step 2
    // and an async provider, if required by the installed Scenes types.
    await expect((async () => getTagKeysProvider(variable, null))()).rejects.toThrow(
      'Cannot load label suggestions: no data source selected!'
    );

    expect(LabelsApiClient).not.toHaveBeenCalled();
    expect(labelsRepository.setApiClient).not.toHaveBeenCalled();
    expect(labelsRepository.listLabels).not.toHaveBeenCalled();
    expect(labelsRepository.listLabelValues).not.toHaveBeenCalled();
  });
});
