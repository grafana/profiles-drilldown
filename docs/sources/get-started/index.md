---
description: Learn how to get started with Profiles Drilldown
canonical: https://grafana.com/docs/grafana/latest/explore/simplified-exploration/profiles/get-started/
keywords:
  - Profiles Drilldown
  - Concepts
title: Get started with Profiles Drilldown
menuTitle: Get started
weight: 300
---

# Get started with Profiles Drilldown

Profiles can help you identify errors in your apps and services.
Using this information, you can optimize and streamline your apps.

Your investigation begins with the big picture and then drills down using profile types, labels, and flame graphs to explore your data. To learn more, refer to [Concepts](../concepts/).

<!-- Needs to be updated - {{< youtube id="_8SbNN5DRmQ" >}} -->

{{< admonition type="note" >}}
Expand your observability journey and learn about [Explore Traces](https://grafana.com/docs/grafana-cloud/visualizations/simplified-exploration/traces/).
{{< /admonition >}}

## Before you begin

To use Profiles Drilldown with Grafana Cloud, you need:

- A Grafana Cloud account
- A Grafana stack in Grafana Cloud with a configured Hosted profiles or Pyroscope data source

To use Profiles Drilldown with Grafana open source, you need:

- Grafana 11.6.11 or later
- Your own Grafana instance
- Grafana v12 and later includes all Grafana Drilldown apps by default. For Grafana 11.6.11 through 11.x, install the [Profiles Drilldown plugin](https://grafana.com/grafana/plugins/grafana-pyroscope-app/).
- A configured Pyroscope data source

## Explore your profile data

Most investigations follow four general steps:

![Steps for exploring your profiling data](/media/docs/explore-profiles/explore-profiles-steps.svg)

1. [Determine your use case](../determine-use-case/).
1. [Choose a view](../choose-a-view/).
1. [Investigate trends and spikes](../investigate/).
1. Identify issues as a result of your investigation.

{{< docs/play title="the Grafana Play site" url="https://play.grafana.org/a/grafana-pyroscope-app/profiles-explorer" >}}
