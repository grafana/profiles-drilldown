import { displayError, displaySuccess } from '@shared/domain/displayStatus';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { useFetchRecordingRules } from '@shared/infrastructure/recording-rules/useFetchRecordingRules';
import { RecordingRuleViewModel } from '@shared/types/RecordingRuleViewModel';

export function useRecordingRulesView() {
  const { recordingRules, error: fetchError, remove, isFetching } = useFetchRecordingRules();

  return {
    data: {
      recordingRules,
      fetchError,
      isFetching,
    },
    actions: {
      async removeRecordingRule(rule: RecordingRuleViewModel) {
        try {
          await remove(rule);
          reportInteraction('g_pyroscope_app_recording_rule_deleted');
          displaySuccess([`Recording rule ${rule.metricName} deleted!`]);
        } catch (e) {
          displayError(e as Error, [`Failed to delete recording rule ${rule.metricName}.`]);
        }
      },
    },
  };
}
