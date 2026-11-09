import { MultiValueVariable } from '@grafana/scenes';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { ProfileMetricVariable } from './ProfileMetricVariable';
import { ServiceNameVariable } from './ServiceNameVariable/ServiceNameVariable';

describe('Profile picker stable IDs', () => {
  it('exposes the service picker through the real Cascader', () => {
    const model = new MultiValueVariable({ name: 'serviceName', options: [], value: '' });
    render(<ServiceNameVariable.Component model={model} />);
    expect(screen.getByTestId('profiles-service-picker').querySelector('input')).toBeInTheDocument();
  });

  it('exposes the profile type picker through the real Cascader', () => {
    const model = new MultiValueVariable({ name: 'profileMetricId', options: [], value: '' });
    render(<ProfileMetricVariable.Component model={model} />);
    expect(screen.getByTestId('profiles-profile-type-picker').querySelector('input')).toBeInTheDocument();
  });
});
