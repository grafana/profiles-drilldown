import { IconName } from '@grafana/data';
import { Props as FlameGraphProps } from '@grafana/flamegraph';
import { t } from '@grafana/i18n';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { useCallback } from 'react';

export function useCreateRecordingRulesMenu(setModalOpen: (functionName?: string) => void): DomainHookReturnValue {
  const getExtraFlameGraphMenuItems: FlameGraphProps['getExtraContextMenuButtons'] = useCallback(
    ({ item, label }: any) => {
      return [
        {
          label: t('create-recording-rule.menu-option', 'Create recording rule'),
          icon: 'download-alt' as IconName,
          onClick: () => {
            reportInteraction('g_pyroscope_app_recording_rule_create_modal_opened');
            setModalOpen(label === 'total' && item.level === 0 ? undefined : label);
          },
        },
      ];
    },
    [setModalOpen]
  );

  return {
    data: {},
    actions: {
      getExtraFlameGraphMenuItems,
    },
  };
}
