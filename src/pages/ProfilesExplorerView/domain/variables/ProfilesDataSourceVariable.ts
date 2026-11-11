import { t } from '@grafana/i18n';
import { DataSourceVariable } from '@grafana/scenes';
import { userStorage } from '@shared/infrastructure/userStorage';

const DATA_SOURCE_LABEL_DEFAULT = 'Data source';

export class ProfilesDataSourceVariable extends DataSourceVariable {
  constructor({ initialDS }: { initialDS?: string }) {
    super({
      pluginId: 'grafana-pyroscope-datasource',
      key: 'dataSource',
      name: 'dataSource',
      // English fallback until `onActivate` — embedded exploration constructs variables before i18n is ready.
      label: DATA_SOURCE_LABEL_DEFAULT,
      skipUrlSync: true,
      // we ensure that we'll always have the expected default data source (when the "var-dataSource" URL search param is missing, incorrect, etc.)
      value: initialDS,
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
}
