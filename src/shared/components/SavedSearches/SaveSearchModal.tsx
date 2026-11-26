import { css } from '@emotion/css';
import { AppEvents, GrafanaTheme2 } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { getAppEvents, reportInteraction } from '@grafana/runtime';
import { SceneObject } from '@grafana/scenes';
import { Alert, Box, Button, Field, Input, Modal, Stack, useStyles2 } from '@grafana/ui';
import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { useCheckForExistingSearch, useSavedSearches } from './saveSearch';
import { filtersToLabelSelectorExpression, getFiltersVariable, getProfilesExplorerScene } from './utils';

interface Props {
  dsUid: string;
  onClose(): void;
  sceneRef: SceneObject;
}

export function SaveSearchModal({ dsUid, onClose, sceneRef }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState<'error' | 'idle' | 'saved' | 'saving'>('idle');
  const styles = useStyles2(getStyles);

  const profilesExplorer = useMemo(() => getProfilesExplorerScene(sceneRef), [sceneRef]);
  const { filters } = getFiltersVariable(profilesExplorer).useState();
  const query = useMemo(() => filtersToLabelSelectorExpression(filters), [filters]);

  const { saveSearch } = useSavedSearches(dsUid);
  const existingSearch = useCheckForExistingSearch(dsUid, query);

  useEffect(() => {
    reportInteraction('grafana_profiles_app_save_search_visited');
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const appEvents = getAppEvents();

      try {
        setState('saving');
        await saveSearch({ description, dsUid, query, title });
        setState('saved');

        appEvents.publish({
          payload: [t('saved-searches.save.success-message', 'Query successfully saved.')],
          type: AppEvents.alertSuccess.name,
        });

        reportInteraction('grafana_profiles_app_save_search_search_saved');

        onClose();
      } catch {
        setState('error');

        appEvents.publish({
          payload: [t('saved-searches.save.error-message', 'Unexpected error saving this query.')],
          type: AppEvents.alertError.name,
        });
      }
    },
    [description, dsUid, onClose, query, saveSearch, title]
  );

  return (
    <Modal title={t('saved-searches.save.title', 'Save query')} isOpen={true} onDismiss={onClose}>
      <Alert title="" severity="info">
        <Trans i18nKey="saved-searches.save.info-message">
          Saved queries are stored locally in your browser and will only be available on this device.
        </Trans>
      </Alert>
      <Box marginBottom={2}>
        <code className={styles.query}>{query}</code>
      </Box>
      {state !== 'saved' ? (
        <form onSubmit={handleSubmit}>
          <Stack gap={1} direction="column" minWidth={0} flex={1}>
            <Box flex={1} marginBottom={2}>
              {existingSearch && (
                <Alert title="" severity="warning">
                  {t(
                    'saved-searches.save.existing-search-warning',
                    'There is a previously saved query with the same expression: {{title}}',
                    { title: existingSearch.title }
                  )}
                </Alert>
              )}
              <Field label={t('saved-searches.save.title-label', 'Title')} noMargin htmlFor="save-search-title">
                <Input
                  id="save-search-title"
                  required
                  value={title}
                  onChange={(e: FormEvent<HTMLInputElement>) => setTitle(e.currentTarget.value)}
                  disabled={state === 'saving'}
                />
              </Field>
            </Box>
            <Box flex={1} marginBottom={2}>
              <Field
                label={t('saved-searches.save.description-label', 'Description')}
                noMargin
                htmlFor="save-search-description"
              >
                <Input
                  id="save-search-description"
                  value={description}
                  onChange={(e: FormEvent<HTMLInputElement>) => setDescription(e.currentTarget.value)}
                  disabled={state === 'saving'}
                />
              </Field>
            </Box>
          </Stack>
          <Modal.ButtonRow>
            <Button variant="secondary" fill="outline" onClick={onClose} disabled={state === 'saving'}>
              <Trans i18nKey="saved-searches.save.cancel">Cancel</Trans>
            </Button>
            <Button type="submit" disabled={!title || state === 'saving'}>
              <Trans i18nKey="saved-searches.save.save">Save</Trans>
            </Button>
          </Modal.ButtonRow>
        </form>
      ) : (
        <>
          <Alert title={t('saved-searches.save.success-title', 'Success')} severity="success">
            <Trans i18nKey="saved-searches.save.success-body">Query successfully saved.</Trans>
          </Alert>
          <Modal.ButtonRow>
            <Button variant="secondary" fill="outline" onClick={onClose}>
              <Trans i18nKey="saved-searches.save.close">Close</Trans>
            </Button>
          </Modal.ButtonRow>
        </>
      )}
    </Modal>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  query: css({
    backgroundColor: theme.colors.background.elevated,
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
    padding: theme.spacing(1),
    display: 'block',
    whiteSpace: 'wrap',
  }),
});
