import { DataFrame, LoadingState } from '@grafana/data';
import { FlameGraphFrame, Props as FlameGraphProps } from '@grafana/flamegraph';
import { t } from '@grafana/i18n';
import { config } from '@grafana/runtime';
import { sceneGraph, SceneObjectBase, SceneObjectState, VariableDependencyConfig } from '@grafana/scenes';
import { CONFIDENCE_THRESHOLD, KnownCategory } from '@shared/domain/semantic/jevRubric';
import { normalizeFlameGraph } from '@shared/domain/semantic/normalizeFlameGraph';
import { planClassification, SemanticPlan } from '@shared/domain/semantic/planClassification';
import { resolveClassification, SemanticClassification } from '@shared/domain/semantic/resolveClassification';
import { ClassificationRun, pendingRun, runClassification } from '@shared/domain/semantic/runClassification';
import PROFILE_METRICS from '@shared/infrastructure/profile-metrics/profile-metrics.json';
import { isJevAdmin, loadJevConfiguration, requestJev } from '@shared/infrastructure/semantic/jevProxy';
import { predictionStore } from '@shared/infrastructure/semantic/predictionCache';
import React, { useMemo } from 'react';
import { Subscription } from 'rxjs';

import { getSceneVariableValue } from '../../../../helpers/getSceneVariableValue';
import { SemanticFrameTooltip } from './ui/SemanticOccurrence';

type Availability = 'hidden' | 'ready' | 'missing-key' | 'error';

interface SemanticInput {
  readonly frame: DataFrame;
  readonly context: string;
}

export interface SemanticJob {
  readonly input: SemanticInput;
  readonly run?: ClassificationRun;
  readonly classification?: SemanticClassification;
  /** Why the profile could not be classified. */
  readonly error?: string;
}

interface SceneSemanticClassificationState extends SceneObjectState {
  availability: Availability;
  confidenceThreshold: number;
  /** Organization whose settings produced `availability`. */
  availabilityOrgId?: number;
  job?: SemanticJob;
  category?: KnownCategory;
  previewCategory?: KnownCategory | 'all';
  /** A new object per request, so reopening the same row moves focus to the details again. */
  details?: { readonly row: number };
}

export interface RenderedProfile {
  frame?: DataFrame;
  loadingState?: LoadingState;
}

type ContextMenuButtons = ReturnType<NonNullable<FlameGraphProps['getExtraContextMenuButtons']>>;

interface SemanticFlameGraphProps {
  highlightedRows?: ReadonlySet<number>;
  getFrameTooltipContent?: FlameGraphProps['getFrameTooltipContent'];
  getContextMenuButtons: (frame?: FlameGraphFrame) => ContextMenuButtons;
}

const NO_FLAME_GRAPH_PROPS: SemanticFlameGraphProps = { getContextMenuButtons: () => [] };

const CONTEXT_VARIABLES = [
  'dataSource',
  'serviceName',
  'profileMetricId',
  'filters',
  'spanSelector',
  'profileIdSelector',
];

/**
 * Explicit, admin-only Jev classification of the CPU profile rendered by the parent flame graph. The parent activates
 * it; results are bound to the exact DataFrame and query context they were computed for.
 */
export class SceneSemanticClassification extends SceneObjectBase<SceneSemanticClassificationState> {
  protected _variableDependency = new VariableDependencyConfig(this, {
    variableNames: CONTEXT_VARIABLES,
    onReferencedVariableValueChanged: () => this.clear(),
  });

  private controller?: AbortController;
  private availabilityRequest = 0;

  constructor() {
    super({
      key: 'semantic-classification',
      availability: 'hidden',
      confidenceThreshold: CONFIDENCE_THRESHOLD,
    });
    this.addActivationHandler(this.onActivate.bind(this));
  }

  private onActivate() {
    this.loadAvailability();
    let inputs = new Subscription();
    const followInputs = () => {
      inputs.unsubscribe();
      inputs = new Subscription();
      inputs.add(sceneGraph.getData(this).subscribeToState(() => this.clearIfStale()));
      inputs.add(sceneGraph.getTimeRange(this).subscribeToState(() => this.clearIfStale()));
      this.clearIfStale();
    };
    followInputs();
    // The parent replaces its data provider and time range when span or node limits change.
    const parentSubscription = this.parent?.subscribeToState((next, prev) => {
      if (next.$data !== prev.$data || next.$timeRange !== prev.$timeRange) {
        followInputs();
      }
    });
    return () => {
      parentSubscription?.unsubscribe();
      inputs.unsubscribe();
      this.availabilityRequest++;
      this.clear();
    };
  }

  private async loadAvailability() {
    const request = ++this.availabilityRequest;
    const orgId = config.bootData.user.orgId;
    this.setState({ availability: 'hidden', availabilityOrgId: undefined, confidenceThreshold: CONFIDENCE_THRESHOLD });
    if (!isJevAdmin()) {
      return;
    }
    const state = await loadJevConfiguration().then(
      ({ enabled, keyConfigured, confidenceThreshold }) => {
        const availability: Availability = enabled ? (keyConfigured ? 'ready' : 'missing-key') : 'hidden';
        return { availability, confidenceThreshold };
      },
      () => ({ availability: 'error' as const, confidenceThreshold: CONFIDENCE_THRESHOLD })
    );
    if (request === this.availabilityRequest && orgId === config.bootData.user.orgId) {
      this.setState({ ...state, availabilityOrgId: orgId });
    }
  }

  /** Hidden unless the settings were loaded for the current organization and the user is still its admin. */
  availability(): Availability {
    const { availability, availabilityOrgId } = this.state;
    return availabilityOrgId === config.bootData.user.orgId && isJevAdmin() ? availability : 'hidden';
  }

  private context(): string {
    const { from, to } = sceneGraph.getTimeRange(this).state.value;
    return JSON.stringify([
      config.bootData.user.orgId,
      ...CONTEXT_VARIABLES.map((name) => sceneGraph.lookupVariable(name, this)?.getValue() ?? null),
      from.valueOf(),
      to.valueOf(),
    ]);
  }

  current({ frame, loadingState }: RenderedProfile): SemanticJob | undefined {
    const { job } = this.state;
    const matches = job?.input.frame === frame && loadingState === LoadingState.Done;
    const authorized = this.availability() === 'ready';
    return authorized && matches && job?.input.context === this.context() ? job : undefined;
  }

  private clearIfStale() {
    const { data } = sceneGraph.getData(this).state;
    const rendered = { frame: data?.series?.[0], loadingState: data?.state };
    if (this.state.job && !this.current(rendered)) {
      this.clear();
    }
  }

  /** Stops the run; results settled so far stay visible. */
  cancel() {
    this.controller?.abort();
  }

  clear() {
    this.controller?.abort();
    this.controller = undefined;
    this.setState({
      job: undefined,
      category: undefined,
      previewCategory: undefined,
      details: undefined,
    });
  }

  unavailableReason({ frame, loadingState }: RenderedProfile): string | undefined {
    const availability = this.availability();
    if (availability === 'missing-key') {
      return t(
        'semantic.classify.missing-key',
        'Add an OpenRouter API key in the plugin configuration to enable classification.'
      );
    }
    if (availability === 'error') {
      return t('semantic.classify.configuration-error', 'Classification settings could not be loaded.');
    }
    if (!isCpuProfileMetric(getSceneVariableValue(this, 'profileMetricId'))) {
      return t('semantic.classify.unsupported-profile', 'Classification is not available for this profile type yet.');
    }
    if (!getSceneVariableValue(this, 'serviceName')?.trim()) {
      return t('semantic.classify.no-service', 'Select a service to classify.');
    }
    if (loadingState !== LoadingState.Done || !frame) {
      return t('semantic.classify.not-loaded', 'Available once the profile has loaded.');
    }
    return undefined;
  }

  classify() {
    const { data } = sceneGraph.getData(this).state;
    const frame = data?.series?.[0];
    if (!frame || this.availability() !== 'ready') {
      return;
    }
    if (this.unavailableReason({ frame, loadingState: data?.state })) {
      return;
    }
    const input = { frame, context: this.context() };
    this.clear();
    try {
      this.start(
        input,
        planClassification(normalizeFlameGraph(input.frame), Infinity, getSceneVariableValue(this, 'serviceName'))
      );
    } catch (error) {
      this.setState({ job: { input, error: error instanceof Error ? error.message : String(error) } });
    }
  }

  private start(input: SemanticInput, plan: SemanticPlan) {
    const { confidenceThreshold } = this.state;
    const controller = new AbortController();
    this.controller = controller;
    const show = (run: ClassificationRun) => {
      if (this.controller === controller) {
        this.setState({ job: { input, run, classification: resolveClassification(run, confidenceThreshold) } });
      }
    };
    // Captured now so in-flight work cannot write into a later organization or data source.
    const scope = { orgId: config.bootData.user.orgId, datasourceUid: getSceneVariableValue(this, 'dataSource') };
    show(pendingRun(plan));
    runClassification(plan, {
      batchSize: 32,
      concurrency: 8,
      transport: (body, signal) => requestJev(body, signal, scope.orgId),
      signal: controller.signal,
      cache: predictionStore.scoped(scope, controller.signal),
      onProgress: show,
    }).then(show);
  }

  selectCategory(category?: KnownCategory) {
    this.setState({ category });
  }

  previewCategory(previewCategory?: KnownCategory | 'all') {
    this.setState({ previewCategory });
  }

  private showDetails(input: SemanticInput, row: number) {
    const { job } = this.state;
    if (job?.input === input && job.classification?.decisions[row]) {
      this.setState({ details: { row } });
    }
  }

  closeDetails() {
    this.setState({ details: undefined });
  }

  useFlameGraphProps(rendered: RenderedProfile): SemanticFlameGraphProps {
    const { category, previewCategory } = this.useState();
    const job = this.current(rendered);
    const classification = job?.classification;
    const activeCategory = previewCategory === 'all' ? undefined : previewCategory ?? category;
    const highlightedRows = useMemo(() => highlight(classification, activeCategory), [classification, activeCategory]);
    return useMemo(() => {
      if (!job || !classification) {
        return NO_FLAME_GRAPH_PROPS;
      }
      return {
        highlightedRows,
        getFrameTooltipContent: (frame) => <SemanticFrameTooltip frame={frame} classification={classification} />,
        getContextMenuButtons: (frame) =>
          frame?.kind === 'source'
            ? [
                {
                  label: t('semantic.context-menu.details', 'Classification details'),
                  icon: 'info-circle',
                  onClick: () => this.showDetails(job.input, frame.row),
                },
              ]
            : [],
      };
    }, [job, classification, highlightedRows]);
  }
}

function highlight(
  classification: SemanticClassification | undefined,
  category: KnownCategory | undefined
): ReadonlySet<number> | undefined {
  if (!classification || !category) {
    return undefined;
  }
  const rows = new Set<number>();
  classification.decisions.forEach((decision, row) => {
    if (decision.status === 'accepted' && decision.prediction.category === category) {
      rows.add(row);
    }
  });
  return rows;
}

function isCpuProfileMetric(profileMetricId: string): boolean {
  return (PROFILE_METRICS as Record<string, { group: string }>)[profileMetricId]?.group === 'process_cpu';
}
