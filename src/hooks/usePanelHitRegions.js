import { useEffect, useRef } from "react";

/**
 * Pointer plumbing for the dictation panel's transparent overlay window.
 *
 * Reports the panel's painted rectangles to the main process so the rest of the
 * window stays click-through, and receives back the pointer crossings the main
 * process detects. Mark anything clickable with `data-hit-region`, or with
 * `data-hit-region="window"` to claim the whole window (menus, which need
 * click-outside-to-dismiss). See src/helpers/panelHitRegion.js for the
 * main-process half.
 *
 * @param {import("react").RefObject<HTMLElement>} panelRef The panel's controls.
 * @param {(over: boolean) => void} onPointerOverPanel Called when the pointer
 *   enters or leaves `panelRef`. Needed because capture is decided in the main
 *   process: Chromium only recomputes `:hover` on the next mouse movement, so a
 *   cursor that lands on the panel and stops fires no mouseenter of its own.
 */
const HIT_REGION_SELECTOR = "[data-hit-region]";

const collectRegions = () => {
  const regions = [];

  for (const element of document.querySelectorAll(HIT_REGION_SELECTOR)) {
    if (element.dataset.hitRegion === "window") {
      regions.push({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      regions.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
  }

  return regions;
};

export const usePanelHitRegions = (panelRef, onPointerOverPanel) => {
  const onPointerOverPanelRef = useRef(onPointerOverPanel);
  onPointerOverPanelRef.current = onPointerOverPanel;

  useEffect(() => {
    let frame = null;
    let published = null;

    const publish = () => {
      frame = null;
      const regions = collectRegions();

      // The observers below fire on every React re-render; only the geometry
      // actually reaching the main process needs to cross IPC.
      const serialized = JSON.stringify(regions);
      if (serialized === published) {
        return;
      }
      published = serialized;

      window.electronAPI?.setMainWindowHitRegions?.(regions);
    };

    const schedule = () => {
      if (frame === null) {
        frame = requestAnimationFrame(publish);
      }
    };

    publish();

    // Deliberately generic rather than a dependency list: the panel grows a
    // tooltip, a cancel button, a menu and toasts at different times, and a
    // missed update means either a dead zone or an unclickable control.
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });

    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);

    // The window itself is resized over IPC as the panel's contents change, and
    // every region is measured against the viewport.
    window.addEventListener("resize", schedule);

    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.electronAPI?.setMainWindowHitRegions?.([]);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onMainWindowPointer?.((state) => {
      const panel = panelRef.current;

      // The window also captures over toasts, which are not the panel: ask
      // where the pointer actually is rather than trusting `capturing` alone.
      const overPanel =
        Boolean(state?.capturing) &&
        Boolean(panel) &&
        (() => {
          const rect = panel.getBoundingClientRect();
          return (
            state.x >= rect.left &&
            state.x < rect.right &&
            state.y >= rect.top &&
            state.y < rect.bottom
          );
        })();

      onPointerOverPanelRef.current?.(overPanel);
    });

    return () => unsubscribe?.();
  }, [panelRef]);
};
