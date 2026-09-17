import { Select } from '@grafana/ui';
import React from 'react';

import { getMessages } from '../constants';

const noOp = () => {};

export function DisabledSelect() {
  return <Select disabled placeholder={getMessages().FILTER_ADD} onChange={noOp} />;
}
