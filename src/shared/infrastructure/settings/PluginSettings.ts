export type PluginSettings = {
  collapsedFlamegraphs: boolean;
  maxNodes: number;
  enableFlameGraphDotComExport: boolean;
  enableFunctionDetails: boolean;
  enableMetricsFromProfiles?: boolean;
  progressiveFlamegraphs?: boolean;
};

export const DEFAULT_SETTINGS: PluginSettings = Object.freeze({
  collapsedFlamegraphs: false,
  maxNodes: 16384,
  enableFlameGraphDotComExport: true,
  enableFunctionDetails: true,
  enableMetricsFromProfiles: false,
  progressiveFlamegraphs: true,
});
