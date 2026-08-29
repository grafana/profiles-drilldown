---
description: Choose a view that best suits what you need to investigate.
canonical: https://grafana.com/docs/grafana/latest/explore/simplified-exploration/profiles/choose-a-view/
keywords:
  - Profiles Drilldown
  - Concepts
title: Choose a view
menuTitle: Choose a view
weight: 500
---

# Choose a view

The available views in Grafana Profiles Drilldown correspond to how you move through your data: from broader to more specific.
For example, you can start with **All services** and then move to **Profile types** or **Labels** for more specific views into your data.

This matches the hierarchy of the [profiling data](../concepts/).

After you choose a view, you can [Investigate trends and spikes](../investigate/).

## Select a view

Select a view by choosing an **Exploration** tab: **All services**, **Profile types**, **Labels**, **Flame graph**, **Diff flame graph**, or **Favorites**.

<!-- screenshots need to be updated -->

![Select an Exploration type to begin](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-exploration-bar-v1.17.0.png)

You can refine a selected view by selecting a service, profile type, label, or flame graph from one of the charts.
Click and drag on an area of interest to see more detail.

## Available views

Determining which view to use frames the rest of your investigation.

<!-- Uses HTML table because of bulleted lists in table cells. -->
<table>
  <tr>
   <td>View
   </td>
   <td>What it shows
   </td>
   <td>Used for
   </td>
  </tr>
  <tr>
   <td>All services
   </td>
   <td>Overview of all services for any given profile metric
   </td>
   <td>
<ul>

<li>Reviewing all the services that are being profiled

<li>Finding an anomalous service out of all services (or set of related services) by profile type
</li>
</ul>
   </td>
  </tr>
  <tr>
   <td>Profile types
   </td>
   <td>Overview of all the profile metrics for a single service
   </td>
   <td>
<ul>

<li>Analyzing the performance of a single service across all profile types

<li>Finding relations of profile metric spikes across profile types (or discovering an anomalous metric)
</li>
</ul>
   </td>
  </tr>
  <tr>
   <td>Labels
   </td>
   <td>Single service label exploration and filtering
   </td>
   <td>
<ul>

<li>Analyzing profiling metrics of a single service and profiling type across all label dimensions

<li>Discovering anomalous profiling metrics by label
</li>
</ul>
   </td>
  </tr>
<tr>
  <td>Flame graph
   </td>
   <td>Single service flame graph
   </td>
   <td>
<ul>

<li>Analyze the flame graph of a particular service, profile type, and label selection

<li>Use tools like **Analyze with Assistant** (Grafana Cloud) or **Explain Flame Graph** (Grafana open source), GitHub code view, and function details to get deeper insights into performance.

<li>Enable **Exemplars** to see individual profile markers on the timeseries and click one to inspect a single individual profile.
</li>
</ul>
   </td>
  </tr>
<tr>
  <td>Diff flame graph
   </td>
   <td>Compare the differences between two flame graphs
   </td>
   <td>
<ul>

<li>Compare queries that may have different total amounts of time spent in each function

</ul>
   </td>
  </tr>
  <tr>
   <td>Favorites
   </td>
   <td>List of visualizations saved as favorites
   </td>
   <td>
<ul>

<li>Save frequently accessed panels for quick access
</li>
</ul>
   </td>
  </tr>
</table>

## Exploration type examples

### All services view

The **All services** view is the default view when you first open Profiles Drilldown.

Use the **Filters** bar to narrow the services shown in this view. When you open a service in the **Flame graph** view, the filters you set here are applied there too, so you can keep exploring without losing your place. Your **All services** filters stay in place when you return. These filters apply only to the **All services** view, not to the **Labels** or **Diff flame graph** views.

![The All services view](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-homescreen-v1.17.0.png)

### Profile types

The **Profile types** view shows one chart for each profile type available for the selected service.
You can select to display the charts in a grid or one chart per row.

![Profile types](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-profile-types-v1.17.0.png)

### Labels

The Labels view lets you navigate and analyze performance data through labels.
This feature is crucial for identifying performance anomalies and understanding the behavior of different application segments under various conditions.

![Labels view](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-labels-v1.17.0.png)

### Flame graphs

The Flame graph view visualizes profiling data of a single service in a flame graph format, helping you identify resource-intensive functions.

On views with a flame graph, you can use **Analyze with Assistant** (Grafana Cloud) or **Explain Flame Graph** (Grafana open source) to get an AI-generated analysis of bottlenecks, likely root causes, and recommended fixes.
For more information, refer to [Flame graph AI](../investigate/flame-graph-ai/).

You can also use line-level insights from the [GitHub integration](https://grafana.com/docs/grafana-cloud/monitor-applications/profiles/pyroscope-github-integration/).

In this view, you can also:

- Search for functions in the flame graph.
- Change the color scheme.
- Expand or collapse all call stacks.
- Toggle between the top table, flame graph, and call tree, or show a combination of views.
- Export profile data.

![Flame graphs](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-flamegraph-2-v1.17.0.png)

#### Profiles to Traces

{{< docs/public-preview product="Profiles to Traces" >}}

In the **Flame graph** view, use the **Profile timeline visualization** toggle to switch between **Time series** and **Span heatmap**.
The span heatmap plots span-level profile exemplars, so you can move from aggregated profiles to the individual spans and traces behind them.

Select a Tempo data source to load trace details.
From the **Top span exemplars** table, you can **Open flame graph** to view the flame graph for a single span, or **Open trace** to view the associated trace from your Tempo data source.

For the steps to use the span heatmap, refer to [Investigate trends and spikes](../investigate/#move-from-profiles-to-traces).

### Diff flame graph

The **Diff flame graph** view shows the differences between two profiling datasets.
It normalizes the data by comparing the percentage of total time spent in each function so that the resulting flame graph is comparing the share of time spent in each function rather than the absolute amount of time spent in each function.
This lets you compare two different queries that may have different total amounts of time spent in each function.

Similar to a `git diff`, it takes the selected flame graphs and highlights the differences between them.

To configure comparisons more quickly, you can use:

- **Auto-select** to choose a comparison range automatically.
- **Comparison presets** to apply saved or predefined comparisons.
- **Sync time ranges** to keep baseline and comparison windows aligned.

![Diff flame graph](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-diff-flamegraph-v1.17.0.png)

<!-- from old screenshot of cpu usage profile Red represents an increase in CPU usage from the baseline to the comparison and green represents a decrease. -->

### Favorites

The **Favorites** view shows all your saved favorite visualizations.
Clicking on the star (⭐️) at the top-right corner of a visualization saves it as a favorite.

Using favorites, you can create an overview of what's important, as well as jump to the **Flame graph** view or the **Labels** view.

In this view, you can also use:

- **Quick filter** to find saved items.
- **Grid** or **Rows** layout options.
- **Hide panels without data** to simplify the display.

![Favorites](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-favorites-v1.17.0.png)
