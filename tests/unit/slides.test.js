import { describe, expect, it } from "vitest";
import {
  slidesFromListing,
  imgurAlbumId,
  buildImgurAlbumImageSlides,
} from "../../lib/slides.js";
import fixture from "../fixtures/reddit-json/subreddit-direct-images.json";
import galleryFixture from "../fixtures/reddit-json/gallery.json";
import animatedGalleryFixture from "../fixtures/reddit-json/gallery-animated.json";
import videoFixture from "../fixtures/reddit-json/reddit-video.json";
import gifFixture from "../fixtures/reddit-json/reddit-gif.json";
import redgifsFixture from "../fixtures/reddit-json/redgifs.json";
import imgurGifvFixture from "../fixtures/reddit-json/imgur-gifv.json";
import catboxVideoFixture from "../fixtures/reddit-json/catbox-video.json";
import streamableFixture from "../fixtures/reddit-json/streamable.json";
import giphyFixture from "../fixtures/reddit-json/giphy.json";
import crosspostFixture from "../fixtures/reddit-json/crosspost.json";
import imgurAlbumFixture from "../fixtures/reddit-json/imgur-album.json";

describe("slidesFromListing", () => {
  it("normalizes direct i.redd.it images as original quality slides", () => {
    const slides = slidesFromListing(fixture);
    expect(slides[0]).toMatchObject({
      id: "t3_alpha:0",
      postId: "t3_alpha",
      provider: "reddit-image",
      kind: "image",
      mediaUrl: "https://i.redd.it/alpha.jpg",
      sourceUrl: "https://i.redd.it/alpha.jpg",
      permalink:
        "https://old.reddit.com/r/example/comments/alpha/ultra_high_resolution_landscape/",
      title: "Ultra high resolution landscape",
      over18: false,
      durationMode: "timer",
      sourceWidth: 7680,
      sourceHeight: 4320,
      quality: "original",
    });
  });

  it("keeps preview-only images but marks them preview quality and emits the preview URL", () => {
    const slides = slidesFromListing(fixture);
    expect(slides[1]).toMatchObject({
      id: "t3_gamma:0",
      provider: "reddit-image",
      kind: "image",
      quality: "preview",
      mediaUrl:
        "https://preview.redd.it/gamma.jpg?width=1080&crop=smart&auto=webp&s=fake",
      sourceWidth: 1600,
      sourceHeight: 900,
    });
  });

  it("captures reddit's smallest preview resolution as hashUrl for dedup hashing", () => {
    const slides = slidesFromListing(fixture);
    expect(slides[0].hashUrl).toBe(
      "https://preview.redd.it/alpha.jpg?width=108&crop=smart&auto=webp&s=fake108",
    );
  });

  it("leaves hashUrl undefined when the post has no preview resolutions", () => {
    const slides = slidesFromListing(fixture);
    expect(slides[1].hashUrl).toBeUndefined();
  });

  it("leaves hashUrl undefined when the smallest resolution is on a non-hashable host", () => {
    const slides = slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_offhost",
              title: "Off-host preview",
              permalink: "/r/x/comments/offhost/x/",
              url: "https://i.redd.it/offhost.jpg",
              post_hint: "image",
              preview: {
                images: [
                  {
                    source: { url: "https://i.redd.it/offhost.jpg" },
                    resolutions: [
                      { url: "https://evil.example/offhost.jpg?width=108" },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    });
    expect(slides[0].hashUrl).toBeUndefined();
  });

  it("resolves permalinks against the given page origin", () => {
    const slides = slidesFromListing(fixture, "https://www.reddit.com");
    expect(slides[0].permalink).toBe(
      "https://www.reddit.com/r/example/comments/alpha/ultra_high_resolution_landscape/",
    );
  });

  /**
   * @param {string} permalink
   * @returns {import("../../lib/slides.js").Slide}
   */
  function permalinkSlide(permalink) {
    const slides = slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_pl",
              title: "Permalink post",
              permalink,
              url: "https://i.redd.it/ok.png",
              post_hint: "image",
            },
          },
        ],
      },
    });
    return slides[0];
  }

  it("drops a permalink that resolves off reddit (defense-in-depth)", () => {
    // An absolute, non-reddit permalink would otherwise feed "open original"
    // and the byline author link; pin both sinks to reddit by dropping it.
    expect(
      permalinkSlide("https://evil.example/phish").permalink,
    ).toBeUndefined();
  });

  it("keeps a permalink on a reddit subdomain", () => {
    expect(
      permalinkSlide("https://np.reddit.com/r/x/comments/abc/").permalink,
    ).toBe("https://np.reddit.com/r/x/comments/abc/");
  });

  it("does not throw on a post with no title", () => {
    const listing = {
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_notitle",
              url_overridden_by_dest: "https://i.redd.it/notitle.png",
              post_hint: "image",
            },
          },
        ],
      },
    };
    const slides = slidesFromListing(listing);
    expect(slides[0].filenameHint).toBe("rss-notitle.png");
  });

  it("carries the largest reddit preview for the preview-first swap", () => {
    const listing = {
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_prev1",
              title: "Huge",
              url_overridden_by_dest: "https://i.redd.it/huge.jpg",
              post_hint: "image",
              preview: {
                images: [
                  {
                    source: {
                      url: "https://preview.redd.it/huge.jpg",
                      width: 9000,
                      height: 12000,
                    },
                    resolutions: [
                      { url: "https://preview.redd.it/huge.jpg?width=108" },
                      { url: "https://preview.redd.it/huge.jpg?width=1080" },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    };
    const slides = slidesFromListing(listing);
    expect(slides[0].previewUrl).toBe(
      "https://preview.redd.it/huge.jpg?width=1080",
    );
  });

  it("drops a preview from a host outside the allowlist", () => {
    const listing = {
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_prev2",
              title: "Sneaky",
              url_overridden_by_dest: "https://i.redd.it/x.jpg",
              post_hint: "image",
              preview: {
                images: [
                  {
                    source: { url: "https://evil.example/x.jpg" },
                    resolutions: [{ url: "https://evil.example/x.jpg" }],
                  },
                ],
              },
            },
          },
        ],
      },
    };
    const slides = slidesFromListing(listing);
    expect(slides[0].previewUrl).toBeUndefined();
  });

  it("caps a long title at a word boundary in the filename", () => {
    const listing = {
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_1abcd",
              title:
                "The quick brown fox jumps over the lazy dog again and again forever and ever",
              url_overridden_by_dest: "https://i.redd.it/fox.jpg",
              post_hint: "image",
            },
          },
        ],
      },
    };
    const slides = slidesFromListing(listing);
    expect(slides[0].filenameHint).toBe(
      "rss-the-quick-brown-fox-jumps-over-the-lazy-dog-again-and-again-1abcd.jpg",
    );
  });

  it("hard-caps a single unbroken word in the filename", () => {
    const listing = {
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_2wxyz",
              title: "a".repeat(70),
              url_overridden_by_dest: "https://i.redd.it/word.jpg",
              post_hint: "image",
            },
          },
        ],
      },
    };
    const slides = slidesFromListing(listing);
    expect(slides[0].filenameHint).toBe(`rss-${"a".repeat(60)}-2wxyz.jpg`);
  });

  it("uses url when url_overridden_by_dest is missing", () => {
    const slides = slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_urlonly",
              title: "URL only image",
              permalink: "/r/example/comments/urlonly/url_only_image/",
              url: "https://i.redd.it/urlonly.webp",
              post_hint: "image",
            },
          },
        ],
      },
    });

    expect(slides[0]).toMatchObject({
      id: "t3_urlonly:0",
      mediaUrl: "https://i.redd.it/urlonly.webp",
      sourceUrl: "https://i.redd.it/urlonly.webp",
      quality: "original",
      mimeType: "image/webp",
    });
  });

  /**
   * @param {string} author
   * @returns {import("../../lib/slides.js").Slide}
   */
  function singleAuthorSlide(author) {
    return slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_byline",
              title: "Byline post",
              author,
              url: "https://i.redd.it/x.jpg",
              post_hint: "image",
            },
          },
        ],
      },
    })[0];
  }

  it("attaches the post author to its slides as the byline", () => {
    expect(singleAuthorSlide("alice").author).toBe("alice");
  });

  it("treats a [deleted] author as no byline", () => {
    expect(singleAuthorSlide("[deleted]").author).toBeUndefined();
  });

  it("attaches the post's subreddit and vote state to its slides", () => {
    const slide = slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_sr",
              title: "Sub post",
              subreddit: "aww",
              likes: true,
              url: "https://i.redd.it/x.jpg",
              post_hint: "image",
            },
          },
        ],
      },
    })[0];
    expect(slide.subreddit).toBe("aww");
    expect(slide.likes).toBe(true);
  });
});

describe("gallery posts", () => {
  it("expands a gallery into one slide per item in gallery_data order", () => {
    const slides = slidesFromListing(galleryFixture);
    expect(slides.map((s) => s.id)).toEqual([
      "t3_gal1:0",
      "t3_gal1:1",
      "t3_gal1:2",
    ]);
    expect(slides.map((s) => s.mediaUrl)).toEqual([
      "https://preview.redd.it/aaa111.jpg?width=4000&format=pjpg&auto=webp&s=fakesig1",
      "https://preview.redd.it/bbb222.png?width=1920&format=png&auto=webp&s=fakesig2",
      "https://preview.redd.it/ccc333.jpg?width=2000&format=pjpg&auto=webp&s=fakesig3",
    ]);
  });

  it("carries gallery item dimensions, provider, and a unique filename per item", () => {
    const slides = slidesFromListing(galleryFixture);
    expect(slides[0]).toMatchObject({
      provider: "reddit-gallery",
      kind: "image",
      quality: "original",
      sourceWidth: 4000,
      sourceHeight: 3000,
      mimeType: "image/jpeg",
      filenameHint: "rss-three-photo-set-1-gal1.jpg",
    });
    expect(slides[1].mimeType).toBe("image/png");
    expect(slides[2].filenameHint).toBe("rss-three-photo-set-3-gal1.jpg");
  });

  it("skips deleted or invalid gallery items without leaving index gaps", () => {
    const slides = slidesFromListing(galleryFixture);
    expect(slides).toHaveLength(3);
  });

  it("carries the largest gallery-item preview", () => {
    const listing = {
      data: {
        children: [
          {
            data: {
              name: "t3_gprev",
              title: "Gallery with previews",
              permalink: "/r/x/comments/gprev/",
              is_gallery: true,
              gallery_data: { items: [{ media_id: "img_a" }] },
              media_metadata: {
                img_a: {
                  status: "valid",
                  s: { u: "https://i.redd.it/a.jpg", x: 9000, y: 12000 },
                  p: [
                    { u: "https://preview.redd.it/a.jpg?width=108" },
                    { u: "https://preview.redd.it/a.jpg?width=1080" },
                  ],
                },
              },
            },
          },
        ],
      },
    };
    const slides = slidesFromListing(listing);
    expect(slides[0].previewUrl).toBe(
      "https://preview.redd.it/a.jpg?width=1080",
    );
  });

  it("numbers gallery items so they are distinguishable in the jump list", () => {
    const slides = slidesFromListing(galleryFixture);
    expect(slides.map((s) => [s.galleryIndex, s.galleryTotal])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("keeps animated members instead of dropping them", () => {
    // An AnimatedImage member carries `s.gif`/`s.mp4` where a still carries
    // `s.u`; requiring `s.u` silently lost every gif in a gallery.
    const slides = slidesFromListing(animatedGalleryFixture);
    expect(slides.map((s) => s.id)).toEqual([
      "t3_galgif:0",
      "t3_galgif:1",
      "t3_galgif:2",
      "t3_galgif:3",
    ]);
    expect(slides.map((s) => s.galleryIndex)).toEqual([1, 2, 3, 4]);
  });

  it("plays an animated member from reddit's mp4 transcode", () => {
    const slides = slidesFromListing(animatedGalleryFixture);
    expect(slides[1]).toMatchObject({
      id: "t3_galgif:1",
      provider: "reddit-gallery",
      kind: "video",
      mediaUrl: "https://preview.redd.it/anim1.gif?format=mp4&s=fakemp4",
      sourceUrl: "https://i.redd.it/anim1.gif",
      downloadUrl: "https://i.redd.it/anim1.gif",
      durationMode: "media",
      isGif: true,
      mimeType: "video/mp4",
      sourceWidth: 480,
      sourceHeight: 792,
      filenameHint: "rss-mixed-set-2-galgif.gif",
    });
    expect(slides[1].hashUrl).toBe(
      "https://preview.redd.it/anim1.gif?width=108&crop=smart&format=png8&s=fake108",
    );
  });

  it("shows the gif itself when an animated member has no transcode", () => {
    const slides = slidesFromListing(animatedGalleryFixture);
    expect(slides[2]).toMatchObject({
      id: "t3_galgif:2",
      kind: "image",
      mediaUrl: "https://i.redd.it/anim2.gif",
      durationMode: "timer",
      mimeType: "image/gif",
    });
  });

  it("ignores an animated member's transcode on a host outside the allowlist", () => {
    const slides = slidesFromListing(animatedGalleryFixture);
    expect(slides[3]).toMatchObject({
      id: "t3_galgif:3",
      kind: "image",
      mediaUrl: "https://i.redd.it/anim3.gif",
      durationMode: "timer",
    });
  });

  it("leaves the still members of a mixed gallery untouched", () => {
    const slides = slidesFromListing(animatedGalleryFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_galgif:0",
      kind: "image",
      mediaUrl:
        "https://preview.redd.it/still1.jpg?width=1600&format=pjpg&auto=webp&s=fakestill",
      durationMode: "timer",
      mimeType: "image/jpeg",
    });
    expect(slides[0].downloadUrl).toBeUndefined();
  });

  it("leaves a single-surviving-image gallery unnumbered (no '1/1')", () => {
    // A gallery whose other items are deleted/invalid collapses to one slide;
    // it should read as a plain post, not "(1/1)".
    const oneValid = {
      data: {
        children: [
          {
            data: {
              name: "t3_gsolo",
              title: "Mostly-deleted gallery",
              permalink: "/r/x/comments/gsolo/",
              is_gallery: true,
              gallery_data: {
                items: [
                  { media_id: "img_a" },
                  { media_id: "img_b", is_deleted: true },
                ],
              },
              media_metadata: {
                img_a: {
                  status: "valid",
                  s: { u: "https://i.redd.it/a.jpg", x: 100, y: 100 },
                },
                img_b: { status: "failed" },
              },
            },
          },
        ],
      },
    };
    const slides = slidesFromListing(oneValid);
    expect(slides).toHaveLength(1);
    expect(slides[0].galleryIndex).toBeUndefined();
    expect(slides[0].galleryTotal).toBeUndefined();
  });
});

describe("Reddit-hosted video posts", () => {
  it("normalizes v.redd.it video with the fallback URL and audio metadata", () => {
    const slides = slidesFromListing(videoFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_vid1:0",
      provider: "reddit-video",
      kind: "video",
      mediaUrl: "https://v.redd.it/vidfake1/CMAF_720.mp4?source=fallback",
      sourceUrl: "https://v.redd.it/vidfake1",
      durationMode: "media",
      audioAvailable: true,
      durationSeconds: 14,
      sourceWidth: 720,
      sourceHeight: 1280,
      isGif: false,
      mimeType: "video/mp4",
      dashUrl: "https://v.redd.it/vidfake1/DASHPlaylist.mpd?a=000&v=1&f=sd",
      hlsUrl: "https://v.redd.it/vidfake1/HLSPlaylist.m3u8?a=000&v=1&f=sd",
      filenameHint: "rss-short-clip-with-sound-vid1.mp4",
    });
  });

  it("reports no audio for GIF-like Reddit video", () => {
    const slides = slidesFromListing(videoFixture);
    expect(slides[1]).toMatchObject({
      id: "t3_vid2:0",
      isGif: true,
      audioAvailable: false,
      durationSeconds: 6,
    });
  });
});

describe("Reddit gif posts", () => {
  it("plays an i.redd.it gif from reddit's mp4 transcode, not as a timed image", () => {
    const slides = slidesFromListing(gifFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_gif1:0",
      postId: "t3_gif1",
      provider: "reddit-image",
      kind: "video",
      mediaUrl: "https://preview.redd.it/gif1.gif?format=mp4&s=fakemp4",
      sourceUrl: "https://i.redd.it/gif1.gif",
      durationMode: "media",
      audioAvailable: false,
      isGif: true,
      mimeType: "video/mp4",
      sourceWidth: 498,
      sourceHeight: 373,
      quality: "original",
    });
  });

  it("saves the original gif rather than the transcode", () => {
    const slides = slidesFromListing(gifFixture);
    expect(slides[0].downloadUrl).toBe("https://i.redd.it/gif1.gif");
    expect(slides[0].filenameHint).toBe("rss-cat-loaf-timelapse-gif1.gif");
  });

  it("keeps the still preview as hashUrl so a reposted gif still dedups", () => {
    const slides = slidesFromListing(gifFixture);
    expect(slides[0].hashUrl).toBe(
      "https://preview.redd.it/gif1.gif?width=108&crop=smart&format=png8&s=fake108",
    );
  });

  it("falls back to the image path when reddit shipped no mp4 transcode", () => {
    const slides = slidesFromListing(gifFixture);
    expect(slides[1]).toMatchObject({
      id: "t3_gif2:0",
      kind: "image",
      mediaUrl: "https://i.redd.it/gif2.gif",
      durationMode: "timer",
      mimeType: "image/gif",
    });
  });

  it("ignores an mp4 transcode on a host outside the allowlist", () => {
    const slides = slidesFromListing(gifFixture);
    expect(slides[2]).toMatchObject({
      id: "t3_gif3:0",
      kind: "image",
      mediaUrl: "https://i.redd.it/gif3.gif",
      durationMode: "timer",
    });
  });

  it("upgrades an externally hosted gif from its external-preview transcode", () => {
    const slides = slidesFromListing(gifFixture);
    expect(slides[3]).toMatchObject({
      id: "t3_gif4:0",
      kind: "video",
      mediaUrl:
        "https://external-preview.redd.it/gif4.gif?format=mp4&s=fakemp4",
      sourceUrl: "https://i.imgur.com/gif4.gif",
      durationMode: "media",
      isGif: true,
      over18: true,
    });
  });
});

describe("Redgifs posts", () => {
  it("embeds the first-party iframe and takes aspect ratio from oembed", () => {
    const slides = slidesFromListing(redgifsFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_rg1:0",
      provider: "redgifs",
      kind: "embed",
      mediaUrl: "https://www.redgifs.com/ifr/fakeslugword",
      embedUrl: "https://www.redgifs.com/ifr/fakeslugword",
      sourceUrl: "https://www.redgifs.com/watch/fakeslugword",
      durationMode: "timer",
      over18: true,
      sourceWidth: 1080,
      sourceHeight: 1920,
    });
  });
});

describe("Imgur .gifv posts", () => {
  it("plays the .mp4 (transformed from .gifv) as a direct, looping video", () => {
    const slides = slidesFromListing(imgurGifvFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_img1:0",
      postId: "t3_img1",
      provider: "imgur",
      kind: "video",
      mediaUrl: "https://i.imgur.com/AbCdEf1.mp4",
      sourceUrl: "https://i.imgur.com/AbCdEf1.gifv",
      permalink:
        "https://old.reddit.com/r/example/comments/img1/imgur_gifv_clip/",
      title: "Imgur gifv clip",
      durationMode: "media",
      audioAvailable: false,
      isGif: true,
      mimeType: "video/mp4",
      sourceWidth: 800,
      sourceHeight: 600,
      filenameHint: "rss-imgur-gifv-clip-img1.mp4",
    });
  });

  it("transforms a bare imgur.com/<id>.gifv to the i.imgur.com mp4", () => {
    const slides = slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_img2",
              title: "Bare imgur gifv",
              permalink: "/r/x/comments/img2/bare/",
              url_overridden_by_dest: "https://imgur.com/ZyXwV9.gifv",
            },
          },
        ],
      },
    });
    expect(slides[0]).toMatchObject({
      provider: "imgur",
      kind: "video",
      mediaUrl: "https://i.imgur.com/ZyXwV9.mp4",
    });
    expect(slides[0].proxied).toBeUndefined(); // direct play
  });
});

describe("Catbox video posts", () => {
  it("plays a files.catbox.moe .mp4 as a direct (non-proxied) native video", () => {
    const slides = slidesFromListing(catboxVideoFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_cat1:0",
      postId: "t3_cat1",
      provider: "catbox",
      kind: "video",
      mediaUrl: "https://files.catbox.moe/abcd12.mp4",
      sourceUrl: "https://files.catbox.moe/abcd12.mp4",
      permalink: "https://old.reddit.com/r/example/comments/cat1/catbox_clip/",
      title: "Catbox clip",
      durationMode: "media",
      mimeType: "video/mp4",
      filenameHint: "rss-catbox-clip-cat1.mp4",
    });
    expect(slides[0].proxied).toBeUndefined(); // direct play, no background fetch
  });

  it("ignores a non-video catbox file (handled by the image path)", () => {
    const slides = slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_cat2",
              title: "Catbox image",
              permalink: "/r/x/comments/cat2/img/",
              url_overridden_by_dest: "https://files.catbox.moe/pic.png",
            },
          },
        ],
      },
    });
    expect(slides[0]).toMatchObject({
      kind: "image",
      provider: "reddit-image",
    });
  });
});

describe("Streamable posts", () => {
  it("emits an embed slide (resolved to native video in the background)", () => {
    const slides = slidesFromListing(streamableFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_st1:0",
      postId: "t3_st1",
      provider: "streamable",
      kind: "embed",
      embedUrl: "https://streamable.com/e/abc123",
      mediaUrl: "https://streamable.com/e/abc123",
      sourceUrl: "https://streamable.com/abc123",
      permalink:
        "https://old.reddit.com/r/example/comments/st1/streamable_clip/",
      title: "Streamable clip",
      durationMode: "timer",
    });
  });
});

describe("Giphy posts", () => {
  it("transforms a giphy.com/gifs/<slug-id> watch page to the direct mp4", () => {
    const slides = slidesFromListing(giphyFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_gp1:0",
      postId: "t3_gp1",
      provider: "giphy",
      kind: "video",
      mediaUrl: "https://media.giphy.com/media/l0HlBO3eHHpvbicmc/giphy.mp4",
      sourceUrl: "https://giphy.com/gifs/funny-cat-dance-l0HlBO3eHHpvbicmc",
      title: "Giphy reaction",
      durationMode: "media",
      audioAvailable: false,
      isGif: true,
      mimeType: "video/mp4",
      sourceWidth: 480,
      sourceHeight: 270,
    });
  });

  it("extracts the id from a slugless giphy.com/gifs/<id> URL", () => {
    const slides = slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_gp2",
              title: "Slugless",
              permalink: "/r/x/comments/gp2/s/",
              url_overridden_by_dest: "https://giphy.com/gifs/abc123XYZ",
            },
          },
        ],
      },
    });
    expect(slides[0]).toMatchObject({
      provider: "giphy",
      mediaUrl: "https://media.giphy.com/media/abc123XYZ/giphy.mp4",
    });
  });

  it("leaves a direct media.giphy.com .gif to the image path", () => {
    const slides = slidesFromListing({
      data: {
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_gp3",
              title: "Direct gif",
              permalink: "/r/x/comments/gp3/g/",
              url_overridden_by_dest:
                "https://media.giphy.com/media/abc123XYZ/giphy.gif",
            },
          },
        ],
      },
    });
    expect(slides[0]).toMatchObject({ kind: "image" });
  });
});

describe("Imgur album posts", () => {
  it("emits a single placeholder slide carrying the album id and context", () => {
    const slides = slidesFromListing(imgurAlbumFixture);
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({
      id: "t3_alb1:album",
      postId: "t3_alb1",
      provider: "imgur-album",
      kind: "image",
      mediaUrl: "",
      sourceUrl: "https://imgur.com/a/AbCd12",
      title: "Imgur album",
    });
  });

  it("extracts the album/gallery id from the various Imgur URL shapes", () => {
    expect(imgurAlbumId("https://imgur.com/a/AbCd12")).toBe("AbCd12");
    expect(
      imgurAlbumId(
        "https://imgur.com/gallery/photo-of-pup-tiger-lilly-1254-2orxIa1",
      ),
    ).toBe("2orxIa1");
    expect(imgurAlbumId("https://imgur.com/gallery/2orxIa1")).toBe("2orxIa1");
    expect(imgurAlbumId("https://i.imgur.com/abc.jpg")).toBeUndefined();
    expect(imgurAlbumId("https://imgur.com/AbCd12")).toBeUndefined();
  });

  it("builds numbered i.imgur.com image slides for a multi-image album", () => {
    /** @type {any} */
    const placeholder = {
      postId: "t3_alb1",
      permalink: "https://old.reddit.com/r/x/comments/alb1/album/",
      title: "Imgur album",
      over18: false,
    };
    const slides = buildImgurAlbumImageSlides(placeholder, [
      { hash: "XV5chUH", ext: ".jpg", width: 3000, height: 4000 },
      { hash: "Rg6ZisF", ext: ".jpg", width: 3000, height: 4000 },
    ]);
    expect(slides.map((s) => s.mediaUrl)).toEqual([
      "https://i.imgur.com/XV5chUH.jpg",
      "https://i.imgur.com/Rg6ZisF.jpg",
    ]);
    expect(slides.map((s) => [s.galleryIndex, s.galleryTotal])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("leaves a single-image album unnumbered (no '1/1')", () => {
    /** @type {any} */
    const placeholder = { postId: "t3_alb2", title: "Solo" };
    const slides = buildImgurAlbumImageSlides(placeholder, [
      { hash: "OneHash", ext: ".png" },
    ]);
    expect(slides).toHaveLength(1);
    expect(slides[0].mediaUrl).toBe("https://i.imgur.com/OneHash.png");
    expect(slides[0].galleryIndex).toBeUndefined();
    expect(slides[0].galleryTotal).toBeUndefined();
  });

  it("builds a native video slide for a .mp4 album member", () => {
    /** @type {any} */
    const placeholder = { postId: "t3_alb3", title: "Mixed" };
    const slides = buildImgurAlbumImageSlides(placeholder, [
      { hash: "PicHash", ext: ".jpg" },
      { hash: "Loud", ext: ".mp4", hasSound: true, looping: true },
      { hash: "Quiet", ext: ".mp4", hasSound: false, looping: true },
    ]);
    // Image member stays an image.
    expect(slides[0]).toMatchObject({ kind: "image", mimeType: "image/jpeg" });
    // A .mp4 with sound plays through once as a direct video (not proxied, not a gif).
    expect(slides[1]).toMatchObject({
      kind: "video",
      mediaUrl: "https://i.imgur.com/Loud.mp4",
      durationMode: "media",
      mimeType: "video/mp4",
      audioAvailable: true,
    });
    expect(slides[1].isGif).toBe(false);
    expect(slides[1].proxied).toBeUndefined();
    // A silent looping .mp4 reads as a gif (fills, loops, no pan/zoom).
    expect(slides[2]).toMatchObject({ kind: "video", audioAvailable: false });
    expect(slides[2].isGif).toBe(true);
  });
});

describe("crossposts", () => {
  it("resolves media from crosspost_parent_list with the outer post's context", () => {
    const slides = slidesFromListing(crosspostFixture);
    expect(slides[0]).toMatchObject({
      id: "t3_xp1:0",
      postId: "t3_xp1",
      provider: "reddit-video",
      kind: "video",
      mediaUrl: "https://v.redd.it/parentfake1/CMAF_720.mp4?source=fallback",
      permalink:
        "https://old.reddit.com/r/example/comments/xp1/crossposted_clip/",
      title: "Crossposted clip seen by the user",
      durationSeconds: 20,
    });
  });
});
