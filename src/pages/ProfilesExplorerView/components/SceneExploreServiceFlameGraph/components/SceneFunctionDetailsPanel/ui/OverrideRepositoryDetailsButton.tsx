import { t, Trans } from '@grafana/i18n';
import { DataSourcePicker } from '@grafana/runtime';
import { Alert, Button, ConfirmButton, Field, Input, Modal, Stack, Text } from '@grafana/ui';
import React from 'react';
import { useForm } from 'react-hook-form';

import { FunctionVersionOrigin } from '../domain/FunctionVersionContext';
import { FunctionVersion } from '../domain/types/FunctionDetails';

type Props = {
  serviceName: string;
  datasourceName: string;
  datasourceUid: string;
  version?: FunctionVersion;
  functionVersionOrigin?: FunctionVersionOrigin;
  saveOverrides: (datasourceUid: string, serviceName: string, version: FunctionVersion) => void;
  deleteOverride: (datasourceUid: string, serviceName: string) => void;
  deleteAllOverrides: () => void;
};

export const OverrideRepositoryDetailsButton = (props: Props) => {
  const { serviceName, version, datasourceUid, saveOverrides, functionVersionOrigin } = props;
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FunctionVersion>({ mode: 'onChange' });

  const onSubmit = (data: FunctionVersion) => {
    saveOverrides(datasourceUid, serviceName, {
      repository: data.repository,
      git_ref: data.git_ref || 'HEAD',
      root_path: data.root_path || '',
    });
    setOpen(false);
  };

  return (
    <>
      <Button
        aria-label={t('function-details.override.aria-label', 'override repository settings')}
        variant="secondary"
        fill="text"
        size="sm"
        icon="pen"
        onClick={() => {
          setOpen(true);
          reset(version);
        }}
      >
        {functionVersionOrigin === FunctionVersionOrigin.USER ? (
          <Text element="span" color="secondary">
            <Trans i18nKey="function-details.override.user-set">(user set)</Trans>
          </Text>
        ) : (
          ''
        )}
      </Button>
      {open && (
        <Modal
          title={
            functionVersionOrigin === FunctionVersionOrigin.USER
              ? t('function-details.override.edit-title', 'Edit repository details override')
              : t('function-details.override.add-title', 'Add new repository details override')
          }
          isOpen={open}
          onDismiss={() => setOpen(false)}
        >
          <form onSubmit={handleSubmit(onSubmit)}>
            <Alert severity="info" title={t('function-details.override.alert-title', 'Github Integration labels')}>
              <p>
                <Trans i18nKey="function-details.override.alert-labels">
                  To activate GitHub Integration feature, you will need to add two new labels when sending profiles:
                  <code>service_repository</code> and <code>service_git_ref</code>.
                </Trans>
              </p>
              <p>
                <Trans i18nKey="function-details.override.alert-debug">
                  For debugging purposes, you can manually provide repository details using this form. The custom value
                  is saved in your browser local storage for given data source and service name.
                </Trans>
              </p>
            </Alert>

            <Field label={t('function-details.override.data-source', 'Data source')}>
              <DataSourcePicker current={datasourceUid} disabled={true} onChange={() => {}}></DataSourcePicker>
            </Field>
            <Field label={t('function-details.override.service-name', 'Service name')}>
              <Input disabled={true} value={serviceName}></Input>
            </Field>

            <Field
              label={t('function-details.override.repository-label', 'service_repository (repository URL) - required')}
              invalid={!!errors.repository}
              error={errors?.repository?.message?.toString()}
            >
              <Input
                {...register('repository', {
                  required: t('function-details.override.repository-required', 'Repository name is required'),
                })}
                placeholder={t(
                  'function-details.override.repository-placeholder',
                  'Enter GitHub repo name, https://github.com/org/repo'
                )}
              />
            </Field>
            <Field
              label={t('function-details.override.git-ref-label', 'service_git_ref (commit reference)')}
              invalid={!!errors.git_ref}
              error={errors?.git_ref?.message?.toString()}
            >
              <Input
                {...register('git_ref')}
                placeholder={t('function-details.override.git-ref-placeholder', 'HEAD')}
              />
            </Field>
            <Field label={t('function-details.override.root-path', 'Path to root')}>
              <Input
                {...register('root_path')}
                placeholder={t('function-details.override.root-path-placeholder', 'Enter root path')}
              />
            </Field>

            <Stack direction="row">
              <Button type="submit">
                {functionVersionOrigin === FunctionVersionOrigin.USER
                  ? t('function-details.override.edit', 'Edit')
                  : t('function-details.override.add', 'Add')}
              </Button>
              {functionVersionOrigin === FunctionVersionOrigin.USER && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    props.deleteOverride(datasourceUid, serviceName);
                    reset();
                    setOpen(false);
                  }}
                >
                  <Trans i18nKey="function-details.override.delete">Delete override</Trans>
                </Button>
              )}
              <ConfirmButton
                confirmVariant="destructive"
                confirmText={t('function-details.override.remove-all-confirm', 'Remove all')}
                onConfirm={() => {
                  props.deleteAllOverrides();
                  reset();
                  setOpen(false);
                }}
              >
                <Trans i18nKey="function-details.override.remove-all">Remove all overrides</Trans>
              </ConfirmButton>
            </Stack>
          </form>
        </Modal>
      )}
    </>
  );
};
