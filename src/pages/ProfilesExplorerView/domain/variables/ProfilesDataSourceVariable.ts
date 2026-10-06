import { t } from '@grafana/i18n';
import { getDataSourceSrv } from '@grafana/runtime';
import { DataSourceVariable, VariableGetOptionsArgs, VariableValueOption } from '@grafana/scenes';
import { ApiClient } from '@shared/infrastructure/http/ApiClient';
import { userStorage } from '@shared/infrastructure/userStorage';
import { map, Observable } from 'rxjs';

const DATA_SOURCE_LABEL_DEFAULT = 'Data source';

const FAKE_PROFILES_DATA_SOURCE_PLUGIN_ID = 'prometheus';

export class ProfilesDataSourceVariable extends DataSourceVariable {
  constructor({ initialDS }: { initialDS?: string }) {
    super({
      pluginId: 'grafana-pyroscope-datasource',
      key: 'dataSource',
      name: 'dataSource',
      // English fallback until `onActivate` — embedded exploration constructs variables before i18n is ready.
      label: DATA_SOURCE_LABEL_DEFAULT,
      skipUrlSync: true,
      // DEMO HACK: default to the fake (Prometheus) data source instead of the real Pyroscope one, so a demo
      // recording doesn't need to click the picker. Remove this fallback once the demo is done.
      value:
        initialDS ??
        getDataSourceSrv().getList({ pluginId: FAKE_PROFILES_DATA_SOURCE_PLUGIN_ID })[0]?.uid ??
        ApiClient.selectDefaultDataSource().uid,
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    this.setState({
      skipUrlSync: false,
      label: t('variables.data-source.label', DATA_SOURCE_LABEL_DEFAULT),
    });

    this.subscribeToState((newState, prevState) => {
      if (newState.value && newState.value !== prevState.value) {
        const storage = userStorage.get(userStorage.KEYS.PROFILES_EXPLORER) || {};
        storage.dataSource = newState.value;
        userStorage.set(userStorage.KEYS.PROFILES_EXPLORER, storage);
      }
    });
  }

  getValueOptions(args: VariableGetOptionsArgs): Observable<VariableValueOption[]> {
    return super.getValueOptions(args).pipe(
      map((pyroscopeOptions) => {
        const prometheusOptions = getDataSourceSrv()
          .getList({ metrics: true, variables: false, pluginId: FAKE_PROFILES_DATA_SOURCE_PLUGIN_ID })
          .map((source) => ({ label: `${source.name} (FIUYFI)`, value: source.uid }));

        return [...pyroscopeOptions, ...prometheusOptions];
      })
    );
  }
}
