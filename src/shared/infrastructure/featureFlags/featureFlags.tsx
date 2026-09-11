import type { FeatureToggles } from '@grafana/data';
import { useBooleanFlagDetails } from '@openfeature/react-sdk';

import { getPluginOpenFeatureBoolean } from './openFeature';

/**
 * Grafana registry-backed flags via OpenFeature. Call sites must sit under
 * `OpenFeaturePluginScope` from `./openFeature`.
 *
 * @see https://github.com/grafana/grafana/blob/main/contribute/feature-toggles.md
 */
const metricsFromProfilesKey = 'metricsFromProfiles' as keyof FeatureToggles;
const grafanaAssistantInProfilesDrilldownKey = 'grafanaAssistantInProfilesDrilldown' as keyof FeatureToggles;
const profilesHeatmapKey = 'profilesHeatmap' as keyof FeatureToggles;
export const QUERY_LIBRARY_FEATURE_FLAG_KEY = 'queryLibrary' as const;
const queryLibraryKey: keyof FeatureToggles = QUERY_LIBRARY_FEATURE_FLAG_KEY;
const kgAnnotationsInPyroscopeKey = 'kgAnnotationsInPyroscope' as keyof FeatureToggles;
const feedbackButtonKey = 'feedbackButton' as keyof FeatureToggles;

export function useFlagMetricsFromProfiles(): boolean {
  return useBooleanFlagDetails(metricsFromProfilesKey, false).value;
}

export function useFlagGrafanaAssistantInProfilesDrilldown(): boolean {
  return useBooleanFlagDetails(grafanaAssistantInProfilesDrilldownKey, true).value;
}

export function useFlagFeedbackButton(): boolean {
  return useBooleanFlagDetails(feedbackButtonKey, true).value;
}

export function getProfilesHeatmapFromOpenFeature(): boolean {
  return getPluginOpenFeatureBoolean(profilesHeatmapKey, false);
}

export function getQueryLibraryFromOpenFeature(): boolean {
  return getPluginOpenFeatureBoolean(queryLibraryKey, false);
}

export function getKgAnnotationsInPyroscopeFromOpenFeature(): boolean {
  return getPluginOpenFeatureBoolean(kgAnnotationsInPyroscopeKey, false);
}
