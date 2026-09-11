import { MultiValueVariableState } from '@grafana/scenes';

import { ProfileMetricVariable } from './ProfileMetricVariable';

type InterceptFn = (stateUpdate: Partial<MultiValueVariableState>) => void;

function callIntercept(model: ProfileMetricVariable, stateUpdate: Partial<MultiValueVariableState>) {
  (model as unknown as { interceptStateUpdateAfterValidation: InterceptFn }).interceptStateUpdateAfterValidation(
    stateUpdate
  );
}

describe('ProfileMetricVariable', () => {
  describe('interceptStateUpdateAfterValidation', () => {
    it('uses the default profile type when URL sync sets an empty value', () => {
      const model = new ProfileMetricVariable();
      const stateUpdate: Partial<MultiValueVariableState> = { value: '' };

      callIntercept(model, stateUpdate);

      expect(stateUpdate.value).toBe(ProfileMetricVariable.DEFAULT_VALUE);
    });

    it('does not override the value when only options are updated', () => {
      const model = new ProfileMetricVariable();
      model.setState({ value: 'block:delay:nanoseconds:contentions:count' });

      const stateUpdate: Partial<MultiValueVariableState> = {
        options: [{ value: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds', label: 'CPU' }],
      };

      callIntercept(model, stateUpdate);

      expect(stateUpdate.value).toBeUndefined();
    });
  });
});
