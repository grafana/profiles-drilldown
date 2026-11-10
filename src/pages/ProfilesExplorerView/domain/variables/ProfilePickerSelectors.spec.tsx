import { MultiValueVariable } from '@grafana/scenes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { of } from 'rxjs';

import { ProfileMetricVariable } from './ProfileMetricVariable';
import { ServiceNameVariable } from './ServiceNameVariable/ServiceNameVariable';

class PickerTestVariable extends MultiValueVariable {
  getValueOptions: MultiValueVariable['getValueOptions'] = () => of(this.state.options);
}

describe('Profile picker stable IDs', () => {
  it('exposes the service picker through the real Cascader', () => {
    const model = new PickerTestVariable({ name: 'serviceName', options: [], value: '', text: '', type: 'custom' });
    render(<ServiceNameVariable.Component model={model} />);
    expect(screen.getByTestId('profiles-service-picker').querySelector('input')).toBeInTheDocument();
  });

  it('exposes the profile type picker through the real Cascader', () => {
    const model = new PickerTestVariable({ name: 'profileMetricId', options: [], value: '', text: '', type: 'custom' });
    render(<ProfileMetricVariable.Component model={model} />);
    expect(screen.getByTestId('profiles-profile-type-picker').querySelector('input')).toBeInTheDocument();
  });
});
