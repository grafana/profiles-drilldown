// webpack.config.ts
import * as path from 'path';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { type Configuration, NormalModuleReplacementPlugin, type RuleSetRule } from 'webpack';
import LiveReloadPlugin from 'webpack-livereload-plugin';
import { merge } from 'webpack-merge';

import grafanaConfig, { type Env } from './.config/webpack/webpack.config';

const config = async (env: Env): Promise<Configuration> => {
  const baseConfig = (await grafanaConfig(env)) as any;

  /* MODULES */

  // Customize swc-loader
  const swcLoader = baseConfig.module.rules.find((rule: { use: { loader: string } }) => {
    return rule.use.loader === 'swc-loader';
  }) as RuleSetRule;

  const swcLoaderJsc = (swcLoader?.use as any).options.jsc;

  // Decorators are only used in src/shared/components/FlameGraph/components/infrastructure/PprofRequest.ts
  swcLoaderJsc.parser.decorators = true;

  /* PLUGINS */

  // Disable Live reload
  baseConfig.plugins = baseConfig.plugins.filter((p: unknown) => !(p instanceof LiveReloadPlugin));

  // Customize CopyWebpackPlugin to prevent JSON files used in tests to appear in the build artefacts.
  // Among them, there might be (e.g.) some "plugin.json" files used that the platform would try to load.
  const jsonPattern = baseConfig.plugins
    .find((p: unknown) => p instanceof CopyWebpackPlugin)
    .patterns.find(({ from }: { from: string }) => from === '**/*.json');

  if (!jsonPattern) {
    throw 'Cannot find a JSON entry in the Webpack CopyPlugin! Please check .config/webpack/webpack.config.ts and adjust this configuration.';
  }

  jsonPattern.filter = (filepath: string) => !filepath.includes('__tests__');

  /* FINAL CONFIG */

  if (baseConfig.cache?.type === 'filesystem') {
    // A pnpm patch changes package contents without changing its version.
    baseConfig.cache.buildDependencies.lockfile = [path.resolve(__dirname, 'pnpm-lock.yaml')];
  }

  baseConfig.externals = [...(baseConfig.externals || []), 'i18next'];

  const finalConfig = merge(baseConfig, {
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      alias: {
        src: path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, './src/shared'),
        '@img': path.resolve(__dirname, './src/img'),
        // Ensure single instances of these packages when using pnpm
        // This prevents module duplication issues with i18n state
        '@grafana/i18n': path.resolve(process.cwd(), 'node_modules/@grafana/i18n'),
      },
    },
    module: {
      rules: [
        {
          test: /\.(png|jpe?g|gif)$/,
          type: 'asset/resource',
          generator: {
            publicPath: `public/plugins/grafana-pyroscope-app/img/`,
            outputPath: 'img/',
            filename: Boolean(env.production) ? '[hash][ext]' : '[name][ext]',
          },
        },
      ],
    },
    // TODO: https://github.com/grafana/explore-profiles/issues/488
    // A temporary workaround for https://github.com/grafana/grafana/issues/104040 Should be removed when it's fixed and new version of grafana/flamegraph is released
    plugins: [
      new NormalModuleReplacementPlugin(
        /react-use\/lib\/usePrevious/,
        path.resolve(__dirname, 'src/shims/react-use-usePrevious-default.js')
      ),
      new NormalModuleReplacementPlugin(
        /react-use\/lib\/useDebounce/,
        path.resolve(__dirname, 'src/shims/react-use-useDebounce-default.js')
      ),
    ],
  });

  return finalConfig;
};

export default config;
