import { describe, expect, it } from "vitest";
import {
  panZoomTotalSeconds,
  panZoomAnimation,
  panZoomConfig,
  resolutionAwareScale,
} from "../../lib/pan-zoom.js";

const CFG = {
  scale: 2,
  showSeconds: 2,
  zoomInSeconds: 2,
  panSeconds: 6,
  zoomOutSeconds: 2,
  showEndSeconds: 2,
};

describe("panZoomTotalSeconds", () => {
  it("sums the five phases", () => {
    expect(panZoomTotalSeconds(CFG)).toBe(14);
  });
});

describe("panZoomAnimation", () => {
  it("builds keyframes at the phase boundaries", () => {
    const { keyframes, options } = panZoomAnimation(CFG);
    expect(options.duration).toBe(14000);
    expect(keyframes.map((k) => k.offset)).toEqual([
      0,
      2 / 14,
      4 / 14,
      10 / 14,
      12 / 14,
      1,
    ]);
    // Zoomed-in phases carry the scale factor...
    expect(keyframes[2].transform).toBe("scale(2)");
    expect(keyframes[3].transform).toBe("scale(2)");
    // ...and the pan moves the origin top -> bottom.
    expect(keyframes[2].transformOrigin).toBe("50% 0%");
    expect(keyframes[3].transformOrigin).toBe("50% 100%");
    // Begins and ends on the whole image.
    expect(keyframes[0].transform).toBe("scale(1)");
    expect(keyframes[5].transform).toBe("scale(1)");
  });

  it("guards against a zero total", () => {
    const { keyframes, options } = panZoomAnimation({
      scale: 2,
      showSeconds: 0,
      zoomInSeconds: 0,
      panSeconds: 0,
      zoomOutSeconds: 0,
      showEndSeconds: 0,
    });
    expect(options.duration).toBe(0);
    expect(keyframes.every((k) => Number.isFinite(k.offset))).toBe(true);
  });
});

describe("resolutionAwareScale", () => {
  const view = {
    viewportWidth: 1000,
    viewportHeight: 1000,
    dpr: 1,
    maxScale: 6,
  };

  it("zooms a high-res image toward native density, capped at maxScale", () => {
    // 9000px tall on a 1000px view ≈ 9× before 1:1, so it hits the 6× cap.
    expect(
      resolutionAwareScale({ ...view, sourceWidth: 6000, sourceHeight: 9000 }),
    ).toBe(6);
  });

  it("zooms a barely-oversized image only a little", () => {
    // 1500px on a 1000px view reaches 1:1 at 1.5×, well under the cap.
    expect(
      resolutionAwareScale({ ...view, sourceWidth: 1500, sourceHeight: 1200 }),
    ).toBeCloseTo(1.5);
  });

  it("never zooms past native 1:1 even when the cap is higher", () => {
    // 2000px on a 1000px view is 1:1 at 2×; the 6× cap must not push it further.
    expect(
      resolutionAwareScale({ ...view, sourceWidth: 2000, sourceHeight: 2000 }),
    ).toBe(2);
  });

  it("counts device pixels, so a HiDPI display reaches 1:1 sooner", () => {
    // 2000 source px over 1000 CSS px × dpr 2 = 2000 device px → already 1:1.
    expect(
      resolutionAwareScale({
        ...view,
        dpr: 2,
        sourceWidth: 2000,
        sourceHeight: 2000,
      }),
    ).toBe(1);
  });

  it("never zooms out below 1 for an image smaller than the view", () => {
    expect(
      resolutionAwareScale({ ...view, sourceWidth: 400, sourceHeight: 400 }),
    ).toBe(1);
  });

  it("falls back to a gentle zoom when the source size is unknown", () => {
    expect(
      resolutionAwareScale({
        ...view,
        sourceWidth: undefined,
        sourceHeight: undefined,
      }),
    ).toBe(2);
  });
});

describe("panZoomConfig", () => {
  it("extracts the config from settings", () => {
    const s = /** @type {any} */ ({
      panZoomScale: 3,
      panZoomShowSeconds: 1,
      panZoomZoomInSeconds: 2,
      panZoomPanSeconds: 3,
      panZoomZoomOutSeconds: 4,
      panZoomShowEndSeconds: 5,
    });
    expect(panZoomConfig(s)).toEqual({
      scale: 3,
      showSeconds: 1,
      zoomInSeconds: 2,
      panSeconds: 3,
      zoomOutSeconds: 4,
      showEndSeconds: 5,
    });
  });
});
