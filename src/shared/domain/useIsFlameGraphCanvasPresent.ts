import { useEffect, useState } from 'react';

const FLAME_GRAPH_CANVAS_SELECTOR = 'canvas[data-testid="flameGraph"]';

const isCanvasPresent = () => Boolean(document.querySelector(FLAME_GRAPH_CANVAS_SELECTOR));

/**
 * Reactively tracks whether the flame graph <canvas> is present in the DOM.
 *
 * The canvas is created/removed by the <FlameGraph /> component when users switch between views
 * (e.g. "Flame graph" ↔ "Top table"), so we observe the DOM to avoid a stale value that was only
 * computed during the initial render.
 */
export function useIsFlameGraphCanvasPresent(): boolean {
  const [isPresent, setIsPresent] = useState(isCanvasPresent);

  useEffect(() => {
    const update = () => setIsPresent(isCanvasPresent());

    // ensure we're in sync with the DOM after mount, in case it changed before the observer was attached
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return isPresent;
}
