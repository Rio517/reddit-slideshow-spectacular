import { describe, expect, it } from "vitest";
import {
  renderSlide,
  MEDIA_CLASS,
  mediaUrlIsSafe,
} from "../../lib/overlay-render.js";

/**
 * @param {Partial<import("../../lib/slides.js").Slide>} [overrides]
 * @returns {import("../../lib/slides.js").Slide}
 */
function slide(overrides) {
  return {
    id: "t3_x:0",
    postId: "t3_x",
    provider: "reddit-image",
    kind: "image",
    mediaUrl: "https://i.redd.it/x.jpg",
    sourceUrl: "https://i.redd.it/x.jpg",
    permalink: "https://old.reddit.com/r/x/comments/x/x/",
    title: "A title",
    over18: false,
    durationMode: "timer",
    audioAvailable: false,
    sourceWidth: 1000,
    sourceHeight: 500,
    quality: "original",
    mimeType: "image/jpeg",
    filenameHint: "t3_x.jpg",
    ...overrides,
  };
}

describe("renderSlide", () => {
  it("renders an image with src, alt, and the media class", () => {
    const el = renderSlide(slide());
    expect(el.tagName).toBe("IMG");
    expect(el.getAttribute("src")).toBe("https://i.redd.it/x.jpg");
    expect(el.getAttribute("alt")).toBe("A title");
    expect(el.classList.contains(MEDIA_CLASS)).toBe(true);
    expect(el.dataset.slideId).toBe("t3_x:0");
  });

  it("starts a large image from its preview and upgrades to the original", () => {
    // 30 MP: big enough for the canvas zoom, small enough to display the
    // decoded original.
    const el = /** @type {HTMLImageElement} */ (
      renderSlide(
        slide({
          previewUrl: "https://preview.redd.it/a.jpg?width=1080",
          sourceWidth: 5000,
          sourceHeight: 6000,
        }),
      )
    );
    expect(el.src).toBe("https://preview.redd.it/a.jpg?width=1080");
    expect(el.dataset.rsFull).toBe(slide().mediaUrl);
    expect(el.dataset.rsw).toBe("5000");
    expect(el.dataset.rsh).toBe("6000");
  });

  it("sizes a preview-first image from the original's dimensions", () => {
    // The preview's intrinsic size (~1080px) is smaller than most viewports;
    // without explicit sizing a monster would display sub-viewport, and a
    // mid-size slide would visibly resize when the upgrade lands.
    const el = /** @type {HTMLImageElement} */ (
      renderSlide(
        slide({
          previewUrl: "https://preview.redd.it/a.jpg?width=1080",
          sourceWidth: 8000,
          sourceHeight: 6000,
        }),
      )
    );
    expect(el.classList.contains(`${MEDIA_CLASS}--upscale`)).toBe(true);
    expect(el.style.getPropertyValue("--rs-ar")).toBe(String(8000 / 6000));
  });

  it("keeps the preview as the display for a monster image", () => {
    // >40 MP: decoding the original for display costs hundreds of MB and
    // (with several in flight) freezes the machine; the zoom reads its
    // detail from proxied bytes instead.
    const el = /** @type {HTMLImageElement} */ (
      renderSlide(
        slide({
          previewUrl: "https://preview.redd.it/a.jpg?width=1080",
          sourceWidth: 9000,
          sourceHeight: 12000,
        }),
      )
    );
    expect(el.src).toBe("https://preview.redd.it/a.jpg?width=1080");
    expect(el.dataset.rsFull).toBeUndefined();
    expect(el.dataset.rsLod).toBe(slide().mediaUrl);
    expect(el.dataset.rsw).toBe("9000");
  });

  it("renders an ordinary-size image directly from the original", () => {
    const el = /** @type {HTMLImageElement} */ (
      renderSlide(
        slide({
          previewUrl: "https://preview.redd.it/a.jpg?width=1080",
          sourceWidth: 2500,
          sourceHeight: 3000,
        }),
      )
    );
    expect(el.src).toBe(slide().mediaUrl);
    expect(el.dataset.rsFull).toBeUndefined();
  });

  it("fills the viewport for videos and gif images, but not static images", () => {
    const fill = `${MEDIA_CLASS}--fill`;
    expect(renderSlide(slide()).classList.contains(fill)).toBe(false);
    expect(
      renderSlide(
        slide({
          provider: "redgifs",
          kind: "video",
          mediaUrl: "https://media.redgifs.com/x.mp4",
          proxied: true,
        }),
      ).classList.contains(fill),
    ).toBe(true);
    // A gif shown as an <img>, by mime type or the isGif flag.
    expect(
      renderSlide(
        slide({
          mediaUrl: "https://media.giphy.com/x.gif",
          mimeType: "image/gif",
        }),
      ).classList.contains(fill),
    ).toBe(true);
    expect(renderSlide(slide({ isGif: true })).classList.contains(fill)).toBe(
      true,
    );
  });

  it("renders Reddit video muted, not auto-starting or looping", () => {
    const el = /** @type {HTMLVideoElement} */ (
      renderSlide(
        slide({
          provider: "reddit-video",
          kind: "video",
          mediaUrl: "https://v.redd.it/x/CMAF_720.mp4?source=fallback",
          isGif: false,
        }),
      )
    );
    expect(el.tagName).toBe("VIDEO");
    expect(el.muted).toBe(true);
    // The overlay starts playback (only when the show is playing), so the element
    // must not auto-start on its own.
    expect(el.autoplay).toBe(false);
    expect(el.loop).toBe(false);
    // No native control bar - videos follow the slideshow's own mute state.
    expect(el.controls).toBe(false);
    expect(el.getAttribute("src")).toBe(
      "https://v.redd.it/x/CMAF_720.mp4?source=fallback",
    );
    expect(el.style.aspectRatio).toBe("1000 / 500");
  });

  it("loops GIF-like Reddit video", () => {
    const el = /** @type {HTMLVideoElement} */ (
      renderSlide(slide({ kind: "video", isGif: true }))
    );
    expect(el.loop).toBe(true);
  });

  it("sizes a filled video to the largest viewport-fitting rect of its aspect", () => {
    // 1000×500 -> 2:1. The box becomes the biggest 2:1 rect inside the viewport,
    // so the black around it is real backdrop (clickable to close), not part of
    // the video element (whose native controls would otherwise span the window).
    const el = renderSlide(
      slide({
        provider: "reddit-video",
        kind: "video",
        mediaUrl: "https://v.redd.it/x/CMAF_720.mp4",
        sourceWidth: 1000,
        sourceHeight: 500,
      }),
    );
    expect(el.style.getPropertyValue("--rs-fit-w")).toBe("min(100vw, 200vh)");
    expect(el.style.getPropertyValue("--rs-fit-h")).toBe("min(100vh, 50vw)");
  });

  it("sizes a filled gif image the same way", () => {
    const el = renderSlide(
      slide({ isGif: true, sourceWidth: 800, sourceHeight: 800 }),
    );
    expect(el.style.getPropertyValue("--rs-fit-w")).toBe("min(100vw, 100vh)");
    expect(el.style.getPropertyValue("--rs-fit-h")).toBe("min(100vh, 100vw)");
  });

  it("leaves a dimensionless filled video full-bleed (no fit vars)", () => {
    const el = renderSlide(
      slide({
        provider: "redgifs",
        kind: "video",
        mediaUrl: "https://media.redgifs.com/x.mp4",
        proxied: true,
        sourceWidth: undefined,
        sourceHeight: undefined,
      }),
    );
    expect(el.style.getPropertyValue("--rs-fit-w")).toBe("");
    expect(el.style.getPropertyValue("--rs-fit-h")).toBe("");
  });

  it("does not constrain an embed iframe's box, only its aspect-ratio", () => {
    const el = renderSlide(
      slide({
        provider: "redgifs",
        kind: "embed",
        mediaUrl: "https://www.redgifs.com/ifr/abc",
        embedUrl: "https://www.redgifs.com/ifr/abc",
        sourceWidth: 1080,
        sourceHeight: 1920,
      }),
    );
    expect(el.style.getPropertyValue("--rs-fit-w")).toBe("");
    expect(el.style.aspectRatio).toBe("1080 / 1920");
  });

  it("leaves a static image's box unconstrained (no fit vars, no aspect-ratio)", () => {
    const el = renderSlide(slide({ sourceWidth: 1000, sourceHeight: 500 }));
    expect(el.style.getPropertyValue("--rs-fit-w")).toBe("");
    expect(el.style.aspectRatio).toBe("");
  });

  it("refuses a non-HTTPS or data: image URL at the sink", () => {
    expect(
      renderSlide(slide({ mediaUrl: "http://i.redd.it/x.jpg" })).hasAttribute(
        "src",
      ),
    ).toBe(false);
    expect(
      renderSlide(
        slide({ mediaUrl: "data:image/png;base64,AAAA" }),
      ).hasAttribute("src"),
    ).toBe(false);
  });

  it("refuses a non-Reddit (or non-HTTPS) host for direct video", () => {
    const video = (/** @type {string} */ url) =>
      renderSlide(
        slide({ provider: "reddit-video", kind: "video", mediaUrl: url }),
      );
    expect(video("https://evil.example/x.mp4").hasAttribute("src")).toBe(false);
    expect(video("http://v.redd.it/x/CMAF_720.mp4").hasAttribute("src")).toBe(
      false,
    );
    expect(video("https://v.redd.it/x/CMAF_720.mp4").getAttribute("src")).toBe(
      "https://v.redd.it/x/CMAF_720.mp4",
    );
  });

  it("allows a direct Catbox video host", () => {
    const el = renderSlide(
      slide({
        provider: "catbox",
        kind: "video",
        mediaUrl: "https://files.catbox.moe/abcd12.mp4",
        mimeType: "video/mp4",
      }),
    );
    expect(el.getAttribute("src")).toBe("https://files.catbox.moe/abcd12.mp4");
    expect(
      mediaUrlIsSafe(
        slide({
          provider: "catbox",
          kind: "video",
          mediaUrl: "https://files.catbox.moe/abcd12.mp4",
        }),
      ),
    ).toBe(true);
  });

  it("allows a direct Streamable CDN video host (varying subdomain), rejects look-alikes", () => {
    const streamable = (/** @type {string} */ url) =>
      slide({ provider: "streamable", kind: "video", mediaUrl: url });
    const el = renderSlide(
      streamable("https://cdn-cf-east.streamable.com/video/mp4/x.mp4?token=1"),
    );
    expect(el.getAttribute("src")).toBe(
      "https://cdn-cf-east.streamable.com/video/mp4/x.mp4?token=1",
    );
    expect(
      mediaUrlIsSafe(streamable("https://cdn-b-west.streamable.com/x.mp4")),
    ).toBe(true);
    // The dot-prefixed suffix can't be spoofed by a look-alike domain, and the
    // bare domain (no CDN subdomain) is not a real mp4 host.
    expect(mediaUrlIsSafe(streamable("https://evilstreamable.com/x.mp4"))).toBe(
      false,
    );
    expect(mediaUrlIsSafe(streamable("https://streamable.com/o/x.mp4"))).toBe(
      false,
    );
    expect(
      mediaUrlIsSafe(streamable("http://cdn-cf-east.streamable.com/x.mp4")),
    ).toBe(false);
  });

  it("suppresses the Referer for Redgifs direct video only", () => {
    const redgifs = renderSlide(
      slide({
        provider: "redgifs",
        kind: "video",
        mediaUrl: "https://media.redgifs.com/X.mp4",
      }),
    );
    expect(redgifs.getAttribute("src")).toBe("https://media.redgifs.com/X.mp4");
    expect(redgifs.getAttribute("referrerpolicy")).toBe("no-referrer");
    // v.redd.it doesn't need it - keep its Referer.
    const vreddit = renderSlide(
      slide({
        provider: "reddit-video",
        kind: "video",
        mediaUrl: "https://v.redd.it/x/CMAF_720.mp4",
      }),
    );
    expect(vreddit.getAttribute("referrerpolicy")).toBeNull();
  });

  it("treats an embed as unsafe when its embedUrl is rejected (off-host/empty)", () => {
    const embed = (
      /** @type {Partial<import("../../lib/slides.js").Slide>} */ o,
    ) => slide({ provider: "redgifs", kind: "embed", ...o });
    // A good Redgifs embed passes.
    expect(
      mediaUrlIsSafe(embed({ embedUrl: "https://www.redgifs.com/ifr/abc" })),
    ).toBe(true);
    // An off-host or non-HTTPS embed URL is unsafe, so the overlay can skip it.
    expect(
      mediaUrlIsSafe(embed({ embedUrl: "https://evil.example/ifr/abc" })),
    ).toBe(false);
    expect(mediaUrlIsSafe(embed({ embedUrl: undefined, mediaUrl: "" }))).toBe(
      false,
    );
  });

  it("renders Redgifs as a fullscreen-capable iframe using embedUrl", () => {
    const el = renderSlide(
      slide({
        provider: "redgifs",
        kind: "embed",
        mediaUrl: "https://www.redgifs.com/ifr/abc",
        embedUrl: "https://www.redgifs.com/ifr/abc",
        sourceWidth: 1080,
        sourceHeight: 1920,
      }),
    );
    expect(el.tagName).toBe("IFRAME");
    expect(el.getAttribute("src")).toBe("https://www.redgifs.com/ifr/abc");
    expect(el.hasAttribute("allowfullscreen")).toBe(true);
    expect(el.style.aspectRatio).toBe("1080 / 1920");
  });
});
