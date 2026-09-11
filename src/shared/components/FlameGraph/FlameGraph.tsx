import { createTheme } from '@grafana/data';
// TODO: Do not merge until grafana/grafana#132374 is merged, a new @grafana/flamegraph
// package is published, and the dependency is updated to include FunctionTable support.
// For local testing: "@grafana/flamegraph": "file:./grafana-flamegraph-local.tgz"
import { FunctionTable, FlameGraph as GrafanaFlameGraph, Props } from '@grafana/flamegraph';
import { useTheme2 } from '@grafana/ui';
import React, { memo, useMemo } from 'react';

import type { FlamebearerProfile } from '../../types/FlamebearerProfile';
import { ExportData } from './components/ExportData';
import { flamebearerToDataFrameDTO } from './domain/flamebearerToDataFrameDTO';

type FlameGraphProps = {
  profile: FlamebearerProfile;
  functionTable?: FunctionTable;
  diff?: boolean;
  vertical?: boolean;
  enableFlameGraphDotComExport?: boolean;
  collapsedFlamegraphs?: boolean;
  getExtraContextMenuButtons?: Props['getExtraContextMenuButtons'];
  showAnalyzeWithAssistant?: boolean;
};

function FlameGraphComponent({
  profile,
  functionTable,
  diff,
  vertical,
  enableFlameGraphDotComExport,
  collapsedFlamegraphs,
  getExtraContextMenuButtons,
  showAnalyzeWithAssistant,
}: FlameGraphProps) {
  const { isLight } = useTheme2();
  const getTheme = () => createTheme({ colors: { mode: isLight ? 'light' : 'dark' } });

  const dataFrame = useMemo(
    () =>
      flamebearerToDataFrameDTO(
        profile.flamebearer.levels,
        profile.flamebearer.names,
        profile.metadata.units,
        Boolean(diff)
      ),
    [profile, diff]
  );

  return (
    <GrafanaFlameGraph
      data={dataFrame as any}
      functionTable={functionTable}
      disableCollapsing={!collapsedFlamegraphs}
      extraHeaderElements={<ExportData profile={profile} enableFlameGraphDotComExport={enableFlameGraphDotComExport} />}
      vertical={vertical}
      getTheme={getTheme as any}
      getExtraContextMenuButtons={getExtraContextMenuButtons}
      keepFocusOnDataChange
      showAnalyzeWithAssistant={showAnalyzeWithAssistant}
      enableNewUI={true}
    />
  );
}

export const FlameGraph = memo(FlameGraphComponent);
