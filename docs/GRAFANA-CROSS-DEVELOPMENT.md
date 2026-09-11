# Developing the Grafana Profiles Drilldown plugin with a local version of Grafana

In some cases, you might want to:

- modify some core Grafana components or
- test some hypothesis on the plugin that require modifying the platform code,
- etc.

This section describes how you can set up your local development environment to work **both on the plugin and on Grafana code bases**.

## Requirements

1. Ensure that your local version of the plugin is properly [set up](../CONTRIBUTING.md)
2. Check out a local copy of Grafana:

   ```shell
   git clone --depth 1 https://github.com/grafana/grafana
   ```

3. Setup your local Grafana development environment by following [Grafana's Developer's guide](https://github.com/grafana/grafana/blob/HEAD/contribute/developer-guide.md).

4. Customize Grafana with the following `$WORKING_DIR/conf/custom.ini` file:

```ini
[paths]
plugins = /path/to/the/profiles-drilldown/folder
```

The [plugins option](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/#plugins) lets you customize where Grafana will look for plugins.

See the [Configure Grafana documentation](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/) for more information.

## Development

### In the plugin folder

In the terminal, execute:

```shell
pnpm run dev
```

to build the frontend assets.

### In the Grafana folder

In a different terminal tab execute:

```shell
pnpm start
```

to build the frontend assets.

In a different terminal tab, run the Pyroscope data source then start the Grafana server:

```shell
make devenv sources=pyroscope
make run
```

Then visit http://localhost:3000
