/**
 * Verifies patches/@grafana__flamegraph@13.1.0.patch against the contract in patches/README.md.
 * The real renderer draws on a recording canvas that keeps every draw, not only the last one, so a test can also fail
 * on an intermediate frame that React replaces within the same update.
 */
import type * as GrafanaData from '@grafana/data';
import type * as GrafanaFlameGraph from '@grafana/flamegraph';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

// Wide enough for the new UI split pane selectors; every synthetic profile totals 100 ticks.
const WIDTH = 1200;
const PIXELS_PER_TICK = WIDTH / 100;
const PIXELS_PER_LEVEL = 22;

// The renderer's copy of react-use decides at import time whether ResizeObserver exists, so the environment has to be
// in place before @grafana/data or @grafana/flamegraph are loaded.
installCanvasEnvironment();

const { createDataFrame, createTheme, FieldType } = require('@grafana/data') as typeof GrafanaData;
const { FlameGraph } = require('@grafana/flamegraph') as typeof GrafanaFlameGraph;

type FlameGraphProps = GrafanaFlameGraph.Props;
type FlameGraphFrame = GrafanaFlameGraph.FlameGraphFrame;
type GetExtraContextMenuButtons = NonNullable<FlameGraphProps['getExtraContextMenuButtons']>;
type Row = [label: string, level: number, value: number, self: number];
type Bar = { label: string; color: string; x: number; y: number };
type Position = Omit<Bar, 'color'>;

// Two occurrences of "foo" at different rows; no single-child chain, so nothing collapses.
const IDENTICAL_NAMES_ROWS: Row[] = [
  ['root', 0, 100, 0], // row 0
  ['foo', 1, 60, 10], // row 1
  ['bar', 2, 50, 50], // row 2
  ['foo', 1, 40, 10], // row 3
  ['baz', 2, 30, 30], // row 4
];

// root -> a -> b is a single-child chain, collapsed into one "(3) root" frame by default.
const COLLAPSIBLE_ROWS: Row[] = [
  ['root', 0, 100, 0], // row 0
  ['a', 1, 100, 0], // row 1
  ['b', 2, 100, 0], // row 2
  ['c', 3, 60, 60], // row 3
  ['d', 3, 40, 40], // row 4
];

// Both "foo" rows call "x", so the callers tree of "x" merges them into one "foo" frame for rows [1, 3], which is not a
// flame graph frame.
const MERGED_CALLERS_ROWS: Row[] = [
  ['root', 0, 100, 0], // row 0
  ['foo', 1, 60, 10], // row 1
  ['x', 2, 50, 50], // row 2
  ['foo', 1, 40, 10], // row 3
  ['x', 2, 30, 30], // row 4
];

const getTheme = () => createTheme({ colors: { mode: 'dark' } });

function makeFrame(rows: Row[]) {
  return createDataFrame({
    fields: [
      { name: 'level', type: FieldType.number, values: rows.map((r) => r[1]) },
      { name: 'value', type: FieldType.number, values: rows.map((r) => r[2]) },
      { name: 'self', type: FieldType.number, values: rows.map((r) => r[3]) },
      { name: 'label', type: FieldType.string, values: rows.map((r) => r[0]) },
    ],
  });
}

function renderFlameGraph(props: Partial<FlameGraphProps> = {}, rows = IDENTICAL_NAMES_ROWS) {
  const allProps: FlameGraphProps = { data: makeFrame(rows), getTheme, disableCollapsing: true, ...props };
  const result = render(<FlameGraph {...allProps} />);
  return {
    ...result,
    rerenderWith: (next: Partial<FlameGraphProps>) => result.rerender(<FlameGraph {...allProps} {...next} />),
  };
}

function tooltipContentMock() {
  return jest.fn((frame: FlameGraphFrame) => `frame ${JSON.stringify(frame)}`);
}

function contextMenuButtonsMock() {
  return jest.fn<ReturnType<GetExtraContextMenuButtons>, Parameters<GetExtraContextMenuButtons>>(() => []);
}

function canvases() {
  return screen.getAllByTestId('flameGraph') as HTMLCanvasElement[];
}

function bars(canvas = canvases()[0]): Bar[] {
  return recordingContext(canvas).bars;
}

// Finds the frame drawn at a flame graph level whose x range starts at `startTick`.
function barAt(label: string, level: number, startTick: number, canvas = canvases()[0]): Bar {
  const found = bars(canvas).filter(
    (b) => b.label === label && b.y === level * PIXELS_PER_LEVEL && Math.round(b.x / PIXELS_PER_TICK) === startTick
  );
  expect(found).toHaveLength(1);
  return found[0];
}

function positions(draw: Bar[]): Position[] {
  return draw.map(({ label, x, y }) => ({ label, x, y }));
}

function drawnPositions(): Position[][] {
  return canvases().map((canvas) => positions(bars(canvas)));
}

function isFocused() {
  return screen.queryByLabelText('Remove focus') !== null;
}

// Returns every draw `action` causes, including draws that a later draw in the same update replaces.
function drawsDuring(action: () => void, canvas = canvases()[0]): Bar[][] {
  const { draws } = recordingContext(canvas);
  const from = draws.length;
  action();
  return draws.slice(from);
}

function pointAt(level: number, tick: number) {
  return { clientX: tick * PIXELS_PER_TICK + 5, clientY: level * PIXELS_PER_LEVEL + PIXELS_PER_LEVEL / 2 };
}

function hover(level: number, tick: number, canvas = canvases()[0]) {
  fireEvent.mouseMove(canvas, pointAt(level, tick));
}

function click(level: number, tick: number, canvas = canvases()[0]) {
  fireEvent.click(canvas, pointAt(level, tick));
}

function focusBlock(level: number, tick: number) {
  click(level, tick);
  fireEvent.click(screen.getByText('Focus block'));
}

describe('@grafana/flamegraph renderer extensions', () => {
  describe('existing consumers (no extension props)', () => {
    it('renders the classic flame graph and tooltip exactly as before', () => {
      renderFlameGraph();

      expect(bars()).toMatchSnapshot();

      hover(1, 60);
      expect(screen.getByText(/Samples:/).parentElement!.innerHTML).toMatchSnapshot();
    });

    it('renders the new UI flame graph exactly as before', () => {
      renderFlameGraph({ enableNewUI: true });

      expect(bars()).toMatchSnapshot();
    });

    it('does not change rendering when only the tooltip hook is set', () => {
      const { rerenderWith } = renderFlameGraph();
      const before = bars();

      rerenderWith({ getFrameTooltipContent: () => 'extra', highlightedRows: undefined });

      expect(bars()).toEqual(before);
    });
  });

  describe.each([
    ['classic UI', false],
    ['new UI', true],
  ])('%s', (_name, enableNewUI) => {
    it('highlights only the exact source row, not other frames with the same name', () => {
      const { rerenderWith } = renderFlameGraph({ enableNewUI });
      const baseline = {
        foo1: barAt('foo', 1, 0).color,
        foo3: barAt('foo', 1, 60).color,
        bar2: barAt('bar', 2, 0).color,
      };
      expect(baseline.foo1).toBe(baseline.foo3);

      rerenderWith({ highlightedRows: new Set([3]) });

      const muted = barAt('root', 0, 0).color;
      expect(barAt('foo', 1, 60).color).toBe(baseline.foo3);
      expect(barAt('foo', 1, 0).color).toBe(muted);
      expect(barAt('bar', 2, 0).color).toBe(muted);
      expect(muted).not.toBe(baseline.foo1);
      expect(muted).not.toBe(baseline.bar2);

      rerenderWith({ highlightedRows: undefined });

      expect(barAt('foo', 1, 0).color).toBe(baseline.foo1);
    });

    it('appends tooltip content for the hovered source row', () => {
      const getFrameTooltipContent = tooltipContentMock();
      renderFlameGraph({ enableNewUI, getFrameTooltipContent });

      hover(1, 60);
      expect(screen.getByText(/Samples:/)).toBeInTheDocument();
      expect(screen.getByText('frame {"kind":"source","row":3}')).toBeInTheDocument();

      hover(1, 0);
      expect(screen.getByText('frame {"kind":"source","row":1}')).toBeInTheDocument();
      expect(screen.queryByText('frame {"kind":"source","row":3}')).not.toBeInTheDocument();
    });

    it('passes the exact source row to extra context menu buttons', () => {
      const getExtraContextMenuButtons = contextMenuButtonsMock();
      renderFlameGraph({ enableNewUI, getExtraContextMenuButtons });

      click(1, 60);

      expect(getExtraContextMenuButtons).toHaveBeenLastCalledWith(
        expect.objectContaining({ label: 'foo' }),
        expect.anything(),
        expect.objectContaining({ frame: { kind: 'source', row: 3 } })
      );
    });

    describe('focus across data changes', () => {
      // IDENTICAL_NAMES_ROWS zoomed to the second "foo" (row 3, ticks 60-100). Frames outside the zoom are drawn off
      // the canvas.
      const SECOND_FOO_FOCUSED: Position[] = [
        { label: 'root', x: -1799.5, y: 0 },
        { label: 'foo', x: -1799.5, y: 22 },
        { label: 'bar', x: -1799.5, y: 44 },
        { label: 'foo', x: 0.5, y: 22 },
        { label: 'baz', x: 0.5, y: 44 },
      ];
      // IDENTICAL_NAMES_ROWS zoomed to the first "foo" (row 1, ticks 0-60).
      const FIRST_FOO_FOCUSED: Position[] = [
        { label: 'root', x: 0.5, y: 0 },
        { label: 'foo', x: 0.5, y: 22 },
        { label: 'bar', x: 0.5, y: 44 },
        { label: 'foo', x: 1200.5, y: 22 },
        { label: 'baz', x: 1200.5, y: 44 },
      ];

      it('keeps the focused duplicate while highlighting toggles collapsing on the same DataFrame', () => {
        const { rerenderWith } = renderFlameGraph({
          enableNewUI,
          keepFocusOnDataChange: true,
          disableCollapsing: false,
        });
        focusBlock(1, 60);
        expect(positions(bars())).toEqual(SECOND_FOO_FOCUSED);

        const draws = drawsDuring(() => {
          rerenderWith({ highlightedRows: new Set([4]), disableCollapsing: true });
          rerenderWith({ highlightedRows: undefined, disableCollapsing: false });
        });

        expect(draws.length).toBeGreaterThan(0);
        expect(draws.map(positions)).toEqual(draws.map(() => SECOND_FOO_FOCUSED));
      });

      it('refocuses a replacement DataFrame by label, even with identical rows', () => {
        const { rerenderWith } = renderFlameGraph({ enableNewUI, keepFocusOnDataChange: true });
        focusBlock(1, 60);

        rerenderWith({ data: makeFrame(IDENTICAL_NAMES_ROWS) });

        expect(positions(bars())).toEqual(FIRST_FOO_FOCUSED);
      });

      it('removes the zoom when a replacement DataFrame lacks the focused label', () => {
        const { rerenderWith } = renderFlameGraph({ enableNewUI, keepFocusOnDataChange: true });
        focusBlock(1, 60);

        rerenderWith({ data: makeFrame(COLLAPSIBLE_ROWS) });

        expect(positions(bars())).toEqual([
          { label: 'root', x: 0.5, y: 0 },
          { label: 'a', x: 0.5, y: 22 },
          { label: 'b', x: 0.5, y: 44 },
          { label: 'c', x: 0.5, y: 66 },
          { label: 'd', x: 720.5, y: 66 },
        ]);
      });

      it('stays unfocused after Remove focus when a replacement DataFrame arrives', () => {
        const { rerenderWith } = renderFlameGraph({ enableNewUI, keepFocusOnDataChange: true });
        focusBlock(1, 60);
        fireEvent.click(screen.getByLabelText('Remove focus'));
        const unfocused = drawnPositions();

        rerenderWith({ data: makeFrame(IDENTICAL_NAMES_ROWS) });

        expect(isFocused()).toBe(false);
        expect(drawnPositions()).toEqual(unfocused);
      });

      it('keeps sandwich view unfocused when a replacement DataFrame arrives', () => {
        const { rerenderWith } = renderFlameGraph({ enableNewUI, keepFocusOnDataChange: true });
        focusBlock(1, 60);
        click(1, 60);
        fireEvent.click(screen.getByText('Sandwich view'));
        expect(isFocused()).toBe(false);
        const sandwich = drawnPositions();
        expect(sandwich).toHaveLength(2);

        rerenderWith({ data: makeFrame(IDENTICAL_NAMES_ROWS) });

        expect(isFocused()).toBe(false);
        expect(drawnPositions()).toEqual(sandwich);
      });

      // The new UI immediately refocuses from its shared row indexes, so the upstream reset is observed on sandwich view.
      it('still resets the view on a same-DataFrame rebuild without keepFocusOnDataChange', () => {
        const { rerenderWith } = renderFlameGraph({ enableNewUI, disableCollapsing: false });
        click(1, 60);
        fireEvent.click(screen.getByText('Sandwich view'));
        expect(canvases()).toHaveLength(2);

        rerenderWith({ disableCollapsing: true });

        expect(canvases()).toHaveLength(1);
      });
    });
  });

  it('renders tooltip content as React text, never as HTML', () => {
    renderFlameGraph({ getFrameTooltipContent: () => '<img src="x" data-testid="injected">' });

    hover(1, 60);

    expect(screen.getByText('<img src="x" data-testid="injected">')).toBeInTheDocument();
    expect(screen.queryByTestId('injected')).not.toBeInTheDocument();
  });

  it('gives text search priority over highlighted rows', async () => {
    const { rerenderWith } = renderFlameGraph();
    const baselineBar = barAt('bar', 2, 0).color;
    const baselineFoo3 = barAt('foo', 1, 60).color;
    rerenderWith({ highlightedRows: new Set([3]) });

    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'bar' } });

    await waitFor(() => expect(barAt('foo', 1, 60).color).not.toBe(baselineFoo3));
    expect(barAt('bar', 2, 0).color).toBe(baselineBar);
  });

  describe('sandwich view (merged frames)', () => {
    function enterSandwichOnFoo(props: Partial<FlameGraphProps>) {
      const result = renderFlameGraph(props);
      click(1, 60);
      fireEvent.click(screen.getByText('Sandwich view'));
      expect(canvases()).toHaveLength(2);
      const [callers, callees] = canvases();
      return { ...result, callers, callees };
    }

    it('does not apply source row highlights to derived frames with reused row indices', () => {
      const { callers, callees, rerenderWith } = enterSandwichOnFoo({});
      const before = { callers: bars(callers), callees: bars(callees) };

      rerenderWith({ highlightedRows: new Set([0, 2]) });

      expect(bars(callers)).toEqual(before.callers);
      expect(bars(callees)).toEqual(before.callees);
    });

    it('describes merged frames by every original row they represent', () => {
      const getFrameTooltipContent = tooltipContentMock();
      const { callers, callees } = enterSandwichOnFoo({ getFrameTooltipContent });

      // Callees: merged "foo" (rows 1 and 3) and "bar", which keeps a single row but is still derived.
      hover(0, 0, callees);
      expect(screen.getByText('frame {"kind":"derived","rows":[1,3]}')).toBeInTheDocument();
      hover(1, 0, callees);
      expect(screen.getByText('frame {"kind":"derived","rows":[2]}')).toBeInTheDocument();

      // Callers: "root" is reached from both "foo" rows, so row 0 is reused twice by the merge.
      hover(0, 0, callers);
      expect(screen.getByText('frame {"kind":"derived","rows":[0]}')).toBeInTheDocument();
    });

    it('passes derived frames to extra context menu buttons', () => {
      const getExtraContextMenuButtons = contextMenuButtonsMock();
      const { callees } = enterSandwichOnFoo({ getExtraContextMenuButtons });

      click(1, 0, callees);

      expect(getExtraContextMenuButtons).toHaveBeenLastCalledWith(
        expect.objectContaining({ label: 'bar' }),
        expect.anything(),
        expect.objectContaining({ frame: { kind: 'derived', rows: [2] } })
      );
    });
  });

  describe('new UI call tree', () => {
    let rectSpy: jest.SpyInstance;
    let intersectionObserverSpy: jest.SpyInstance;

    beforeEach(() => {
      // AutoSizer only renders the call tree table when its parent has a size.
      rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        width: WIDTH,
        height: 800,
        right: WIDTH,
        bottom: 800,
      } as DOMRect);
      // Call tree action menus observe their anchor; jest-setup.js stubs IntersectionObserver without any methods.
      intersectionObserverSpy = jest
        .spyOn(window, 'IntersectionObserver')
        .mockImplementation(
          () => ({ observe() {}, unobserve() {}, disconnect() {} } as unknown as IntersectionObserver)
        );
    });

    afterEach(() => {
      rectSpy.mockRestore();
      intersectionObserverSpy.mockRestore();
    });

    function callTreeFrames(getExtraContextMenuButtons: ReturnType<typeof contextMenuButtonsMock>) {
      return getExtraContextMenuButtons.mock.calls
        .filter(([, , state]) => state.paneView === 'callTree')
        .map(([, , state]) => state.frame);
    }

    // Left pane: flame graph. Right pane: call tree.
    async function showFlameGraphAndCallTree() {
      fireEvent.click(screen.getAllByRole('radio', { name: 'Flame Graph' })[0]);
      fireEvent.click(screen.getAllByRole('radio', { name: 'Call Tree' })[1]);
      await waitFor(() => expect(screen.getByTestId('callTree')).toBeInTheDocument());
    }

    function callTreeRow(label: string) {
      const rows = within(screen.getByTestId('callTree')).getAllByRole('row');
      const found = rows.filter((row) => within(row).queryByText(label) !== null);
      expect(found).toHaveLength(1);
      return found[0];
    }

    it('keeps the flame graph unfocused after a merged callers focus and a replacement DataFrame', async () => {
      const { rerenderWith } = renderFlameGraph(
        { enableNewUI: true, keepFocusOnDataChange: true },
        MERGED_CALLERS_ROWS
      );
      await showFlameGraphAndCallTree();
      // The call tree pane keeps this "foo" focus locally after sandwich view clears the shared focus.
      focusBlock(1, 60);
      click(2, 60);
      fireEvent.click(screen.getByText('Sandwich view'));
      // The callers tree of "x" has one merged "foo" row.
      fireEvent.click(within(callTreeRow('foo')).getByLabelText('Actions'));
      fireEvent.click(screen.getByText('Focus on callees'));
      expect(isFocused()).toBe(false);
      const sandwich = drawnPositions();

      rerenderWith({ data: makeFrame(MERGED_CALLERS_ROWS) });

      expect(isFocused()).toBe(false);
      expect(drawnPositions()).toEqual(sandwich);
    });

    it('passes source rows, and derived rows in callers mode, to extra context menu buttons', async () => {
      const getExtraContextMenuButtons = contextMenuButtonsMock();
      renderFlameGraph({ enableNewUI: true, getExtraContextMenuButtons });

      fireEvent.click(screen.getAllByRole('radio', { name: 'Flame Graph' })[0]);
      fireEvent.click(screen.getAllByRole('radio', { name: 'Call Tree' })[1]);

      await waitFor(() => expect(screen.getByTestId('callTree')).toBeInTheDocument());
      await waitFor(() =>
        expect(callTreeFrames(getExtraContextMenuButtons)).toEqual(
          expect.arrayContaining([
            { kind: 'source', row: 1 },
            { kind: 'source', row: 3 },
          ])
        )
      );

      // Sandwich from the flame graph pane switches the call tree to the merged callers tree.
      getExtraContextMenuButtons.mockClear();
      click(1, 60);
      fireEvent.click(screen.getByText('Sandwich view'));

      await waitFor(() =>
        expect(callTreeFrames(getExtraContextMenuButtons)).toEqual(
          expect.arrayContaining([
            { kind: 'derived', rows: [1, 3] },
            { kind: 'derived', rows: [0] },
          ])
        )
      );
      expect(callTreeFrames(getExtraContextMenuButtons)).not.toContainEqual(
        expect.objectContaining({ kind: 'source' })
      );
    });
  });

  describe('collapsed frames', () => {
    it('treats a collapsed group as derived for tooltips and highlighting', () => {
      const getFrameTooltipContent = tooltipContentMock();
      const { rerenderWith } = renderFlameGraph({ disableCollapsing: false, getFrameTooltipContent }, COLLAPSIBLE_ROWS);
      const baselineC = barAt('c', 1, 0).color;

      hover(0, 0);
      expect(screen.getByText('frame {"kind":"derived","rows":[0,1,2]}')).toBeInTheDocument();
      hover(1, 0);
      expect(screen.getByText('frame {"kind":"source","row":3}')).toBeInTheDocument();

      rerenderWith({ highlightedRows: new Set([2, 3]) });

      const muted = barAt('d', 1, 60).color;
      expect(barAt('c', 1, 0).color).toBe(baselineC);
      expect(barAt('(3) root', 0, 0).color).toBe(muted);
    });
  });
});

type RecordingContext = { bars: Bar[]; draws: Bar[][] };

function recordingContext(canvas: HTMLCanvasElement): RecordingContext {
  return canvas.getContext('2d') as unknown as RecordingContext;
}

function installCanvasEnvironment() {
  const contexts = new WeakMap<HTMLCanvasElement, RecordingContext>();

  class Context2D {
    fillStyle = '';
    strokeStyle = '';
    font = '';
    textAlign = 'left';
    textBaseline = '';
    bars: Bar[] = [];
    draws: Bar[][] = [];
    private lastRect?: [number, number];
    private lastFill?: { color: string; x: number; y: number };
    private fillStyles: string[] = [];

    constructor(readonly canvas: HTMLCanvasElement) {}

    // Each draw starts with a clear, so the bars recorded after it belong to one draw.
    clearRect() {
      this.bars = [];
      this.draws.push(this.bars);
      this.lastFill = undefined;
    }
    rect(x: number, y: number) {
      this.lastRect = [x, y];
    }
    fill(path?: unknown) {
      if (!path && this.lastRect) {
        this.lastFill = { color: String(this.fillStyle), x: this.lastRect[0], y: this.lastRect[1] };
      }
    }
    // Labels are drawn right after their bar, so each label is paired with the last filled bar.
    fillText(text: string) {
      if (this.lastFill) {
        this.bars.push({ label: text.replace(/ \([^)]*\)$/, ''), ...this.lastFill });
      }
    }
    measureText(text: string) {
      return { width: text.length * 7 };
    }
    save() {
      this.fillStyles.push(this.fillStyle);
    }
    restore() {
      this.fillStyle = this.fillStyles.pop() ?? this.fillStyle;
    }
    beginPath() {}
    stroke() {}
    clip() {}
  }

  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = new Context2D(this);
      contexts.set(this, ctx);
    }
    return ctx as never;
  } as typeof HTMLCanvasElement.prototype.getContext;

  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(MouseEvent.prototype, 'offsetX', {
    configurable: true,
    get(this: MouseEvent) {
      return this.clientX;
    },
  });
  Object.defineProperty(MouseEvent.prototype, 'offsetY', {
    configurable: true,
    get(this: MouseEvent) {
      return this.clientY;
    },
  });

  // Tooltips clamp their measured size to the window, so the window must be wider than any element.
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: WIDTH * 2 });
  Object.assign(window, {
    Path2D: class {
      rect() {}
    },
    ResizeObserver: class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        // Every element reports the same size, which keeps tooltip measurement stable.
        const contentRect = { x: 0, y: 0, width: WIDTH, height: 100, top: 0, left: 0, bottom: 100, right: WIDTH };
        this.callback([{ contentRect } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    },
  });
}
