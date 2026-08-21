import { describe, expect, it } from "vitest";
import {
  LOD_MIN_SOURCE_PIXELS,
  needsLod,
  mipPlan,
  pickLevel,
  drawWindow,
} from "../../lib/zoom-lod.js";

describe("needsLod", () => {
  it("engages only above the source-area threshold", () => {
    // Above ~8 MP the transform path rasterizes GPU surfaces in the
    // hundreds of MB (profiled as driver stalls); the canvas draws bounded
    // windows, so it takes over early.
    expect(needsLod(3000, 2000)).toBe(false); // 6 MP: transform zoom is cheap
    expect(needsLod(4000, 5333)).toBe(true); // 21 MP
    expect(needsLod(9000, 12000)).toBe(true); // 108 MP
    expect(needsLod(4000, 2000)).toBe(true); // 8 MP boundary
    expect(4000 * 2000).toBe(LOD_MIN_SOURCE_PIXELS);
  });

  it("never engages for unknown dimensions", () => {
    expect(needsLod(0, 0)).toBe(false);
    expect(needsLod(9000, 0)).toBe(false);
  });
});

describe("mipPlan", () => {
  it("halves until the level drops under the floor", () => {
    expect(mipPlan(9000, 12000)).toEqual([
      { width: 4500, height: 6000 },
      { width: 2250, height: 3000 },
      { width: 1125, height: 1500 },
    ]);
  });

  it("is empty when even the first half would be under the floor", () => {
    expect(mipPlan(1200, 900)).toEqual([]);
  });
});

describe("pickLevel", () => {
  const levels = [
    { width: 4500, height: 6000 },
    { width: 2250, height: 3000 },
    { width: 1125, height: 1500 },
  ];

  it("picks the smallest level that still covers the needed width", () => {
    expect(pickLevel(levels, 2000)).toBe(1);
    expect(pickLevel(levels, 1000)).toBe(2);
    expect(pickLevel(levels, 4500)).toBe(0);
  });

  it("returns -1 when only the original is sharp enough", () => {
    expect(pickLevel(levels, 5000)).toBe(-1);
    expect(pickLevel([], 100)).toBe(-1);
  });
});

describe("drawWindow", () => {
  const base = {
    viewWidth: 1000,
    viewHeight: 800,
    sourceWidth: 9000,
    sourceHeight: 12000,
  };

  it("maps the visible part of an overfilling image to a source window", () => {
    // Image shown at 2000x2667 css, panned so (-500,-600) is its top-left.
    const w = drawWindow({
      ...base,
      rectLeft: -500,
      rectTop: -600,
      rectWidth: 2000,
      rectHeight: 2667,
    });
    if (!w) throw new Error("expected a visible window");
    expect(w.dx).toBe(0);
    expect(w.dy).toBe(0);
    expect(w.dw).toBe(1000);
    expect(w.dh).toBe(800);
    expect(w.sx).toBeCloseTo((500 / 2000) * 9000);
    expect(w.sy).toBeCloseTo((600 / 2667) * 12000);
    expect(w.sw).toBeCloseTo((1000 / 2000) * 9000);
    expect(w.sh).toBeCloseTo((800 / 2667) * 12000);
  });

  it("draws the whole image when it fits inside the viewport", () => {
    const w = drawWindow({
      ...base,
      rectLeft: 200,
      rectTop: 50,
      rectWidth: 450,
      rectHeight: 600,
    });
    expect(w).toEqual({
      sx: 0,
      sy: 0,
      sw: 9000,
      sh: 12000,
      dx: 200,
      dy: 50,
      dw: 450,
      dh: 600,
    });
  });

  it("returns null when the image is entirely off screen", () => {
    const w = drawWindow({
      ...base,
      rectLeft: 1200,
      rectTop: 0,
      rectWidth: 400,
      rectHeight: 500,
    });
    expect(w).toBeNull();
  });
});
