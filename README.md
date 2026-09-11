# Grafana Profiles Drilldown

Grafana Profiles Drilldown is a native Grafana application designed to integrate seamlessly with [Pyroscope](https://github.com/grafana/pyroscope), the open-source continuous profiling platform, providing a smooth, query-less experience for browsing and analyzing profiling data.

![Grafana Profiles Drilldown flame graph](https://grafana.com/media/docs/explore-profiles/explore-profiles-flamegraph.png)

## Install Profiles Drilldown

Profiles Drilldown is distributed as a Grafana Plugin. You can find it in the official [Grafana Plugin Directory](https://grafana.com/grafana/plugins/grafana-pyroscope-app/).

### Install in [Grafana Cloud](https://grafana.com/products/cloud/)

All Grafana instances come with Profiles Drilldown plugin preinstalled.

## Get started

1. In the main navigation bar, click on **Drilldown** > **Profiles**.
2. You’ll land in the **All services** overview that shows time series and CPU utilization visualizations for all the services in your selected Pyroscope instance.
3. If needed, change your data source with the drop-down on the top left.
4. Modify your time range in two ways:

   - Use the standard time range picker on the top right.
   - Click and drag the time range you want to see on any time series visualization.

5. Select the service you would like to explore by selecting **Profile types** on any time series visualization. This takes you to the **Profile types** overview for that service.
6. Select the profile type you would like to explore by selecting **Flame graph** on any time series visualization.
7. View the flame graph.

For more information, refer to the Profiles Drilldown documentation in [Grafana](https://grafana.com/docs/grafana/latest/explore/simplified-exploration/profiles/) or [Grafana Cloud](https://grafana.com/docs/grafana-cloud/visualizations/simplified-exploration/profiles/).

To learn more about contributing to the documentation, refer to the [README](https://github.com/grafana/profiles-drilldown/blob/main/docs/README.md).
The Profiles Drilldown documentation source files are in docs/sources.

### Development / Contributing

Check out our [Contributing Guidelines](./CONTRIBUTING.md) for more information on how to contribute to this project.
