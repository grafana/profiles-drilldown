import { createTheme } from '@grafana/data';
import { FlameGraph as GrafanaFlameGraph, Props } from '@grafana/flamegraph';
import { useTheme2 } from '@grafana/ui';
import React, { memo, useMemo } from 'react';

import type { FlamebearerProfile } from '../../types/FlamebearerProfile';
import { ExportData } from './components/ExportData';
import { flamebearerToDataFrameDTO } from './domain/flamebearerToDataFrameDTO';

type FlameGraphProps = {
  profile: FlamebearerProfile;
  diff?: boolean;
  vertical?: boolean;
  enableFlameGraphDotComExport?: boolean;
  onCopyGcxCommands?: () => void | Promise<void>;
  collapsedFlamegraphs?: boolean;
  getExtraContextMenuButtons?: Props['getExtraContextMenuButtons'];
  showAnalyzeWithAssistant?: boolean;
};

function FlameGraphComponent({
  profile,
  diff,
  vertical,
  enableFlameGraphDotComExport,
  onCopyGcxCommands,
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
      disableCollapsing={!collapsedFlamegraphs}
      extraHeaderElements={
        <ExportData
          profile={profile}
          enableFlameGraphDotComExport={enableFlameGraphDotComExport}
          onCopyGcxCommands={onCopyGcxCommands}
        />
      }
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
