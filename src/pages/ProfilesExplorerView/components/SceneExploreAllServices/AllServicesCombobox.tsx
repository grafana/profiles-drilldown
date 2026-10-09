import { t } from '@grafana/i18n';
import { AdHocFiltersVariable, sceneGraph } from '@grafana/scenes';
import { Combobox, ComboboxOption } from '@grafana/ui';
import { CompleteFilters, FilterKind, Suggestion } from '@shared/components/QueryBuilder/domain/types';
import { QueryBuilder } from '@shared/components/QueryBuilder/QueryBuilder';
import { Chiclet } from '@shared/components/QueryBuilder/ui/chiclets/Chiclet';
import { LabelsRepository } from '@shared/infrastructure/labels/labelsRepository';
import { MemoryCacheClient } from '@shared/infrastructure/MemoryCacheClient';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { convertPyroscopeToVariableFilter } from '../../domain/variables/FiltersVariable/filters-ops';
import { LabelsApiClient } from '../../infrastructure/labels/http/LabelsApiClient';
import { SceneQuickFilter } from '../SceneByVariableRepeaterGrid/components/SceneQuickFilter';

interface Props {
  model: AdHocFiltersVariable;
  dataSourceUid: string;
  query: string;
  from: number;
  to: number;
}

export function AllServicesCombobox(props: Props) {
  const { model, dataSourceUid, query, from, to } = props;
  const quickFilter = sceneGraph.findByKeyAndType(model, 'quick-filter', SceneQuickFilter);
  const { searchText } = quickFilter.useState();
  const committedSearch = useRef(searchText);
  const [, refreshChips] = useState(0);
  const preview = useRef<string>();
  if (preview.current !== searchText) {
    committedSearch.current = searchText;
  }
  const labelsRepository = useMemo(
    () =>
      new LabelsRepository({
        apiClient: new LabelsApiClient({ dataSourceUid }),
        cacheClient: new MemoryCacheClient(),
      }),
    [dataSourceUid]
  );
  const restoreSearch = () => {
    preview.current = undefined;
    quickFilter.setState({ searchText: committedSearch.current });
    refreshChips((revision) => revision + 1);
  };
  const onQueryChange = (_query: string, filters: CompleteFilters) => {
    model.setState({ filters: filters.map(convertPyroscopeToVariableFilter) });
  };
  const services = committedSearch.current.split(',').filter(Boolean);

  return (
    <QueryBuilder
      id="query-builder-filtersAllServices"
      autoExecute
      dataSourceUid={dataSourceUid}
      query={query}
      from={from}
      to={to}
      onChangeQuery={onQueryChange}
      leadingFilters={services.map((service, index) => (
        <React.Fragment key={`${index}:${service}`}>
          {index > 0 && <span>{t('all-services.filter.or', 'OR')}</span>}
          <Chiclet
            filter={{
              id: `service:${index}`,
              type: FilterKind['attribute-operator-value'],
              active: true,
              attribute: { value: 'service_name', label: t('all-services.filter.service-name', 'service_name') },
              operator: { value: '=~', label: '=~' },
              value: { value: service, label: service },
            }}
            onClick={() => {}}
            onRemove={() => {
              committedSearch.current = committedSearch.current
                .split(',')
                .filter(Boolean)
                .filter((_, serviceIndex) => serviceIndex !== index)
                .join(',');
              restoreSearch();
            }}
          />
        </React.Fragment>
      ))}
      renderLabelInput={(onSelectLabel) => (
        <CombinedFilterInput
          labelsRepository={labelsRepository}
          query={query}
          from={from}
          to={to}
          onSelectLabel={(label) => {
            restoreSearch();
            onSelectLabel(label);
          }}
          onSelectService={(service) => {
            committedSearch.current = [committedSearch.current, service].filter(Boolean).join(',');
            restoreSearch();
          }}
          onPreview={(input) => {
            preview.current = [committedSearch.current, input].filter(Boolean).join(',');
            quickFilter.setState({ searchText: preview.current });
          }}
          onCancel={restoreSearch}
        />
      )}
    />
  );
}

interface InputProps {
  labelsRepository: LabelsRepository;
  query: string;
  from: number;
  to: number;
  onSelectLabel: (label: Suggestion) => void;
  onSelectService: (service: string) => void;
  onPreview: (input: string) => void;
  onCancel: () => void;
}

function CombinedFilterInput({
  labelsRepository,
  query,
  from,
  to,
  onSelectLabel,
  onSelectService,
  onPreview,
  onCancel,
}: InputProps) {
  const input = useRef('');
  const navigated = useRef(false);
  const [revision, setRevision] = useState(0);
  const labelGroup = t('all-services.filter.label-names-group', 'Label names');
  const serviceGroup = t('all-services.filter.service-name-group', 'Service name filter');
  const options = useCallback(
    async (text: string): Promise<Array<ComboboxOption<string>>> => {
      const labels = await labelsRepository.listLabels({ query, from, to });
      const matches: Array<ComboboxOption<string>> = labels
        .filter((label) => label.label.toLowerCase().includes(text.toLowerCase()))
        .map((label) => ({ value: `label:${label.value}`, label: label.label, group: labelGroup, icon: 'tag-alt' }));
      if (!text) {
        return matches;
      }
      const serviceOption: ComboboxOption<string> = {
        value: `service:${text}`,
        label: text,
        group: serviceGroup,
        icon: 'search',
      };
      // Combobox highlights the first option. Keep that visible choice aligned with Enter:
      // an exact label match wins, otherwise the service-name filter wins.
      const exactLabel = matches.find((option) => option.value === `label:${text}`);
      return exactLabel
        ? [exactLabel, ...matches.filter((option) => option !== exactLabel), serviceOption]
        : [serviceOption, ...matches];
    },
    [labelsRepository, query, from, to, labelGroup, serviceGroup]
  );
  const select = (option: ComboboxOption<string>) => {
    input.current = '';
    navigated.current = false;
    if (option.value.startsWith('label:')) {
      const label = option.value.slice('label:'.length);
      onSelectLabel({ value: label, label });
    } else {
      onSelectService(option.value.slice('service:'.length));
      setRevision((current) => current + 1);
    }
  };

  return (
    <div
      style={{ width: '100%' }}
      onChangeCapture={(event: React.ChangeEvent<HTMLInputElement>) => {
        input.current = event.target.value;
        navigated.current = false;
        onPreview(input.current);
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          navigated.current = true;
        }
        if (event.key === 'Enter' && input.current && !navigated.current) {
          event.preventDefault();
          event.stopPropagation();
          const text = input.current;
          void options(text)
            .catch(() => [])
            .then((suggestions) => {
              if (input.current === text) {
                select(suggestions.find((option) => option.value === `label:${text}`) ?? { value: `service:${text}` });
              }
            });
        }
        if (event.key === 'Escape') {
          input.current = '';
          onCancel();
          setRevision((current) => current + 1);
        }
      }}
    >
      <label
        htmlFor="all-services-filter"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}
      >
        {t('all-services.filter.accessible-label', 'Search services or add label filters')}
      </label>
      <Combobox
        key={revision}
        id="all-services-filter"
        value={null}
        options={options}
        onChange={select}
        placeholder={t('all-services.filter.placeholder', 'Search services or add label filters')}
        prefixIcon="search"
      />
    </div>
  );
}
