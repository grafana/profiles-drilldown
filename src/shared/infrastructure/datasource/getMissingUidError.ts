import { t } from '@grafana/i18n';

export function getMissingUidError() {
  return new Error(t('datasource-context.missing-uid', 'No datasource UID was selected.'));
}
