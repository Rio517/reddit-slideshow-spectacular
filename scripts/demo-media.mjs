// The three demo media files (puppy, two cats) shared by the demo reel
// (record-slideshow.mjs) and the hero shots (ship-heroes.mjs): the overlay's
// i.redd.it URLs are fulfilled from RS_MEDIA (default /tmp/rs-media), which is
// filled from the public sources below when a file is absent.

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

export const mediaDir = process.env.RS_MEDIA ?? "/tmp/rs-media";

// i.redd.it path -> [local file, content type].
export const FILES = {
  "/cpkr7nfk7j4h1.png": ["puppy.png", "image/png"],
  "/6pazgvbx5j4h1.png": ["cat1.png", "image/png"],
  "/rs-catgif.gif": ["cat2.gif", "image/gif"],
};

// Public sources for the demo media. The stills are the real
// r/SlideShowSpectacular posts; the cat gif uses Giphy's canonical media URL
// (the media<n>.giphy.com form Reddit serves carries an expiring token).
const SOURCES = {
  "puppy.png": "https://i.redd.it/cpkr7nfk7j4h1.png",
  "cat1.png": "https://i.redd.it/6pazgvbx5j4h1.png",
  "cat2.gif": "https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:141.0) Gecko/20100101 Firefox/141.0";

export async function ensureMedia() {
  await mkdir(mediaDir, { recursive: true });
  for (const [name, url] of Object.entries(SOURCES)) {
    const dest = join(mediaDir, name);
    const cached = await access(dest).then(
      () => true,
      () => false,
    );
    if (cached) continue;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`fetched ${name}`);
  }
}

/** Playwright route handler that serves the demo media for i.redd.it. */
export async function fulfilRedditMedia(route) {
  const { pathname } = new URL(route.request().url());
  const entry = FILES[pathname];
  if (!entry) return route.fulfill({ status: 404, body: "" });
  return route.fulfill({
    contentType: entry[1],
    body: await readFile(join(mediaDir, entry[0])),
  });
}
