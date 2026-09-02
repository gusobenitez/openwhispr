/**
 * Pure hit-testing for the frameless dictation panel.
 *
 * The panel window is transparent and always much larger than the pixels it
 * actually paints (96x96 for a 40x40 circle, up to 400x500 while a toast is
 * up). Anything the window covers but does not paint has to stay click-through,
 * otherwise the invisible remainder swallows clicks meant for the app behind it.
 *
 * The renderer publishes the rectangles it currently paints, in CSS px relative
 * to the window's top-left corner, and the main process tests the OS cursor
 * against them. Keeping the decision in the main process is deliberate: driving
 * it from renderer mouseenter/mouseleave puts an async IPC round-trip between
 * the pointer arriving and the window becoming clickable, which drops clicks
 * that land inside that window.
 */

/**
 * Drops anything that is not a usable rectangle. Regions cross an IPC boundary,
 * so they are untrusted input.
 */
function normalizeHitRegions(regions) {
  if (!Array.isArray(regions)) {
    return [];
  }

  const normalized = [];
  for (const region of regions) {
    if (!region || typeof region !== "object") {
      continue;
    }

    const x = Number(region.x);
    const y = Number(region.y);
    const width = Number(region.width);
    const height = Number(region.height);

    if (![x, y, width, height].every(Number.isFinite)) {
      continue;
    }
    if (width <= 0 || height <= 0) {
      continue;
    }

    normalized.push({ x, y, width, height });
  }

  return normalized;
}

/**
 * @param {{x: number, y: number}} cursor Screen point, in DIP (screen.getCursorScreenPoint()).
 * @param {{x: number, y: number, width: number, height: number}} windowBounds Window bounds, in DIP.
 * @param {Array<{x: number, y: number, width: number, height: number}>} regions Window-relative rects.
 * @returns {boolean} true when the window should capture the mouse.
 */
function isPointInHitRegions(cursor, windowBounds, regions) {
  if (!cursor || !windowBounds || !Array.isArray(regions) || regions.length === 0) {
    return false;
  }

  const localX = cursor.x - windowBounds.x;
  const localY = cursor.y - windowBounds.y;

  if (localX < 0 || localY < 0 || localX >= windowBounds.width || localY >= windowBounds.height) {
    return false;
  }

  return regions.some(
    (region) =>
      localX >= region.x &&
      localX < region.x + region.width &&
      localY >= region.y &&
      localY < region.y + region.height
  );
}

/**
 * The whole capture decision for one poll tick, kept pure so the transitions
 * are testable without an Electron window.
 *
 * @returns {{capturing: boolean, x: number, y: number}} `x`/`y` are the cursor
 *   in window-relative CSS px, which the renderer needs because a cursor that
 *   arrives and stops produces no mousemove, and therefore no mouseenter, once
 *   the window flips out of click-through.
 */
function resolveCapture({ cursor, windowBounds, regions, isDragging = false }) {
  const inRegion = isPointInHitRegions(cursor, windowBounds, regions);

  return {
    // A drag that runs off the edge of the work area leaves the cursor behind
    // the clamped window; dropping capture there would strip the mouseup that
    // ends the drag.
    capturing: Boolean(isDragging) || inRegion,
    x: cursor && windowBounds ? cursor.x - windowBounds.x : 0,
    y: cursor && windowBounds ? cursor.y - windowBounds.y : 0,
  };
}

module.exports = { normalizeHitRegions, isPointInHitRegions, resolveCapture };
