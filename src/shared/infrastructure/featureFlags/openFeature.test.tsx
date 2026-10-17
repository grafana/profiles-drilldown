import { createOpenFeatureLocalStorageProvider, createOpenFeatureOFREPWebProvider, logWarning } from '@grafana/runtime';
import { OpenFeatureTestProvider } from '@openfeature/react-sdk';
import { OpenFeature, TypedInMemoryProvider, type Provider } from '@openfeature/web-sdk';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { getQueryLibraryFromOpenFeature, QUERY_LIBRARY_FEATURE_FLAG_KEY } from './featureFlags';
import { ensureOpenFeaturePluginInitialized, OpenFeaturePluginScope, PLUGIN_OPEN_FEATURE_DOMAIN } from './openFeature';

jest.mock('@grafana/runtime', () => {
  const actual = jest.requireActual<typeof import('@grafana/runtime')>('@grafana/runtime');
  return {
    ...actual,
    logWarning: jest.fn(),
    createOpenFeatureLocalStorageProvider: jest.fn(),
    createOpenFeatureOFREPWebProvider: jest.fn(),
  };
});

const localStorageProvider = { metadata: { name: 'local-storage-provider' } } as Provider;
const ofrepProvider = { metadata: { name: 'ofrep-provider' } } as Provider;

describe('openFeature', () => {
  let setProviderAndWaitSpy: jest.SpiedFunction<(typeof OpenFeature)['setProviderAndWait']>;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(createOpenFeatureLocalStorageProvider).mockReturnValue(localStorageProvider as never);
    jest.mocked(createOpenFeatureOFREPWebProvider).mockReturnValue(ofrepProvider as never);
    await OpenFeature.clearProviders();
    setProviderAndWaitSpy = jest.spyOn(OpenFeature, 'setProviderAndWait').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await OpenFeature.clearProviders();
  });

  describe('QUERY_LIBRARY_FEATURE_FLAG_KEY', () => {
    it('matches Grafana core registry (featuremgmt)', () => {
      expect(QUERY_LIBRARY_FEATURE_FLAG_KEY).toBe('queryLibrary');
    });
  });

  describe('PLUGIN_OPEN_FEATURE_DOMAIN', () => {
    it('is stable for provider binding', () => {
      expect(PLUGIN_OPEN_FEATURE_DOMAIN).toBe('grafana-pyroscope-app');
    });
  });

  describe('OpenFeaturePluginScope', () => {
    it('renders children', () => {
      render(
        <OpenFeaturePluginScope>
          <span data-testid="child">inside</span>
        </OpenFeaturePluginScope>
      );
      expect(screen.getByTestId('child')).toHaveTextContent('inside');
    });
  });

  describe('getQueryLibraryFromOpenFeature', () => {
    it('returns the default when the flag is unset in the test provider', () => {
      const { result } = renderHook(() => getQueryLibraryFromOpenFeature(), {
        wrapper: ({ children }) => (
          <OpenFeatureTestProvider domain={PLUGIN_OPEN_FEATURE_DOMAIN}>{children}</OpenFeatureTestProvider>
        ),
      });
      expect(result.current).toBe(false);
    });

    it('returns true when the test provider maps the Grafana registry flag on', () => {
      const { result } = renderHook(() => getQueryLibraryFromOpenFeature(), {
        wrapper: ({ children }) => (
          <OpenFeatureTestProvider
            domain={PLUGIN_OPEN_FEATURE_DOMAIN}
            flagValueMap={{ [QUERY_LIBRARY_FEATURE_FLAG_KEY]: true }}
          >
            {children}
          </OpenFeatureTestProvider>
        ),
      });
      expect(result.current).toBe(true);
    });
  });

  describe('ensureOpenFeaturePluginInitialized', () => {
    it('registers the shared localStorage and OFREP providers', async () => {
      await ensureOpenFeaturePluginInitialized();

      expect(logWarning).not.toHaveBeenCalled();
      expect(createOpenFeatureLocalStorageProvider).toHaveBeenCalledTimes(1);
      expect(createOpenFeatureOFREPWebProvider).toHaveBeenCalledTimes(1);
      expect(setProviderAndWaitSpy).toHaveBeenCalledWith(
        PLUGIN_OPEN_FEATURE_DOMAIN,
        expect.objectContaining({
          providerEntries: [
            { name: 'local-storage-provider', provider: localStorageProvider },
            { name: 'ofrep-provider', provider: ofrepProvider },
          ],
        })
      );
    });

    it('logs when provider registration fails and leaves defaults', async () => {
      setProviderAndWaitSpy.mockRejectedValue(new Error('ofrep-down'));

      await ensureOpenFeaturePluginInitialized();

      await waitFor(() => {
        expect(logWarning).toHaveBeenCalledWith(
          'OpenFeature provider initialization failed; feature flags remain at default values',
          expect.objectContaining({ error: 'ofrep-down' })
        );
      });
    });

    it('does not replace a provider already registered for the domain', async () => {
      setProviderAndWaitSpy.mockRestore();
      await OpenFeature.setProviderAndWait(PLUGIN_OPEN_FEATURE_DOMAIN, new TypedInMemoryProvider({}));
      const spy = jest.spyOn(OpenFeature, 'setProviderAndWait');

      await ensureOpenFeaturePluginInitialized();

      expect(createOpenFeatureLocalStorageProvider).not.toHaveBeenCalled();
      expect(createOpenFeatureOFREPWebProvider).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
