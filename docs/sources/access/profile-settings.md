---
description: Configure available settings for Profiles Drilldown.
keywords:
  - pyroscope
  - continuous profiling
  - settings
menuTitle: Profile settings
title: Profile settings
weight: 800
aliases:
  - /docs/grafana-cloud/monitor-applications/profiles/profile-settings/
---

# Profiles settings

The **Profiles settings** page lets you modify flame graph and function-details options used by Profiles Drilldown.

![The Profiles Settings page](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-settings-2-v1.17.0.png)

| Features                    | Options        | Explanation                                                                                                                                                                                                                                               |
| --------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Collapsed flame graphs**  | Default: Off   | When this feature is active, you can collapse flame graphs to minimize their screen space.                                                                                                                                                                |
| **Maximum number of nodes** | Default: 16384 | This setting controls the maximum number of nodes in the flame graph. Higher values render more detail and can increase rendering time.                                                                                                                   |
| **Enable function details** | Default: On    | Enables mapping of resource usage to lines of source code. If the [GitHub integration](https://grafana.com/docs/grafana-cloud/monitor-applications/profiles/pyroscope-github-integration/) is configured, then the source code is downloaded from GitHub. |

<!-- Commenting out flamegraph.com
| **Enable flamegraph.com**   | Default: On    | Adds a `flamegraph.com` export option to the **Export flame graph** menu. Flame graphs uploaded to `flamegraph.com` have a publicly accessible URL. Deactivate this option if data privacy is a concern.                                                  |
-->

## Modify settings

To change the settings for Profiles Drilldown:

1. Sign in to your Grafana instance.
1. Select **Drilldown** > **Profiles** in the left navigation.
1. Select **View/edit tenant settings** in the top toolbar.
   ![Access tenant settings from the Profiles toolbar](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-settings-icon-v1.17.0.png)
1. Change any options as desired.
1. Select **Save settings** to preserve the changes.

<!-- Commented out -- feature disabled for now

## Export flame graphs to flamegraph.com

You can export flame graphs using the **Export** option on any of the flame graph views.

To export a flame graph:

1. View a flame graph in **Explore** > **Profiles**.
1. Select the **Export** icon at the end of the toolbar.
   ![Available export options for the flame graph](/media/docs/grafana-cloud/profiles/profiles-export-flamegraph.png)
1. Choose an export option.
1. Save the file to your system. -->
