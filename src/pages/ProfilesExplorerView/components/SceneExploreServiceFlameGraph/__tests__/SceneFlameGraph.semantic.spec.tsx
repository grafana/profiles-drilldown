import { createDataFrame, DataFrame, dateTime, FieldType, LoadingState } from '@grafana/data';
import { FlameGraph, FlameGraphFrame, Props as FlameGraphProps } from '@grafana/flamegraph';
import { config } from '@grafana/runtime';
import {
  CustomVariable,
  SceneComponentProps,
  SceneDataNode,
  SceneObjectBase,
  SceneObjectState,
  SceneTimeRange,
  SceneVariableSet,
} from '@grafana/scenes';
import { CATEGORIES, Category, TAXONOMY } from '@shared/domain/semantic/jevRubric';
import { REQUEST_TIMEOUT_MS } from '@shared/domain/semantic/runClassification';
import { isJevAdmin, loadJevConfiguration, requestJev } from '@shared/infrastructure/semantic/jevProxy';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

import { buildFlameGraphQueryRunner } from '../../../infrastructure/flame-graph/buildFlameGraphQueryRunner';
import { SceneFlameGraph } from '../SceneFlameGraph';

jest.mock('@grafana/flamegraph', () => ({ FlameGraph: jest.fn() }));
jest.mock('@shared/infrastructure/semantic/jevProxy');
jest.mock('@shared/domain/url-params/useMaxNodesFromUrl', () => ({ useMaxNodesFromUrl: () => [16384, () => {}] }));
jest.mock('@shared/infrastructure/settings/useFetchPluginSettings', () => ({
  useFetchPluginSettings: () => ({ settings: { collapsedFlamegraphs: true }, error: null }),
}));
jest.mock('@shared/infrastructure/featureFlags/featureFlags', () => ({
  ...jest.requireActual('@shared/infrastructure/featureFlags/featureFlags'),
  useFlagFlameGraphWithCallTree: () => false,
  useFlagMetricsFromProfiles: () => false,
}));
jest.mock('../../../domain/useBuildPyroscopeQuery', () => ({ useBuildPyroscopeQuery: () => 'synthetic-query' }));
jest.mock('../../../domain/useGrafanaAssistant', () => ({ useGrafanaAssistant: () => ({ hideAIButton: true }) }));
jest.mock('../../../infrastructure/flame-graph/buildFlameGraphQueryRunner', () => ({
  buildFlameGraphQueryRunner: jest.fn(),
}));
jest.mock('../../../infrastructure/deferSceneQueryRunnerRun', () => ({ deferSceneQueryRunnerRun: () => () => {} }));
jest.mock('../components/SceneFunctionDetailsPanel/domain/useGitHubIntegration', () => ({
  useGitHubIntegration: () => ({
    actions: { getExtraFlameGraphMenuItems: () => [{ label: 'Function details', icon: 'info-circle', onClick() {} }] },
    data: {},
  }),
}));
jest.mock('../../SceneAiPanel/components/AiButton/AIButton', () => ({ AIButton: () => null }));
jest.mock('../components/SamplingIndicatorExtensionPoint', () => ({ SamplingIndicatorExtensionPoint: () => null }));
// Stand-ins for scene objects whose modules need browser streaming APIs; the flame graph mock never renders them.
jest.mock('../../SceneAiPanel/SceneAiPanel', () => ({ SceneAiPanel: stubSceneObject() }));
jest.mock('../components/SceneExportMenu/SceneExportMenu', () => ({ SceneExportMenu: stubSceneObject() }));
jest.mock('../components/SceneFunctionDetailsPanel/SceneFunctionDetailsPanel', () => ({
  SceneFunctionDetailsPanel: stubSceneObject(),
}));
jest.mock('../../SceneCreateMetricModal/SceneCreateRecordingRuleModal', () => ({
  SceneCreateRecordingRuleModal: stubSceneObject(),
}));

function stubSceneObject() {
  const { SceneObjectBase: Base } = jest.requireActual('@grafana/scenes');
  return class extends Base {
    static Component = () => null;
    constructor() {
      super({});
    }
  };
}

type Row = [label: string, level: number, value: number, self: number];
type Answer = { category: Category; confidence: number; probability?: number } | 'fail';

const CPU = 'process_cpu:cpu:nanoseconds:cpu:nanoseconds';
const MEMORY = 'memory:alloc_space:bytes:space:bytes';

// Two "json.Marshal" occurrences in different call contexts; every self weight adds up to the 100 root value.
const ROWS: Row[] = [
  ['total', 0, 100, 0],
  ['handler', 1, 60, 10],
  ['json.Marshal', 2, 30, 30],
  ['compress', 2, 20, 20],
  ['worker', 1, 40, 5],
  ['json.Marshal', 2, 25, 25],
  ['other', 2, 10, 10],
];

// Heaviest cases are classified first: row 2, row 5, row 3, row 1, row 4.
const ANSWERS: Record<string, Answer> = {
  'handler>json.Marshal': { category: 'serialization', confidence: 0.92, probability: 0.3 },
  'worker>json.Marshal': { category: 'unknown', confidence: 0.95 },
  'handler>compress': { category: 'crypto_compression', confidence: 0.44, probability: 0.91 },
  handler: 'fail',
  worker: { category: 'application_logic', confidence: 0.99 },
};

function profile(rows: Row[], unit?: string): DataFrame {
  return createDataFrame({
    fields: [
      { name: 'level', type: FieldType.number, values: rows.map((r) => r[1]) },
      { name: 'value', type: FieldType.number, values: rows.map((r) => r[2]), config: { unit } },
      { name: 'self', type: FieldType.number, values: rows.map((r) => r[3]), config: { unit } },
      { name: 'label', type: FieldType.string, values: rows.map((r) => r[0]) },
    ],
  });
}

function evidencePath(body: string): string {
  const { evidence } = JSON.parse(body).state;
  return [...evidence.callers, evidence.target].join('>');
}

function jevReply(answer: Exclude<Answer, 'fail'>) {
  const { category, confidence, probability = 0.9 } = answer;
  const rest = (1 - probability) / (CATEGORIES.length - 1);
  return {
    model: 'typesafe/jev-1.13-20260101',
    answers: {
      target: {
        type: 'choice',
        choice: category,
        confidence,
        probabilities: Object.fromEntries(CATEGORIES.map((c) => [c, c === category ? probability : rest])),
      },
    },
    usage: { tokens: 1 },
  };
}

function answerWith(answers: Record<string, Answer> | ((path: string) => Answer)) {
  jest.mocked(requestJev).mockImplementation(async (body) => {
    const respond = (path: string) => {
      const answer = typeof answers === 'function' ? answers(path) : answers[path];
      if (!answer || answer === 'fail') {
        throw new Error('Jev classification request failed.');
      }
      return jevReply(answer);
    };
    const request = JSON.parse(body);
    if (request.questions.target) {
      return respond(evidencePath(body));
    }
    const evidence: Record<string, { target: string; callers: string[] }> = request.state.evidence;
    return {
      model: 'typesafe/jev-1.13',
      answers: Object.fromEntries(
        Object.entries(evidence).map(([key, value]) => [
          key,
          respond([...value.callers, value.target].join('>')).answers.target,
        ])
      ),
    };
  });
}

interface PendingRequest {
  path: string;
  signal: AbortSignal;
  resolve: (reply: unknown) => void;
  reject: (error: Error) => void;
}

function deferRequests(): PendingRequest[] {
  const pending: PendingRequest[] = [];
  jest
    .mocked(requestJev)
    .mockImplementation(
      (body, signal) =>
        new Promise((resolve, reject) => pending.push({ path: evidencePath(body), signal, resolve, reject }))
    );
  return pending;
}

async function answer(request: PendingRequest) {
  const reply = ANSWERS[request.path];
  await act(async () =>
    reply === 'fail'
      ? request.reject(new Error('Jev classification request failed.'))
      : request.resolve(jevReply(reply))
  );
}

class Host extends SceneObjectBase<SceneObjectState & { body: SceneFlameGraph }> {
  static Component = ({ model }: SceneComponentProps<Host>) => {
    const { body } = model.useState();
    return <body.Component model={body} />;
  };
}

function variable(name: string, values: string[], value = values[0]) {
  return new CustomVariable({ name, key: name, query: values.map((v) => v || ' ').join(','), value, text: value });
}

let runners: SceneDataNode[] = [];
let nextFrame: DataFrame;
let orgId = 0;

function flameGraphProps(): FlameGraphProps {
  return jest.mocked(FlameGraph).mock.lastCall![0];
}

function setup({
  metric = CPU,
  rows = ROWS,
  frame,
}: {
  metric?: string;
  rows?: Row[];
  frame?: DataFrame;
} = {}) {
  nextFrame = frame ?? profile(rows);
  const variables = {
    dataSource: variable('dataSource', ['ds-a', 'ds-b']),
    serviceName: variable('serviceName', ['svc', 'other-svc']),
    profileMetricId: variable('profileMetricId', [...new Set([CPU, MEMORY, metric])], metric),
    filters: variable('filters', ['', 'pod="a"']),
    spanSelector: variable('spanSelector', ['', 'span-1']),
    profileIdSelector: variable('profileIdSelector', ['', 'profile-1']),
  };
  const timeRange = new SceneTimeRange({ from: 'now-1h', to: 'now' });
  const body = new SceneFlameGraph();
  const host = new Host({
    $timeRange: timeRange,
    $variables: new SceneVariableSet({ variables: Object.values(variables) }),
    body,
  });
  const view = render(<host.Component model={host} />);

  const emit = (frame: DataFrame | undefined, state = LoadingState.Done) =>
    act(() => {
      runners.at(-1)!.setState({
        data: { state, series: frame ? [frame] : [], timeRange: timeRange.state.value },
      });
    });

  return { ...view, host, body, variables, timeRange, emit };
}

function delayConfiguration() {
  type Configuration = { enabled: boolean; keyConfigured: boolean; confidenceThreshold?: number };
  let finish!: (configuration: Configuration) => Promise<void>;
  jest.mocked(loadJevConfiguration).mockReturnValue(
    new Promise((resolve) => {
      finish = (configuration) => act(async () => resolve({ confidenceThreshold: 0.8, ...configuration }));
    })
  );
  return (configuration: Configuration) => finish(configuration);
}

async function flush() {
  await act(async () => {});
}

async function openPanel() {
  const toggle = await screen.findByRole('button', { name: 'Function Classification' });
  if (toggle.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(toggle);
  }
}

function classifyButton() {
  return screen.getByRole('button', { name: 'Classify' });
}

function controls() {
  return within(screen.getByTestId('semantic-classification'))
    .getAllByRole('button')
    .filter((button) => ['Classify', 'Cancel', 'Clear'].includes(button.textContent ?? ''))
    .map((button) => [button.textContent, (button as HTMLButtonElement).disabled ? 'disabled' : 'enabled']);
}

async function classify() {
  await openPanel();
  const button = await screen.findByRole('button', { name: 'Classify' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await flush();
}

function summaryRows() {
  const summary = screen.getByTestId('semantic-summary');
  const rows = Array.from(summary.querySelectorAll('[data-category-summary]'), (row) =>
    Array.from(row.querySelectorAll('[data-summary-value]'), (value) => value.textContent)
  );
  return rows;
}

beforeEach(() => {
  runners = [];
  config.bootData.user.orgId = ++orgId;
  jest.mocked(FlameGraph).mockImplementation(() => <div data-testid="flame-graph" />);
  jest.mocked(buildFlameGraphQueryRunner).mockImplementation(() => {
    const runner = new SceneDataNode({
      data: { state: LoadingState.Done, series: [nextFrame], timeRange: new SceneTimeRange().state.value },
    });
    runners.push(runner);
    return runner as never;
  });
  jest.mocked(isJevAdmin).mockReturnValue(true);
  jest.mocked(loadJevConfiguration).mockResolvedValue({ enabled: true, keyConfigured: true, confidenceThreshold: 0.8 });
  answerWith(ANSWERS);
});

describe('classification panel', () => {
  it('opens without inference and retains an in-flight run when closed', async () => {
    const pending = deferRequests();
    setup();
    const toggle = await screen.findByRole('button', { name: 'Function Classification' });
    expect(screen.queryByTestId('semantic-classification')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole('textbox', { name: 'Application name or module' })).not.toBeInTheDocument();
    expect(requestJev).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Classify' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Serialization' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close classification panel' }));
    expect(screen.queryByTestId('semantic-classification')).not.toBeInTheDocument();
    expect(pending[0].signal.aborted).toBe(false);
    expect(screen.getByRole('button', { name: 'Clear classification selection' })).toHaveTextContent('Serialization');
    await answer(pending[0]);
    expect([...flameGraphProps().highlightedRows!]).toEqual([2]);
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Serialization' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Classifying 1 of 5');
    expect(requestJev).toHaveBeenCalledTimes(2);
  });
  it('opens category controls without mode tabs', async () => {
    setup();
    await openPanel();
    expect(classifyButton()).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Categories' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Application code' })).not.toBeInTheDocument();
  });

  it('uses the selected service name without an editable identity', async () => {
    setup();
    await classify();
    expect(screen.queryByRole('textbox', { name: 'Application name or module' })).not.toBeInTheDocument();
    for (const [body] of jest.mocked(requestJev).mock.calls) {
      expect(JSON.parse(body).state).toMatchObject({ application: 'svc', rubricVersion: 5 });
    }
  });

  it('uses the new service identity after a service change', async () => {
    const { variables } = setup();
    await classify();
    act(() => variables.serviceName.changeValueTo('other-svc'));
    expect(screen.queryByTestId('semantic-summary')).not.toBeInTheDocument();
    jest.mocked(requestJev).mockClear();
    await classify();
    expect(requestJev).toHaveBeenCalled();
    for (const [body] of jest.mocked(requestJev).mock.calls) {
      expect(JSON.parse(body).state.application).toBe('other-svc');
    }
  });

  it('requires a selected service without making a request', async () => {
    const { variables } = setup();
    await openPanel();
    act(() => variables.serviceName.changeValueTo(''));
    expect(classifyButton()).toBeDisabled();
    expect(screen.getByText('Select a service to classify.')).toBeInTheDocument();
    expect(requestJev).not.toHaveBeenCalled();
  });
});

describe('availability', () => {
  it('is hidden from users who are not organization admins', async () => {
    jest.mocked(isJevAdmin).mockReturnValue(false);
    setup();
    await flush();

    expect(screen.getByTestId('flame-graph')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Function Classification' })).not.toBeInTheDocument();
    expect(loadJevConfiguration).not.toHaveBeenCalled();
  });

  it('is hidden until an admin enables it', async () => {
    jest
      .mocked(loadJevConfiguration)
      .mockResolvedValue({ enabled: false, keyConfigured: true, confidenceThreshold: 0.8 });
    setup();
    await flush();

    expect(loadJevConfiguration).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Function Classification' })).not.toBeInTheDocument();
  });

  it.each([
    [
      'no API key is configured',
      () => Promise.resolve({ enabled: true, keyConfigured: false, confidenceThreshold: 0.8 }),
      /OpenRouter API key/,
    ],
    ['the configuration cannot be loaded', () => Promise.reject(new Error('down')), /could not be loaded/],
  ])('keeps the flame graph usable without inference when %s', async (_, load, reason) => {
    jest.mocked(loadJevConfiguration).mockImplementation(load);
    setup();

    await openPanel();
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(classifyButton()).toBeDisabled();
    fireEvent.click(classifyButton());
    expect(screen.getByTestId('flame-graph')).toBeInTheDocument();
    expect(requestJev).not.toHaveBeenCalled();
  });

  it.each([MEMORY, 'process_cpu:alloc_size:bytes:cpu:nanoseconds', 'wall:wall:nanoseconds:wall:nanoseconds'])(
    'is limited to CPU profiles, not %s',
    async (metric) => {
      setup({ metric });

      await openPanel();
      expect(await screen.findByText('Classification is not available for this profile type yet.')).toBeInTheDocument();
      expect(classifyButton()).toBeDisabled();
      expect(flameGraphProps().data).toBe(nextFrame);
    }
  );

  it('classifies only after an explicit click, never on load or refresh', async () => {
    const { emit } = setup();
    await openPanel();
    emit(profile(ROWS));
    await flush();

    expect(requestJev).not.toHaveBeenCalled();

    fireEvent.click(classifyButton());
    await flush();

    expect(requestJev).toHaveBeenCalledTimes(4);
    expect(jest.mocked(requestJev).mock.calls.map(([body]) => evidencePath(body))).toEqual([
      'handler>json.Marshal',
      'worker>json.Marshal',
      'handler>compress',
      'handler',
    ]);
  });
});

describe('category descriptions', () => {
  it('shows the category description without accepted-frame counts', async () => {
    setup();
    await classify();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Serialization' }));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Parsing and encoding data formats such as JSON and protobuf.');
    expect(tooltip).not.toHaveTextContent(/accepted frames?/);
  });
});

describe('configured confidence threshold', () => {
  it.each([0.44, 0.801, 1])('uses threshold %p for accounting, highlights and details', async (confidenceThreshold) => {
    jest.mocked(loadJevConfiguration).mockResolvedValue({ enabled: true, keyConfigured: true, confidenceThreshold });
    setup();
    await classify();

    const threshold = confidenceThreshold === 1 ? '1.00' : String(confidenceThreshold);
    expect(screen.getByTestId('semantic-summary')).not.toHaveTextContent('Confidence threshold');
    expect(screen.queryByTestId('semantic-total')).not.toBeInTheDocument();
    const applied = confidenceThreshold === 0.44;
    const rejectedWeight = confidenceThreshold === 1 ? 50 : 20;
    expect(summaryRows()).toContainEqual(
      applied
        ? ['Crypto and compression', '20', '20.0%']
        : ['Below confidence threshold', String(rejectedWeight), `${rejectedWeight}.0%`]
    );
    const category = screen.getByRole('button', { name: 'Crypto and compression' });
    expect(category).toHaveTextContent(applied ? '20.0%' : '0.0%');
    fireEvent.click(category);
    expect(flameGraphProps().highlightedRows).toEqual(new Set(applied ? [3] : []));
    expect(summaryRows()).toContainEqual(['No matching category', '25', '25.0%']);

    const status = confidenceThreshold === 0.44 ? 'applied' : `below ${threshold}, unclassified`;
    const tooltip = render(<>{flameGraphProps().getFrameTooltipContent!({ kind: 'source', row: 3 })}</>);
    expect(tooltip.container).toHaveTextContent(
      `${applied ? '' : 'Unclassified · '}Crypto and compression · Confidence 0.44`
    );
    tooltip.unmount();
    act(() =>
      flameGraphProps().getExtraContextMenuButtons!({} as never, nextFrame, {
        isDiff: false,
        search: '',
        frame: { kind: 'source', row: 3 },
      })
        .at(-1)!
        .onClick()
    );
    const details = within(screen.getByRole('region', { name: 'Classification details' }));
    expect(details.getByText('Status').nextElementSibling).toHaveTextContent(status);
    expect(details.getByText(/Confidence is reported/)).toHaveTextContent(
      `Suggestions below ${threshold} stay unclassified.`
    );
  });

  it('keeps the starting threshold for every progress update in a run', async () => {
    const pending = deferRequests();
    const { body } = setup();
    await classify();
    act(() => body.state.semantic.setState({ confidenceThreshold: 0.3 }));
    for (let i = 0; i < 4; i++) {
      await answer(pending[i]);
      expect(body.state.semantic.state.job?.classification?.confidenceThreshold).toBe(0.8);
    }
    expect(summaryRows()).toContainEqual(['Below confidence threshold', '20', '20.0%']);
    expect(summaryRows()).toContainEqual(['No matching category', '25', '25.0%']);
  });

  it('ignores an older threshold load after reactivation', async () => {
    const first = delayConfiguration();
    const { host, body, unmount } = setup();
    unmount();
    const latest = delayConfiguration();
    render(<host.Component model={host} />);
    await latest({ enabled: true, keyConfigured: true, confidenceThreshold: 0.9 });
    await first({ enabled: true, keyConfigured: true, confidenceThreshold: 0.1 });
    expect(body.state.semantic.state.confidenceThreshold).toBe(0.9);
    expect(requestJev).not.toHaveBeenCalled();
  });

  it('uses a changed threshold after reactivation without refetching cached predictions', async () => {
    answerWith(() => ({ category: 'serialization', confidence: 0.6 }));
    const { host, unmount } = setup();
    await classify();
    expect(summaryRows()).toContainEqual(['Below confidence threshold', '90', '90.0%']);
    expect(requestJev).toHaveBeenCalledTimes(5);
    unmount();
    jest
      .mocked(loadJevConfiguration)
      .mockResolvedValue({ enabled: true, keyConfigured: true, confidenceThreshold: 0.5 });
    render(<host.Component model={host} />);
    await flush();
    expect(requestJev).toHaveBeenCalledTimes(5);
    await classify();
    expect(requestJev).toHaveBeenCalledTimes(5);
    expect(summaryRows()).toContainEqual(['Serialization', '90', '90.0%']);
    expect(screen.queryByTestId('semantic-total')).not.toBeInTheDocument();
  });
});

describe('whole-profile summary', () => {
  it('keeps categories selectable and updates pinned highlights while results arrive', async () => {
    const pending = deferRequests();
    setup();
    await classify();

    expect(screen.getByRole('status')).toHaveTextContent('Classifying 0 of 5 call contexts');
    expect(screen.getByTestId('semantic-summary')).not.toHaveTextContent('Hover to preview');
    expect(screen.getByTestId('semantic-summary')).toHaveTextContent('90.0% awaiting classification');
    const categories = screen.getByRole('group', { name: 'Function categories' });
    const labels = () =>
      within(categories)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    const initialLabels = labels();
    expect(initialLabels).toHaveLength(10);
    const serialization = within(categories).getByRole('button', { name: 'Serialization' });
    expect(serialization).toBeEnabled();
    expect(serialization).toHaveTextContent('–');
    fireEvent.click(serialization);
    expect(serialization).toHaveAttribute('aria-pressed', 'true');
    expect([...flameGraphProps().highlightedRows!]).toEqual([]);
    expect(requestJev).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0');
    expect(screen.getByRole('progressbar')).toHaveAttribute('max', '5');

    await answer(pending[0]);

    expect(screen.getByRole('status')).toHaveTextContent('Classifying 1 of 5 call contexts');
    expect(screen.getByTestId('semantic-summary')).toHaveTextContent('60.0% awaiting classification');
    expect(serialization).toHaveTextContent('30.0%');
    expect(serialization).toHaveAttribute('aria-pressed', 'true');
    expect([...flameGraphProps().highlightedRows!]).toEqual([2]);
    fireEvent.mouseEnter(within(categories).getByRole('button', { name: 'I/O' }));
    expect([...flameGraphProps().highlightedRows!]).toEqual([]);
    fireEvent.mouseLeave(within(categories).getByRole('button', { name: 'I/O' }));
    expect([...flameGraphProps().highlightedRows!]).toEqual([2]);
    fireEvent.click(within(categories).getByRole('button', { name: 'All functions' }));
    expect(flameGraphProps().highlightedRows).toBeUndefined();
    fireEvent.click(serialization);
    expect(requestJev).toHaveBeenCalledTimes(2);
    expect(labels()).toEqual(initialLabels);
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1');

    await answer(pending[1]);
    await answer(pending[2]);
    await answer(pending[3]);

    expect(pending).toHaveLength(4);
    expect(screen.getByTestId('semantic-summary')).not.toHaveTextContent('Partial results');
    expect(labels()).toEqual(initialLabels);
    expect(within(categories).getByRole('button', { name: 'Serialization' })).toBe(serialization);
    expect(serialization).toHaveAttribute('aria-pressed', 'true');
    expect([...flameGraphProps().highlightedRows!]).toEqual([2]);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Classification stopped after a failed request\. Remaining call contexts were skipped\.$/
    );
    expect(summaryRows()).toEqual([
      ['Serialization', '30', '30.0%'],
      ['Below confidence threshold', '20', '20.0%'],
      ['No matching category', '25', '25.0%'],
      ['No usable result', '15', '15.0%'],
      ['Missing profile detail', '10', '10.0%'],
    ]);
  });

  it.each([0.44, 0.799])(
    'reports nanosecond CPU for the browser fixture with a rejected confidence of %p',
    async (rejected) => {
      answerWith({
        parentA: { category: 'application_logic', confidence: 0.9 },
        parentB: { category: 'application_logic', confidence: 0.9 },
        'parentA>duplicate': { category: 'serialization', confidence: 0.91, probability: 0.6 },
        'parentA>rejected': { category: 'io', confidence: rejected, probability: 0.9 },
        'parentB>duplicate': { category: 'serialization', confidence: 0.91, probability: 0.6 },
      });
      const rows: Row[] = [
        ['total', 0, 10e9, 0],
        ['parentA', 1, 6e9, 0],
        ['duplicate', 2, 3e9, 3e9],
        ['rejected', 2, 2e9, 2e9],
        ['[unknown]', 2, 1e9, 1e9],
        ['parentB', 1, 4e9, 0],
        ['duplicate', 2, 4e9, 4e9],
      ];
      setup({ frame: profile(rows, 'ns') });
      await classify();

      expect(requestJev).toHaveBeenCalledTimes(5);
      expect(summaryRows()).toEqual([
        ['Serialization', '7 s', '70.0%'],
        ['Application code', '0 ns', '0.0%'],
        ['Below confidence threshold', '2 s', '20.0%'],
        ['Missing profile detail', '1 s', '10.0%'],
      ]);

      const tooltip = render(<>{flameGraphProps().getFrameTooltipContent!({ kind: 'source', row: 3 })}</>);
      expect(tooltip.container).toHaveTextContent(
        `Unclassified · I/O · Confidence ${rejected === 0.44 ? '0.44' : '0.799'}`
      );
      tooltip.unmount();
      act(() =>
        flameGraphProps().getExtraContextMenuButtons!({} as never, nextFrame, {
          isDiff: false,
          search: '',
          frame: { kind: 'source', row: 6 },
        })
          .at(-1)!
          .onClick()
      );
      await flush();
      const details = within(screen.getByRole('region', { name: 'Classification details' }));
      expect(details.getByText('Confidence').nextElementSibling).toHaveTextContent('0.91');
      expect(details.getByText('Status').nextElementSibling).toHaveTextContent('applied');
      expect(details.queryByText('0.60')).not.toBeInTheDocument();
    }
  );

  it('classifies every occurrence beyond the old sampling limit in bounded batches', async () => {
    answerWith(() => ({ category: 'io', confidence: 0.9 }));
    const leaves = Array.from({ length: 45 }, (_, i): Row => [`fn${i}`, 1, 1, 1]);
    setup({ rows: [['total', 0, 45, 0], ...leaves] });
    await classify();

    const requests = jest.mocked(requestJev).mock.calls.map(([body]) => JSON.parse(body));
    expect(requests.length).toBeLessThan(45);
    expect(requests.reduce((sum, request) => sum + Object.keys(request.questions).length, 0)).toBe(45);
    expect(summaryRows()).toEqual([['I/O', '45', '100.0%']]);
  });

  it('completes an empty classification of a zero-weight profile', async () => {
    setup({
      rows: [
        ['total', 0, 0, 0],
        ['idle', 1, 0, 0],
      ],
    });
    await classify();

    expect(requestJev).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/^Classification complete for 0 call contexts\.$/);
    expect(summaryRows()).toEqual([]);
  });

  it('announces progress and completion in one live region, singular for one call context', async () => {
    const pending = deferRequests();
    setup({
      rows: [
        ['total', 0, 1, 0],
        ['work', 1, 1, 1],
      ],
    });
    await openPanel();
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/^$/);

    await classify();

    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent(/^Classifying 0 of 1 call context…$/);

    await act(async () => pending[0].resolve(jevReply({ category: 'io', confidence: 0.9 })));

    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent(/^Classification complete for 1 call context\.$/);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent(/^$/);
  });

  it('announces a timed-out request as a complete, localized sentence', async () => {
    jest.useFakeTimers();
    try {
      const pending = deferRequests();
      setup();
      await classify();
      await act(() => jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS));

      expect(pending).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveTextContent(
        /^Classification stopped because a request timed out\. Remaining call contexts were skipped\.$/
      );
      const tooltip = render(<>{flameGraphProps().getFrameTooltipContent!({ kind: 'source', row: 2 })}</>);
      expect(tooltip.container).toHaveTextContent(/^Unclassified$/);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    [
      'self above value',
      [
        ['total', 0, 100, 0],
        ['a', 1, 50, 60],
      ] as Row[],
      'Flame graph row 1 has self above value',
    ],
    [
      'lost mass',
      [
        ['total', 0, 100, 0],
        ['a', 1, 50, 50],
      ] as Row[],
      'Profile mass is not conserved',
    ],
  ])('explains why a malformed profile (%s) cannot be classified', async (_, rows, message) => {
    setup({ rows });
    await classify();

    expect(screen.getByText('This profile cannot be classified')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(flameGraphProps().data).toBe(nextFrame);
    expect(requestJev).not.toHaveBeenCalled();
  });

  it('refuses a diff-shaped frame', async () => {
    const frame = profile(ROWS);
    frame.fields.push({ ...frame.fields[2], name: 'selfRight' });
    setup({ frame });
    await classify();

    expect(screen.getByText('Diff flame graphs are not supported')).toBeInTheDocument();
    expect(requestJev).not.toHaveBeenCalled();
  });
});

describe('flame graph overlays', () => {
  it('highlights exact source rows of a category, never other rows with the same name', async () => {
    answerWith({
      'handler>json.Marshal': { category: 'serialization', confidence: 0.92 },
      'worker>json.Marshal': { category: 'observability', confidence: 0.9 },
      'handler>compress': { category: 'crypto_compression', confidence: 0.95 },
      handler: { category: 'application_logic', confidence: 0.9 },
      worker: { category: 'application_logic', confidence: 0.99 },
    });
    const { body } = setup();
    await classify();
    const requests = jest.mocked(requestJev).mock.calls.length;

    expect(flameGraphProps()).toEqual(
      expect.objectContaining({ highlightedRows: undefined, disableCollapsing: false })
    );

    const serialization = screen.getByRole('button', { name: 'Serialization' });
    fireEvent.click(serialization);

    expect(serialization).toHaveAttribute('aria-pressed', 'true');
    expect([...flameGraphProps().highlightedRows!]).toEqual([2]);
    expect(flameGraphProps()).toEqual(expect.objectContaining({ data: nextFrame, disableCollapsing: true }));

    // The renderer redraws when the set identity changes, so unrelated updates must keep the same set.
    const highlighted = flameGraphProps().highlightedRows;
    const renders = jest.mocked(FlameGraph).mock.calls.length;
    act(() => body.state.semantic.closeDetails());
    expect(jest.mocked(FlameGraph).mock.calls.length).toBeGreaterThan(renders);
    expect(flameGraphProps().highlightedRows).toBe(highlighted);

    const application = within(screen.getByRole('group', { name: 'Function categories' })).getByRole('button', {
      name: 'Application code',
    });
    fireEvent.click(application);

    expect(serialization).toHaveAttribute('aria-pressed', 'false');
    expect([...flameGraphProps().highlightedRows!]).toEqual([1, 4]);

    fireEvent.mouseEnter(serialization);
    expect([...flameGraphProps().highlightedRows!]).toEqual([2]);
    expect(application).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseLeave(serialization);
    expect([...flameGraphProps().highlightedRows!]).toEqual([1, 4]);
    fireEvent.focus(serialization);
    expect([...flameGraphProps().highlightedRows!]).toEqual([2]);
    fireEvent.blur(serialization);
    expect([...flameGraphProps().highlightedRows!]).toEqual([1, 4]);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'All functions' }));
    expect(flameGraphProps().highlightedRows).toBeUndefined();
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'All functions' }));
    expect([...flameGraphProps().highlightedRows!]).toEqual([1, 4]);

    fireEvent.click(application);

    expect(flameGraphProps()).toEqual(
      expect.objectContaining({ highlightedRows: undefined, disableCollapsing: false })
    );
    fireEvent.click(screen.getByRole('button', { name: 'All functions' }));
    expect(jest.mocked(requestJev).mock.calls).toHaveLength(requests);
  });

  it('describes categories with localized copy instead of the model rubric', async () => {
    setup();
    await classify();

    act(() => screen.getByRole('button', { name: 'Serialization' }).focus());

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Parsing and encoding data formats such as JSON and protobuf.'
    );
    expect(document.body).not.toHaveTextContent(TAXONOMY.serialization);
    expect(within(screen.getByTestId('semantic-classification')).queryByText(/_/)).not.toBeInTheDocument();
  });

  it('describes one occurrence in hover tooltips only for source frames', async () => {
    setup();
    await classify();
    const tooltip = (frame: FlameGraphFrame) =>
      render(<>{flameGraphProps().getFrameTooltipContent!(frame)}</>).container.textContent;

    expect(tooltip({ kind: 'source', row: 2 })).toBe('Serialization · Confidence 0.92');
    expect(tooltip({ kind: 'source', row: 3 })).toBe('Unclassified · Crypto and compression · Confidence 0.44');
    expect(tooltip({ kind: 'source', row: 5 })).toBe('Unclassified · Confidence 0.95');
    expect(tooltip({ kind: 'source', row: 1 })).toBe('Unclassified');
    expect(tooltip({ kind: 'source', row: 4 })).toBe('Unclassified');
    expect(tooltip({ kind: 'source', row: 6 })).toBe('Unclassified');
    expect(tooltip({ kind: 'derived', rows: [3] })).toBe(
      'Classification is available for individual frames, not merged call contexts.'
    );
  });

  it('opens persistent details for a source frame from the context menu', async () => {
    setup();
    await classify();
    const menu = (frame?: FlameGraphFrame) =>
      flameGraphProps().getExtraContextMenuButtons!({} as never, nextFrame, { isDiff: false, search: '', frame });
    const open = (row: number) => act(() => menu({ kind: 'source', row }).at(-1)!.onClick());
    const details = () => screen.getByRole('region', { name: 'Classification details' });
    const fields = () =>
      Object.fromEntries(
        within(details())
          .getAllByRole('term')
          .map((term) => [term.textContent, term.nextElementSibling?.textContent])
      );

    expect(menu().map((b) => b.label)).toEqual(['Function details']);
    expect(menu({ kind: 'derived', rows: [3] }).map((b) => b.label)).toEqual(['Function details']);
    expect(menu({ kind: 'source', row: 3 }).map((b) => b.label)).toEqual([
      'Function details',
      'Classification details',
    ]);
    open(ROWS.length);
    expect(screen.queryByRole('region', { name: 'Classification details' })).not.toBeInTheDocument();

    open(3);

    expect(within(details()).getByText('compress')).toBeInTheDocument();
    expect(fields()).toEqual({
      Self: '20',
      'Called from': 'handler',
      Status: 'below 0.80, unclassified',
      'Suggested category': 'Crypto and compression',
      Confidence: '0.44',
    });
    expect(details()).toHaveTextContent('reported by the model, not a measure of validated accuracy');

    fireEvent.click(screen.getByRole('button', { name: 'Serialization' }));
    expect(details()).toBeInTheDocument();

    open(2);
    expect(fields()).toEqual(expect.objectContaining({ Status: 'applied', Confidence: '0.92' }));

    open(1);
    expect(fields()).toEqual({
      Self: '10',
      Status: 'request failed',
    });
    expect(details()).not.toHaveTextContent('Jev classification request failed.');

    fireEvent.click(within(details()).getByRole('button', { name: 'Close classification details' }));
    expect(screen.queryByRole('region', { name: 'Classification details' })).not.toBeInTheDocument();
  });

  it('moves focus to the details whenever they are opened, but not on unrelated updates', async () => {
    const pending = deferRequests();
    setup();
    await classify();
    await answer(pending[0]);
    const open = (row: number) =>
      act(() =>
        flameGraphProps().getExtraContextMenuButtons!({} as never, nextFrame, {
          isDiff: false,
          search: '',
          frame: { kind: 'source', row },
        })
          .at(-1)!
          .onClick()
      );
    const details = () => screen.getByRole('region', { name: 'Classification details' });
    const otherControl = screen.getByRole('button', { name: 'Cancel' });

    open(2);

    expect(details()).toHaveAttribute('tabindex', '-1');
    expect(details()).toHaveFocus();

    act(() => otherControl.focus());
    await answer(pending[1]);

    expect(otherControl).toHaveFocus();

    open(2);

    expect(details()).toHaveFocus();

    act(() => otherControl.focus());
    open(3);

    expect(within(details()).getByText('compress')).toBeInTheDocument();
    expect(details()).toHaveFocus();
  });
});

describe('lifecycle', () => {
  function expectNoOverlays() {
    expect(flameGraphProps()).toEqual(
      expect.objectContaining({
        highlightedRows: undefined,
        getFrameTooltipContent: undefined,
        disableCollapsing: false,
      })
    );
    expect(
      flameGraphProps().getExtraContextMenuButtons!({} as never, nextFrame, {
        isDiff: false,
        search: '',
        frame: { kind: 'source', row: 2 },
      }).map((b) => b.label)
    ).toEqual(['Function details']);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  }

  it('cancels an in-flight run, keeps settled results and ignores the late reply', async () => {
    const pending = deferRequests();
    setup();
    await classify();
    await answer(pending[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();

    expect(pending[1].signal.aborted).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Classification cancelled\. Remaining call contexts were skipped\.$/
    );
    expect(summaryRows()).toEqual([
      ['Serialization', '30', '30.0%'],
      ['No usable result', '60', '60.0%'],
      ['Missing profile detail', '10', '10.0%'],
    ]);

    await answer(pending[1]);

    expect(pending).toHaveLength(2);
    expect(summaryRows()[1]).toEqual(['No usable result', '60', '60.0%']);

    answerWith(ANSWERS);
    await classify();

    // Only the settled prediction was cached; the cancelled one is requested again.
    expect(
      jest
        .mocked(requestJev)
        .mock.calls.map(([body]) => evidencePath(body))
        .slice(2)
    ).toEqual(['worker>json.Marshal', 'handler>compress', 'handler']);
  });

  it('keeps Classify in place so a double click cannot cancel or restart a run', async () => {
    const pending = deferRequests();
    setup();
    await openPanel();
    await waitFor(() => expect(controls()).toEqual([['Classify', 'enabled']]));

    fireEvent.click(classifyButton());
    fireEvent.click(classifyButton());
    await flush();

    expect(pending).toHaveLength(1);
    expect(pending[0].signal.aborted).toBe(false);
    expect(controls()).toEqual([
      ['Classify', 'disabled'],
      ['Cancel', 'enabled'],
      ['Clear', 'disabled'],
    ]);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancel);
    fireEvent.click(cancel);
    await flush();

    expect(pending).toHaveLength(1);
    expect(controls()).toEqual([
      ['Classify', 'enabled'],
      ['Cancel', 'disabled'],
      ['Clear', 'enabled'],
    ]);
    expect(screen.getByTestId('semantic-classification').contains(cancel)).toBe(true);
  });

  it('clears results and restores standard rendering', async () => {
    setup();
    await classify();
    fireEvent.click(screen.getByRole('button', { name: 'Serialization' }));

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expectNoOverlays();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('abandons an in-flight run when the profile reloads and waits for a new click', async () => {
    const pending = deferRequests();
    const { emit } = setup();
    await classify();

    emit(nextFrame, LoadingState.Loading);

    expect(pending[0].signal.aborted).toBe(true);
    expect(screen.queryByText(/Classifying/)).not.toBeInTheDocument();

    nextFrame = profile(ROWS);
    emit(nextFrame);
    await answer(pending[0]);

    expectNoOverlays();
    expect(pending).toHaveLength(1);
    await openPanel();
    expect(classifyButton()).toBeEnabled();
  });

  it('never renders a replacement profile with the previous profile rows', async () => {
    const { emit } = setup();
    await classify();
    fireEvent.click(screen.getByRole('button', { name: 'Serialization' }));
    expect(flameGraphProps().highlightedRows).toBeDefined();

    const replacement = profile(ROWS);
    emit(replacement);

    const renders = jest.mocked(FlameGraph).mock.calls.filter(([props]) => props.data === replacement);
    expect(renders.length).toBeGreaterThan(0);
    renders.forEach(([props]) => {
      expect(props.highlightedRows).toBeUndefined();
      expect(props.getFrameTooltipContent).toBeUndefined();
    });
  });

  it('gates overlays by the exact rendered frame, loading state and query context', async () => {
    const { body, variables } = setup();
    await classify();
    fireEvent.click(screen.getByRole('button', { name: 'Serialization' }));
    const { semantic } = body.state;
    const overlay = (frame: DataFrame, loadingState: LoadingState) =>
      renderHook(() => semantic.useFlameGraphProps({ frame, loadingState })).result.current;

    expect(overlay(nextFrame, LoadingState.Done).highlightedRows).toEqual(new Set([2]));
    expect(overlay(profile(ROWS), LoadingState.Done).highlightedRows).toBeUndefined();
    expect(overlay(nextFrame, LoadingState.Loading).highlightedRows).toBeUndefined();

    // A context change the scene has not been notified about yet.
    variables.serviceName.setState({ value: 'other-svc' });

    expect(overlay(nextFrame, LoadingState.Done).getFrameTooltipContent).toBeUndefined();
  });

  it.each<[string, (view: ReturnType<typeof setup>) => void]>([
    ['data source', ({ variables }) => variables.dataSource.changeValueTo('ds-b')],
    ['service', ({ variables }) => variables.serviceName.changeValueTo('other-svc')],
    ['profile metric', ({ variables }) => variables.profileMetricId.changeValueTo(MEMORY)],
    ['filters', ({ variables }) => variables.filters.changeValueTo('pod="a"')],
    ['span selector', ({ variables }) => variables.spanSelector.changeValueTo('span-1')],
    ['profile ID selector', ({ variables }) => variables.profileIdSelector.changeValueTo('profile-1')],
    [
      'time range',
      ({ timeRange }) =>
        timeRange.onTimeRangeChange({ from: dateTime(0), to: dateTime(3_600_000), raw: { from: 'now-2h', to: 'now' } }),
    ],
    ['span time range', ({ body }) => body.setSpanTimeRange(1_767_225_600_000)],
  ])('abandons the run when the %s changes', async (_, change) => {
    const pending = deferRequests();
    const view = setup();
    await classify();

    act(() => change(view));

    expect(pending[0].signal.aborted).toBe(true);
    await answer(pending[0]);
    expect(pending).toHaveLength(1);
    expectNoOverlays();
  });

  it('abandons the run and its cache writes when the scene deactivates', async () => {
    const pending = deferRequests();
    const { body, unmount } = setup();
    await classify();

    unmount();

    expect(pending[0].signal.aborted).toBe(true);
    await answer(pending[0]);
    expect(body.state.semantic.state.job).toBeUndefined();

    answerWith(ANSWERS);
    setup();
    await classify();

    expect(evidencePath(jest.mocked(requestJev).mock.calls[1][0])).toBe('handler>json.Marshal');
  });

  it('ignores a configuration response that arrives after deactivation', async () => {
    const finish = delayConfiguration();
    const { body, unmount } = setup();

    unmount();
    await finish({ enabled: true, keyConfigured: true, confidenceThreshold: 0.1 });

    expect(body.state.semantic.state.availability).toBe('hidden');
    expect(body.state.semantic.state.confidenceThreshold).toBe(0.8);
  });

  it('does not reuse availability after an admin opts out and the scene reactivates', async () => {
    const { host, body, unmount } = setup();
    await openPanel();
    unmount();

    const finish = delayConfiguration();
    render(<host.Component model={host} />);
    await flush();

    expect(screen.getByTestId('flame-graph')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Function Classification' })).not.toBeInTheDocument();
    act(() => body.state.semantic.classify());
    expect(requestJev).not.toHaveBeenCalled();

    await finish({ enabled: false, keyConfigured: true });

    expect(screen.queryByRole('button', { name: 'Function Classification' })).not.toBeInTheDocument();
  });

  it('ignores a delayed configuration response from a replaced organization', async () => {
    const finish = delayConfiguration();
    const { body } = setup();
    await flush();

    config.bootData.user.orgId = orgId + 1000;
    await finish({ enabled: true, keyConfigured: true, confidenceThreshold: 0.1 });
    expect(body.state.semantic.state.confidenceThreshold).toBe(0.8);

    expect(screen.queryByRole('button', { name: 'Function Classification' })).not.toBeInTheDocument();
    act(() => body.state.semantic.classify());
    expect(requestJev).not.toHaveBeenCalled();
  });

  it.each<[string, () => void]>([
    ['the organization changes', () => (config.bootData.user.orgId = orgId + 1000)],
    ['admin access is revoked', () => jest.mocked(isJevAdmin).mockReturnValue(false)],
  ])('suppresses semantic UI and rejects classification when %s', async (_, revoke) => {
    const { body, emit } = setup();
    await classify();
    fireEvent.click(screen.getByRole('button', { name: 'Serialization' }));
    const requests = jest.mocked(requestJev).mock.calls.length;

    revoke();
    emit(nextFrame);

    expect(screen.queryByTestId('semantic-classification')).not.toBeInTheDocument();
    expectNoOverlays();
    act(() => body.state.semantic.classify());
    expect(requestJev).toHaveBeenCalledTimes(requests);
  });

  it('reuses predictions only in the organization and data source that requested them', async () => {
    const pending = deferRequests();
    const { host, emit, variables, unmount } = setup();
    const requestingOrg = orgId;
    await classify();

    // The run keeps the scope it started with, even if the organization changes while it is in flight.
    config.bootData.user.orgId = requestingOrg + 1000;
    for (let i = 0; i < 5; i++) {
      await act(async () => pending[i].resolve(jevReply({ category: 'io', confidence: 0.9 })));
    }
    // Settings are reloaded for the organization the scene reactivates in.
    let unmountCurrent = unmount;
    const reactivateIn = async (org: number) => {
      unmountCurrent();
      config.bootData.user.orgId = org;
      unmountCurrent = render(<host.Component model={host} />).unmount;
      await classify();
    };

    // Requests are sequential, so one new request shows the first prediction was not reused.
    await reactivateIn(requestingOrg + 1000);
    expect(pending).toHaveLength(6);

    await reactivateIn(requestingOrg);
    expect(pending).toHaveLength(6);
    expect(summaryRows()[0]).toEqual(['I/O', '90', '90.0%']);

    act(() => variables.dataSource.changeValueTo('ds-b'));
    nextFrame = profile(ROWS);
    emit(nextFrame);
    await classify();
    expect(pending).toHaveLength(7);
  });
});
