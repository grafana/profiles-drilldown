---
description: Investigate trends and spikes to identify issues.
canonical: https://grafana.com/docs/grafana/latest/explore/simplified-exploration/profiles/investigate/
keywords:
  - Profiles Drilldown
  - Concepts
title: Investigate trends and spikes
menuTitle: Investigate trends and spikes
weight: 600
---

# Investigate trends and spikes

Grafana Profiles Drilldown provides powerful tools that help you identify and analyze problems in your applications and services.

Using these steps, you can use the profile data to investigate issues.

{{< docs/play title="the Grafana Play site" url="https://play.grafana.org/a/grafana-pyroscope-app/profiles-explorer" >}}

## Explore your profile data

When you use Profiles Drilldown, your investigations usually follow these steps.

1. Verify your data source in the **Data source** drop-down.
1. Choose an **Exploration** tab. **All services** is selected by default. Learn about the [available views](../choose-a-view/).

   ![The All services view](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-homescreen-v1.17.0.png)

1. Look for spikes or trends in services to identify where to investigate. Use the **Profile type** drop-down to change profile metrics.

   ![Select a profile type](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-select-profile-v1.17.0.png)

1. After you identify the service to explore, you can change views:

   - Select **Profile types** to review profile metrics for a service.
   - Select **Labels** to view labels for a service and refine the scope of your investigation.
   - Select **Flame graph** to view the flame graph for a service.

     ![Select an Exploration type to begin](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-exploration-bar-v1.17.0.png)

1. Optional: Select filters to focus on problem areas. Each filter is added to the filter expression near the top of the page. You can add filters in the following ways:

   - Use filter selectors in the filter bar to add labels and operators.
   - In **Labels** view, use **Include** or **Exclude** on areas of interest.

   If **Labels** view shows no data, select a different service, profile type, or group-by label.

   ![Add filters](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-labels-include-exclude-v1.17.0.png)

1. Optional: Click and drag on a chart to zoom to a smaller time range.
1. To compare two flame graphs, open **Diff flame graph**.

   - Configure **Baseline** and **Comparison** using time range selectors, label filters, and chart range selection.
   - Use **Auto-select** or choose a comparison preset to speed up setup.

     ![Labels view](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-labels-compare-v1.17.0.png)

1. Use **Diff flame graph** to compare where relative time share changes between baseline and comparison, and then drill into functions to identify likely causes.

   ![Viewing a flame graph during an investigation](/media/docs/explore-profiles/v1.17.0/profiles-drilldown-diff-flamegraph-v1.17.0.png)

## Drill down to an individual profile

While flame graphs show an aggregate of all profiles in the selected time range, you may want to inspect the exact profile behind a spike. Exemplars are individual profiles shown as markers on the timeseries panel. They let you go from an aggregated view to a specific individual profile.

1. Navigate to the **Flame graph** or **Labels** view for your service. Exemplars are enabled by default in these views. In other views with a timeseries panel, select the **Exemplars** toggle in the panel header to enable them.
1. Each diamond marker on the timeseries represents an individual profile.

   ![Timeseries panel with Exemplars enabled showing diamond markers on the chart](/media/docs/explore-profiles/explore-profiles-exemplars-timeseries.png)

1. Click an exemplar marker to view its details, including the profile ID, value, timestamp, and associated labels such as pod, namespace, and cluster.

   ![Exemplar popover showing profile details and labels](/media/docs/explore-profiles/explore-profiles-exemplar-details.png)

1. Select **View profile** in the exemplar popover. The flame graph updates to show only that single individual profile. A **profile id selector** tag appears above the flame graph confirming your selection.
1. To return to the aggregated flame graph, click **X** on the profile id selector tag.

## Move from profiles to traces

{{< docs/public-preview product="Profiles to Traces" >}}

When your profiles include span-level exemplars, you can use the span heatmap in the **Flame graph** view to move from a profile to the trace that produced it.

1. Select the **Flame graph** view for your service.
1. Use the **Profile timeline visualization** toggle to select **Span heatmap**. If no span profiles are available for the current service, filters, and time range, this option is unavailable.
1. Select a **Tempo data source** to load trace details.
1. In the **Top span exemplars** table, find the span you want to inspect using the span name, duration, or timestamp.
1. For that span, select one of the following:

   - **Open flame graph** to view the flame graph for the single span.
   - **Open trace** to view the associated trace from your Tempo data source.

## Common tools during investigations

In the Profiles toolbar, you can also use these features while investigating:

- **Upload ad hoc profiles** to load profile data for one-off analysis. The ad hoc view provides a **Single view** to inspect one uploaded profile and a **Diff view** to compare two uploaded profiles. In the diff view, select **Side by side** to show each profile in its own flame graph, or **Diff flamegraph** to show a computed difference. To compute a difference, the two profiles must share a common profile type.
- **Copy shareable link** to capture the current investigation state and share it with teammates.
- **View/edit tenant settings** to adjust settings such as collapsed flame graphs, function details, and maximum node count.

### Add a time series panel to a dashboard

You can save a time series visualization from Profiles Drilldown to a Grafana dashboard to monitor it alongside your other observability data.

1. Hover over a time series panel and open the panel menu.
1. Select **Add to dashboard**.
1. Choose an existing dashboard or create a new one, then save.

### Save and reuse searches

When you apply filters, you can save the current search and return to it later. A saved search captures the data source, profile type, and filters.

1. Apply one or more filters.
1. Select **Save in Saved queries** and enter a title and an optional description.
1. To reuse a saved search, select **Load Saved query** and choose one from the list.

When the Grafana query library is available, searches are saved to the shared **Saved queries** library. When it isn't available, these actions appear as **Save search** and **Load saved search**, and searches are stored locally in your browser and only available on that device.
