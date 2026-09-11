import { AppEvents } from '@grafana/data';
import { FlamebearerProfile } from '@shared/types/FlamebearerProfile';
import { renderHook } from '@testing-library/react';

import { useExportMenu } from '../useExportMenu';

// appEvents dependency
const appEvents = {
  publish: jest.fn(),
};

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getAppEvents: () => appEvents,
}));

// file-saver dependency
const saveAs = jest.fn();
jest.mock('file-saver', () => ({
  __esModule: true,
  default: (...args: unknown[]) => saveAs(...args),
}));

// reportInteraction dependency
jest.mock('@shared/domain/reportInteraction', () => ({
  reportInteraction: jest.fn(),
}));

// compression-streams-polyfill relies on TransformStream, which is not available in jsdom
jest.mock('compression-streams-polyfill', () => ({}));

const profile = {
  metadata: { appName: 'simple.golang.app.cpu' },
} as FlamebearerProfile;

describe('useExportMenu(props)', () => {
  beforeEach(() => {
    // getExportFilename reads the diff time ranges from the URL.
    // We update the URL via history.replaceState rather than redefining window.location: once
    // @testing-library/react is imported the location property is non-configurable, so
    // Object.defineProperty(window, 'location', ...) throws "Cannot redefine property: location".
    window.history.replaceState(
      {},
      '',
      '?diffFrom=2024-09-16T12:21:51.298Z&diffTo=2024-09-16T12:25:35.688Z&diffFrom-2=2024-09-16T12:31:56.176Z&diffTo-2=2024-09-16T12:34:56.664Z'
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  describe('data.isPngExportDisabled', () => {
    it('is true when there is no flame graph canvas (e.g. the "Top table" view is selected)', () => {
      const { result } = renderHook(() => useExportMenu({ profile }));

      expect(result.current.data.isPngExportDisabled).toBe(true);
    });

    it('is false when the flame graph canvas is present', () => {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-testid', 'flameGraph');
      document.body.appendChild(canvas);

      const { result } = renderHook(() => useExportMenu({ profile }));

      expect(result.current.data.isPngExportDisabled).toBe(false);
    });
  });

  describe('actions.downloadPng()', () => {
    describe('when there is no flame graph canvas (e.g. the "Top table" view is selected)', () => {
      it('does not throw and publishes an error application event', () => {
        // prevent console noise in the output
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useExportMenu({ profile }));

        expect(() => result.current.actions.downloadPng()).not.toThrow();

        expect(appEvents.publish).toHaveBeenCalledWith({
          type: AppEvents.alertError.name,
          payload: ['Failed to export to png!', 'Please ensure the flame graph is visible before exporting to png.'],
        });

        expect(saveAs).not.toHaveBeenCalled();
      });
    });

    describe('when the flame graph canvas is present', () => {
      it('saves the canvas contents as a png file', () => {
        const blob = new Blob();
        const canvas = document.createElement('canvas');
        canvas.setAttribute('data-testid', 'flameGraph');
        canvas.toBlob = jest.fn((callback) => callback(blob));
        document.body.appendChild(canvas);

        const { result } = renderHook(() => useExportMenu({ profile }));

        result.current.actions.downloadPng();

        expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
        expect(saveAs).toHaveBeenCalledWith(blob, expect.stringMatching(/^simple\.golang\.app\.cpu.*\.png$/));
        expect(appEvents.publish).not.toHaveBeenCalled();
      });
    });
  });
});
