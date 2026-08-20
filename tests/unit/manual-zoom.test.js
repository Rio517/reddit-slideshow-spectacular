import { describe, expect, it } from "vitest";
import {
  MANUAL_ZOOM_MAX,
  identityZoom,
  isZoomed,
  panBy,
  wheelZoomFactor,
  zoomAtPoint,
  zoomTransform,
} from "../../lib/manual-zoom.js";

// The frame's untransformed layout box for these tests: top-left at (100, 50).
const RECT = { left: 100, top: 50 };

/**
 * Where a content point (in the frame's own unscaled coordinates) lands on
 * screen under a zoom state. Origin 0 0: world = base + t + s·local.
 * @param {{ scale: number, tx: number, ty: number }} state
 * @param {{ x: number, y: number }} local
 */
function worldOf(state, local) {
  return {
    x: RECT.left + state.tx + state.scale * local.x,
    y: RECT.top + state.ty + state.scale * local.y,
  };
}

/**
 * Current on-screen rect left/top for a state (what getBoundingClientRect gives).
 * @param {{ scale: number, tx: number, ty: number }} state
 */
function rectFor(state) {
  return { left: RECT.left + state.tx, top: RECT.top + state.ty };
}

describe("zoomAtPoint", () => {
  it("keeps the content under the anchor stationary", () => {
    // Anchor at (300, 250): local content point under it at scale 1.
    const local = { x: 200, y: 200 };
    const s1 = zoomAtPoint(identityZoom(), 1.5, 300, 250, RECT.left, RECT.top);
    expect(s1.scale).toBeCloseTo(1.5);
    expect(worldOf(s1, local).x).toBeCloseTo(300);
    expect(worldOf(s1, local).y).toBeCloseTo(250);

    // Zoom again at a different anchor; its content point stays put too.
    const r = rectFor(s1);
    const local2 = {
      x: (400 - r.left) / s1.scale,
      y: (300 - r.top) / s1.scale,
    };
    const s2 = zoomAtPoint(s1, 2, 400, 300, r.left, r.top);
    expect(worldOf(s2, local2).x).toBeCloseTo(400);
    expect(worldOf(s2, local2).y).toBeCloseTo(300);
  });

  it("clamps to the maximum and never below 1", () => {
    let state = identityZoom();
    for (let i = 0; i < 30; i += 1) {
      const r = rectFor(state);
      state = zoomAtPoint(state, 2, 300, 250, r.left, r.top);
    }
    expect(state.scale).toBe(MANUAL_ZOOM_MAX);
    for (let i = 0; i < 30; i += 1) {
      const r = rectFor(state);
      state = zoomAtPoint(state, 0.5, 300, 250, r.left, r.top);
    }
    expect(state).toEqual(identityZoom());
  });

  it("snaps to identity when the scale returns to 1", () => {
    const s1 = zoomAtPoint(identityZoom(), 2, 300, 250, RECT.left, RECT.top);
    const r = rectFor(s1);
    // Zooming out at a DIFFERENT anchor would leave a residual offset;
    // reaching 1 must reset it.
    const s2 = zoomAtPoint(s1, 0.5, 500, 400, r.left, r.top);
    expect(s2).toEqual(identityZoom());
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in on scroll up and out on scroll down", () => {
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
  });

  it("normalizes line-mode deltas (Firefox mouse wheels)", () => {
    // deltaMode 1 with |delta| 3 ≈ a ~48px pixel-mode tick.
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48, 0));
  });

  it("bounds a single event's effect", () => {
    expect(wheelZoomFactor(-100000, 0)).toBeLessThanOrEqual(1.7);
    expect(wheelZoomFactor(100000, 0)).toBeGreaterThanOrEqual(0.55);
  });
});

describe("panBy", () => {
  const view = { viewWidth: 1000, viewHeight: 700 };
  /** A zoomed state; the tests care about the delta applied, not the start. */
  const zoomed = { scale: 2, tx: -300, ty: -100 };

  it("pans freely inside the bounds", () => {
    const s = panBy(zoomed, 40, -30, {
      rectLeft: -300,
      rectTop: -100,
      rectWidth: 2000,
      rectHeight: 1400,
      ...view,
    });
    expect(s.tx).toBe(zoomed.tx + 40);
    expect(s.ty).toBe(zoomed.ty - 30);
    expect(s.scale).toBe(2);
  });

  it("clamps an oversized axis so no gap opens at either edge", () => {
    const bounds = {
      rectLeft: -300,
      rectTop: -100,
      rectWidth: 2000,
      rectHeight: 1400,
      ...view,
    };
    // Dragging right: the left edge stops at 0 (delta capped at +300).
    expect(panBy(zoomed, 500, 0, bounds).tx).toBe(zoomed.tx + 300);
    // Dragging left: the right edge stops at the viewport edge.
    // newLeft floor = viewWidth - rectWidth = -1000 -> delta capped at -700.
    expect(panBy(zoomed, -5000, 0, bounds).tx).toBe(zoomed.tx - 700);
    // Same for Y: top edge stops at 0 (delta capped at +100).
    expect(panBy(zoomed, 0, 500, bounds).ty).toBe(zoomed.ty + 100);
  });

  it("keeps a smaller-than-viewport axis fully on screen", () => {
    const bounds = {
      rectLeft: 100,
      rectTop: -100,
      rectWidth: 400,
      rectHeight: 1400,
      ...view,
    };
    // Left edge can't cross 0: delta capped at -100.
    expect(panBy(zoomed, -500, 0, bounds).tx).toBe(zoomed.tx - 100);
    // Right edge can't cross the viewport edge: newLeft cap 600, delta +500.
    expect(panBy(zoomed, 5000, 0, bounds).tx).toBe(zoomed.tx + 500);
  });

  it("does nothing at identity (no zoom, no pan)", () => {
    const s = panBy(identityZoom(), 40, 40, {
      rectLeft: 0,
      rectTop: 0,
      rectWidth: 500,
      rectHeight: 500,
      ...view,
    });
    expect(s).toEqual(identityZoom());
  });
});

describe("zoomTransform / isZoomed", () => {
  it("is empty at identity and a translate+scale otherwise", () => {
    expect(zoomTransform(identityZoom())).toBe("");
    expect(isZoomed(identityZoom())).toBe(false);
    const s = zoomAtPoint(identityZoom(), 2, 300, 250, RECT.left, RECT.top);
    expect(isZoomed(s)).toBe(true);
    expect(zoomTransform(s)).toBe(
      `translate(${s.tx}px, ${s.ty}px) scale(${s.scale})`,
    );
  });
});
