---
description: Access or install Profiles Drilldown.
canonical: https://grafana.com/docs/grafana/latest/explore/simplified-exploration/profiles/access/
keywords:
  - Install
  - Configure
  - Profiles Drilldown
title: Access or install Profiles Drilldown
menuTitle: Access or install
weight: 150
refs:
  pyroscope-data-source:
    - pattern: /docs/grafana/
      destination: /docs/grafana/<GRAFANA_VERSION>/datasources/pyroscope/
    - pattern: /docs/grafana-cloud/
      destination: /docs/grafana-cloud/connect-externally-hosted/data-sources/pyroscope/
---

# Access Profiles Drilldown

Grafana Profiles Drilldown is a native Grafana application designed to integrate seamlessly with [Pyroscope](https://github.com/grafana/pyroscope), the open source continuous profiling platform, providing a smooth, queryless experience for browsing and analyzing profiling data.

You can use Profiles Drilldown in Grafana Cloud or in your own Grafana instance.

## Before you begin

To use Profiles Drilldown with Grafana Cloud, you need:

- A Grafana Cloud account
- A Grafana stack in Grafana Cloud with a configured Hosted profiles or [Pyroscope data source](ref:pyroscope-data-source)

To use Profiles Drilldown with Grafana open source or Grafana Enterprise, you need:

- Grafana 13.1.0 or later
- Your own Grafana instance
- A configured [Pyroscope data source](ref:pyroscope-data-source)

## Install the Profiles Drilldown plugin

Profiles Drilldown is distributed as a Grafana Plugin.
You can find it in the official [Grafana Plugin Directory](https://grafana.com/grafana/plugins/grafana-pyroscope-app/).

{{< admonition type="note" >}}
Grafana 13.1.0 and later includes all Grafana Drilldown apps by default, so no plugin installation is required.
{{< /admonition >}}
