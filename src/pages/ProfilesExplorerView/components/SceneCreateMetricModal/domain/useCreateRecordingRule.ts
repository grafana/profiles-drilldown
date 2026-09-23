import { displayError, displaySuccess } from '@shared/domain/displayStatus';
import { useFetchRecordingRules } from '@shared/infrastructure/recording-rules/useFetchRecordingRules';
import { RecordingRuleViewModel } from '@shared/types/RecordingRuleViewModel';

export function useCreateRecordingRule() {
  const { recordingRules, error: fetchError, mutate } = useFetchRecordingRules();

  return {
    data: {
      recordingRules,
      fetchError,
    },
    actions: {
      async save(rule: RecordingRuleViewModel) {
        try {
          await mutate(rule);
          displaySuccess([`Recording rule ${rule.metricName} created successfully!`]);
        } catch (e) {
          displayError(e as Error, [
            `Failed to save recording rule ${rule.metricName}. Reason: ${(e as Error).message}.`,
          ]);
        }
      },
    },
  };
}
