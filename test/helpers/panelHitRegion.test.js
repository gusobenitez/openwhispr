const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/panelHitRegion.js");

// The BASE dictation panel: a 96x96 transparent window whose only painted
// pixels are a 40x40 circle inset 4px from the bottom-right corner
// (`fixed bottom-1 right-1` around a `w-10 h-10` button in App.jsx).
const PANEL_BOUNDS = { x: 1000, y: 800, width: 96, height: 96 };
const CIRCLE = { x: 52, y: 52, width: 40, height: 40 };

test("the circle itself captures the mouse", async () => {
  const { isPointInHitRegions } = await load();

  // Dead centre of the circle.
  assert.equal(isPointInHitRegions({ x: 1072, y: 872 }, PANEL_BOUNDS, [CIRCLE]), true);
  // Top-left corner of the circle's box, inclusive.
  assert.equal(isPointInHitRegions({ x: 1052, y: 852 }, PANEL_BOUNDS, [CIRCLE]), true);
  // One px past the bottom-right corner, exclusive.
  assert.equal(isPointInHitRegions({ x: 1092, y: 892 }, PANEL_BOUNDS, [CIRCLE]), false);
});

test("the transparent remainder of the window stays click-through", async () => {
  const { isPointInHitRegions } = await load();

  // Regression guard: on Windows setMainWindowInteractivity() used to call
  // setIgnoreMouseEvents(false) unconditionally, so the whole 96x96 window ate
  // clicks. 83% of it paints nothing, and the dead area sits above and to the
  // left of the circle — exactly where a browser toolbar button lands.
  assert.equal(isPointInHitRegions({ x: 1072, y: 820 }, PANEL_BOUNDS, [CIRCLE]), false); // above
  assert.equal(isPointInHitRegions({ x: 1020, y: 872 }, PANEL_BOUNDS, [CIRCLE]), false); // left
  assert.equal(isPointInHitRegions({ x: 1010, y: 810 }, PANEL_BOUNDS, [CIRCLE]), false); // corner
});

test("a cursor outside the window never captures", async () => {
  const { isPointInHitRegions } = await load();

  assert.equal(isPointInHitRegions({ x: 999, y: 872 }, PANEL_BOUNDS, [CIRCLE]), false);
  assert.equal(isPointInHitRegions({ x: 1096, y: 872 }, PANEL_BOUNDS, [CIRCLE]), false);
  assert.equal(isPointInHitRegions({ x: 1072, y: 799 }, PANEL_BOUNDS, [CIRCLE]), false);
  assert.equal(isPointInHitRegions({ x: 1072, y: 896 }, PANEL_BOUNDS, [CIRCLE]), false);
});

test("any published region captures, not just the first", async () => {
  const { isPointInHitRegions } = await load();

  // While a toast is up the window grows to 400x500, but the toast only paints
  // a strip of it; the rest must stay click-through.
  const toastBounds = { x: 700, y: 400, width: 400, height: 500 };
  const toast = { x: 24, y: 300, width: 340, height: 64 };
  const circle = { x: 356, y: 456, width: 40, height: 40 };

  assert.equal(isPointInHitRegions({ x: 800, y: 730 }, toastBounds, [toast, circle]), true);
  assert.equal(isPointInHitRegions({ x: 1076, y: 876 }, toastBounds, [toast, circle]), true);
  // Between the toast and the circle: painted by neither.
  assert.equal(isPointInHitRegions({ x: 750, y: 500 }, toastBounds, [toast, circle]), false);
});

test("no regions means nothing to click", async () => {
  const { isPointInHitRegions } = await load();

  assert.equal(isPointInHitRegions({ x: 1072, y: 872 }, PANEL_BOUNDS, []), false);
  assert.equal(isPointInHitRegions({ x: 1072, y: 872 }, PANEL_BOUNDS, null), false);
  assert.equal(isPointInHitRegions(null, PANEL_BOUNDS, [CIRCLE]), false);
  assert.equal(isPointInHitRegions({ x: 1072, y: 872 }, null, [CIRCLE]), false);
});

test("malformed regions from the renderer are dropped, not trusted", async () => {
  const { normalizeHitRegions } = await load();

  assert.deepEqual(normalizeHitRegions([CIRCLE]), [CIRCLE]);
  assert.deepEqual(normalizeHitRegions(null), []);
  assert.deepEqual(normalizeHitRegions("nope"), []);
  assert.deepEqual(normalizeHitRegions([null, undefined, 42]), []);
  // A collapsed rect would be a no-op region; a NaN one would poison every
  // comparison into false and silently make the panel unclickable.
  assert.deepEqual(normalizeHitRegions([{ x: 0, y: 0, width: 0, height: 10 }]), []);
  assert.deepEqual(normalizeHitRegions([{ x: 0, y: 0, width: -5, height: 10 }]), []);
  assert.deepEqual(normalizeHitRegions([{ x: NaN, y: 0, width: 10, height: 10 }]), []);
  assert.deepEqual(normalizeHitRegions([{ x: 0, y: 0 }]), []);
});

test("normalized regions keep only geometry, whatever else was sent", async () => {
  const { normalizeHitRegions } = await load();

  assert.deepEqual(normalizeHitRegions([{ ...CIRCLE, top: 1, bogus: "x" }]), [CIRCLE]);
  // getBoundingClientRect() returns subpixel floats; those are legitimate.
  assert.deepEqual(normalizeHitRegions([{ x: 52.5, y: 52.5, width: 40.25, height: 40.25 }]), [
    { x: 52.5, y: 52.5, width: 40.25, height: 40.25 },
  ]);
});

test("resolveCapture reports where the pointer crossed, not just that it did", async () => {
  const { resolveCapture } = await load();

  // The renderer needs the coordinates: once the window flips out of
  // click-through, Chromium recomputes :hover only on the next mouse movement,
  // so a cursor that arrives and stops fires no mouseenter of its own.
  const inside = resolveCapture({
    cursor: { x: 1072, y: 872 },
    windowBounds: PANEL_BOUNDS,
    regions: [CIRCLE],
  });
  assert.deepEqual(inside, { capturing: true, x: 72, y: 72 });

  const outside = resolveCapture({
    cursor: { x: 1010, y: 810 },
    windowBounds: PANEL_BOUNDS,
    regions: [CIRCLE],
  });
  assert.deepEqual(outside, { capturing: false, x: 10, y: 10 });
});

test("a drag holds capture even after the window clamps away from the cursor", async () => {
  const { resolveCapture } = await load();

  // DragManager clamps the panel to the work area, so dragging into a screen
  // edge parks the cursor outside every region. Releasing capture there would
  // swallow the mouseup that ends the drag and the panel would follow the
  // cursor forever.
  const strayCursor = { x: 400, y: 200 };

  assert.equal(
    resolveCapture({ cursor: strayCursor, windowBounds: PANEL_BOUNDS, regions: [CIRCLE] })
      .capturing,
    false
  );
  assert.equal(
    resolveCapture({
      cursor: strayCursor,
      windowBounds: PANEL_BOUNDS,
      regions: [CIRCLE],
      isDragging: true,
    }).capturing,
    true
  );
});

test("resolveCapture defaults to click-through when it has nothing to go on", async () => {
  const { resolveCapture } = await load();

  assert.deepEqual(resolveCapture({}), { capturing: false, x: 0, y: 0 });
  assert.deepEqual(
    resolveCapture({ cursor: { x: 5, y: 5 }, windowBounds: null, regions: [CIRCLE] }),
    { capturing: false, x: 0, y: 0 }
  );
});
