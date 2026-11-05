import { usePluginComponent } from '@grafana/runtime';
import { sceneGraph, SceneObject } from '@grafana/scenes';
import { render, screen, waitFor } from '@testing-library/react';
import React, { act } from 'react';

import pluginJson from '../../../plugin.json';
import {
  ENTITY_ASSERTIONS_WIDGET_ID,
  EntityAssertionsWidget,
  entityQueryFromService,
  useServiceName,
} from './EntityAssertionsWidget';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  usePluginComponent: jest.fn(),
}));

type WidgetProps = {
  source?: string;
  query: {
    entityName?: string;
    entityType?: string;
    start: number;
    end: number;
    enabled: boolean;
    scope?: { namespace?: string };
    additionalMatchers?: Array<{ name: string; op: string; value: string | number }>;
  };
  returnToPrevious?: boolean;
};

describe('EntityAssertionsWidget', () => {
  const model = {} as SceneObject;

  function mockScene() {
    const timeRange = {
      state: {
        value: {
          from: { valueOf: () => 1_000 },
          to: { valueOf: () => 2_000 },
        },
      },
      useState() {
        return this.state;
      },
    };

    jest.spyOn(sceneGraph, 'getTimeRange').mockReturnValue(timeRange as never);
  }

  beforeEach(() => {
    jest.mocked(usePluginComponent).mockReturnValue({
      component: (({ source, query }: WidgetProps) => (
        <div>
          <span>{source}</span>
          <span>{query.entityName}</span>
          <span>{query.entityType}</span>
          <span>{String(query.start)}</span>
          <span>{String(query.end)}</span>
          <span>{query.scope?.namespace ?? 'no-scope'}</span>
          <span>{query.additionalMatchers ? 'has-matchers' : 'no-matchers'}</span>
        </div>
      )) as never,
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('declares the Asserts exposed component in plugin.json', () => {
    expect(pluginJson.dependencies?.extensions?.exposedComponents).toContain(ENTITY_ASSERTIONS_WIDGET_ID);
    expect(ENTITY_ASSERTIONS_WIDGET_ID).toBe('grafana-asserts-app/entity-assertions-widget/v1');
  });

  it('renders nothing while the Asserts component is unavailable', () => {
    mockScene();
    jest.mocked(usePluginComponent).mockReturnValue({ component: undefined, isLoading: false });

    const { container } = render(<EntityAssertionsWidget serviceName="checkout" model={model} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('passes the selected service and time range without profile label filters', async () => {
    mockScene();

    render(<EntityAssertionsWidget serviceName="prod/checkout" model={model} />);

    expect(await screen.findByText('Profiles Drilldown')).toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
    expect(screen.getByText('prod')).toBeInTheDocument();
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('2000')).toBeInTheDocument();
    expect(screen.getByText('no-matchers')).toBeInTheDocument();
    expect(usePluginComponent).toHaveBeenCalledWith(ENTITY_ASSERTIONS_WIDGET_ID);
  });

  it('sends an unqualified service name without a namespace scope', async () => {
    mockScene();

    render(<EntityAssertionsWidget serviceName="checkout" model={model} />);

    expect(await screen.findByText('checkout')).toBeInTheDocument();
    expect(screen.getByText('no-scope')).toBeInTheDocument();
  });

  it('sends a multi-segment service name whole', async () => {
    mockScene();

    render(<EntityAssertionsWidget serviceName="team/app/worker" model={model} />);

    expect(await screen.findByText('team/app/worker')).toBeInTheDocument();
    expect(screen.getByText('no-scope')).toBeInTheDocument();
  });
});

describe('entityQueryFromService', () => {
  it('splits a namespace-qualified id into the service name and namespace scope', () => {
    expect(entityQueryFromService('ns-a/checkout')).toEqual({
      entityName: 'checkout',
      scope: { namespace: 'ns-a' },
    });
  });

  it('keeps a single segment as the entity name', () => {
    expect(entityQueryFromService('checkout')).toEqual({ entityName: 'checkout' });
  });

  it('does not reduce a name that contains more than one slash', () => {
    expect(entityQueryFromService('team/app/worker')).toEqual({ entityName: 'team/app/worker' });
    expect(entityQueryFromService('ebpf/my-namespace/my-service')).toEqual({
      entityName: 'ebpf/my-namespace/my-service',
    });
  });
});

describe('useServiceName', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('follows the serviceName scene variable', async () => {
    let onChange: () => void = () => {};
    const variable = {
      state: { value: 'checkout' },
      subscribeToState: jest.fn((cb: () => void) => {
        onChange = cb;
        return { unsubscribe: jest.fn() };
      }),
    };

    jest.spyOn(sceneGraph, 'lookupVariable').mockReturnValue(variable as never);

    function Probe({ model }: { model: SceneObject }) {
      return <div>{useServiceName(model) ?? 'none'}</div>;
    }

    render(<Probe model={{} as SceneObject} />);

    expect(await screen.findByText('checkout')).toBeInTheDocument();

    variable.state = { value: 'payments' };
    act(() => {
      onChange();
    });

    await waitFor(() => {
      expect(screen.getByText('payments')).toBeInTheDocument();
    });
  });
});
