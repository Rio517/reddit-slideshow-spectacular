// Build docs/store-listing/chrome/<lang>.md from docs/store-listing/<lang>.md.
//
// The Chrome Web Store's keyword-stuffing policy allows at most five popular
// platform names in a description (more only behind a link), and a what's-new
// block draws a fresh review on every release. So the Chrome copy is the main
// listing with the what's-new block cut and the platform lists shortened to
// Reddit, Imgur and Redgifs plus a link to the full list. Source of truth is
// the main listing and the substitutions below; the output is committed and
// verified by chrome-listing.test.js.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "docs", "store-listing");
const outDir = join(srcDir, "chrome");

const HOSTS_URL =
  "https://rio517.github.io/reddit-slideshow-spectacular/#program";

// Chrome's limit, and the names it would count. A domain counts as its
// platform (i.redd.it is Reddit).
export const MAX_PLATFORM_NAMES = 5;
const PLATFORM_NAMES = {
  Reddit: /redd\.?it/i,
  Imgur: /imgur/i,
  Redgifs: /redgifs/i,
  Streamable: /streamable/i,
  Giphy: /giphy/i,
  Catbox: /catbox/i,
  AirPlay: /airplay/i,
  Chromecast: /chromecast/i,
  YouTube: /youtube/i,
  Vimeo: /vimeo/i,
  GitHub: /github\.com/i,
};

/** @param {string} text */
export function platformNames(text) {
  return Object.entries(PLATFORM_NAMES)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

// Per locale: [text in the main listing, its Chrome replacement]. `null` drops
// the whole line. Every entry must match exactly once, so a reworded main
// listing fails the build instead of shipping a stale Chrome copy.
/** @type {Record<string, [string, string | null][]>} */
const SUBSTITUTIONS = {
  en: [
    [
      "(full-resolution i.redd.it where available)",
      "(full resolution where available)",
    ],
    ["Reddit-hosted video (v.redd.it), with", "Reddit-hosted video, with"],
    [
      "- Redgifs, Imgur (.gifv), Streamable, and Giphy clips, played as native video",
      `- Clips from Imgur, Redgifs and other video hosts, played as native video (full list: ${HOSTS_URL})`,
    ],
    ["- Catbox video and image files", null],
    ["ready to AirPlay or Chromecast to a TV", "ready to cast to a TV"],
    [
      "and provider clips from Imgur, Redgifs, Streamable, Giphy, and Catbox.",
      "and clips from the media hosts a post links to (all named in the privacy policy).",
    ],
  ],
  de: [
    [
      "(i.redd.it in voller Auflösung, sofern verfügbar)",
      "(in voller Auflösung, sofern verfügbar)",
    ],
    [
      "Von Reddit gehostete Videos (v.redd.it) mit Ton",
      "Von Reddit gehostete Videos mit Ton",
    ],
    [
      "- Clips von Redgifs, Imgur (.gifv), Streamable und Giphy, als natives Video abgespielt",
      `- Clips von Imgur, Redgifs und weiteren Videohostern, als natives Video abgespielt (vollständige Liste: ${HOSTS_URL})`,
    ],
    ["- Catbox-Video- und Bilddateien", null],
    [
      "bereit zum AirPlay oder Chromecast auf einen Fernseher",
      "bereit zum Streamen auf einen Fernseher",
    ],
    [
      "sowie Clips der Anbieter Imgur, Redgifs, Streamable, Giphy und Catbox.",
      "sowie Clips der Medienhoster, auf die ein Beitrag verlinkt (alle in der Datenschutzrichtlinie genannt).",
    ],
  ],
  es: [
    [
      "(resolución completa desde i.redd.it cuando está disponible)",
      "(resolución completa cuando está disponible)",
    ],
    [
      "Vídeo alojado en Reddit (v.redd.it), con",
      "Vídeo alojado en Reddit, con",
    ],
    [
      "- Clips de Redgifs, Imgur (.gifv), Streamable y Giphy, reproducidos como vídeo nativo",
      `- Clips de Imgur, Redgifs y otros servicios de vídeo, reproducidos como vídeo nativo (lista completa: ${HOSTS_URL})`,
    ],
    ["- Archivos de vídeo e imagen de Catbox", null],
    [
      "lista para emitir por AirPlay o Chromecast a un televisor",
      "lista para emitir a un televisor",
    ],
    [
      "y los clips de proveedores como Imgur, Redgifs, Streamable, Giphy y Catbox.",
      "y los clips de los servicios multimedia a los que enlaza una publicación (todos figuran en la política de privacidad).",
    ],
  ],
  fr: [
    [
      "(pleine résolution i.redd.it lorsque disponible)",
      "(pleine résolution lorsque disponible)",
    ],
    [
      "Vidéos hébergées par Reddit (v.redd.it), avec",
      "Vidéos hébergées par Reddit, avec",
    ],
    [
      "- Clips Redgifs, Imgur (.gifv), Streamable et Giphy, lus en vidéo native",
      `- Clips Imgur, Redgifs et d'autres hébergeurs vidéo, lus en vidéo native (liste complète : ${HOSTS_URL})`,
    ],
    ["- Fichiers vidéo et image Catbox", null],
    [
      "prête à être diffusée via AirPlay ou Chromecast sur un téléviseur",
      "prête à être diffusée sur un téléviseur",
    ],
    [
      "ainsi que les clips des fournisseurs Imgur, Redgifs, Streamable, Giphy et Catbox.",
      "ainsi que les clips des hébergeurs de médias vers lesquels pointe une publication (tous cités dans la politique de confidentialité).",
    ],
  ],
  it: [
    [
      "(risoluzione originale da i.redd.it, dove disponibile)",
      "(risoluzione originale, dove disponibile)",
    ],
    [
      "Video ospitati su Reddit (v.redd.it), con",
      "Video ospitati su Reddit, con",
    ],
    [
      "- Clip di Redgifs, Imgur (.gifv), Streamable e Giphy, riprodotte come video nativi",
      `- Clip di Imgur, Redgifs e altri servizi video, riprodotte come video nativi (elenco completo: ${HOSTS_URL})`,
    ],
    ["- File video e immagine di Catbox", null],
    [
      "pronta per AirPlay o Chromecast su un TV",
      "pronta per la trasmissione su un TV",
    ],
    [
      "e i clip dei provider Imgur, Redgifs, Streamable, Giphy e Catbox.",
      "e i clip dei servizi multimediali a cui rimanda un post (tutti elencati nella privacy policy).",
    ],
  ],
  ar: [
    ["(بدقّة كاملة من i.redd.it حيثما توفّرت)", "(بدقّة كاملة حيثما توفّرت)"],
    [
      "المستضافة على Reddit ‏(v.redd.it) مع صوتها",
      "المستضافة على Reddit مع صوتها",
    ],
    [
      "- مقاطع Redgifs وImgur ‏(.gifv) وStreamable وGiphy، تُشغَّل كفيديو أصلي",
      `- مقاطع Imgur وRedgifs ومواقع فيديو أخرى، تُشغَّل كفيديو أصلي (القائمة الكاملة: ${HOSTS_URL})`,
    ],
    ["- ملفات الفيديو والصور من Catbox", null],
    ["جاهزة للبث عبر AirPlay أو Chromecast إلى تلفاز", "جاهزة للبث إلى تلفاز"],
    [
      "ومقاطع المزوّدين من Imgur وRedgifs وStreamable وGiphy وCatbox.",
      "ومقاطع مواقع الوسائط التي يرتبط بها المنشور (وجميعها مذكورة في سياسة الخصوصية).",
    ],
  ],
};

const NOTE =
  "> Generated by `npm run listing:chrome` from `../LANG.md`. Edit that file or the\n" +
  "> substitutions in `scripts/chrome-listing.mjs`, not this one. It names three\n" +
  "> platforms (Chrome allows five) and carries no what's-new block.";

/**
 * Cut the what's-new block: from the first heading that ends in a version
 * (`NEW IN V1.5.1`) through the release-notes link and its blank line.
 * @param {string[]} lines
 * @param {string} lang
 */
function cutWhatsNew(lines, lang) {
  const start = lines.findIndex((line) => /\bV\d+\.\d+\.\d+\s*$/.test(line));
  const end = lines.findIndex((line) => line.includes("/releases"));
  if (start < 0 || end < start) {
    throw new Error(`${lang}: what's-new block not found`);
  }
  const after = lines[end + 1] === "" ? end + 2 : end + 1;
  return [...lines.slice(0, start), ...lines.slice(after)];
}

/**
 * @param {string} source The main listing's markdown.
 * @param {string} lang
 */
export function chromeListing(source, lang) {
  const substitutions = SUBSTITUTIONS[lang];
  if (!substitutions) throw new Error(`${lang}: no Chrome substitutions`);
  const [head, body] = source.split("## Description\n");
  if (body === undefined) throw new Error(`${lang}: no Description section`);

  let lines = cutWhatsNew(body.split("\n"), lang);
  for (const [from, to] of substitutions) {
    const hits = lines.filter((line) => line.includes(from));
    if (hits.length !== 1) {
      throw new Error(
        `${lang}: expected one line with "${from}", found ${hits.length}`,
      );
    }
    lines =
      to === null
        ? lines.filter((line) => !line.includes(from))
        : lines.map((line) => line.replace(from, to));
  }
  const description = lines.join("\n");

  const names = platformNames(description);
  if (names.length > MAX_PLATFORM_NAMES) {
    throw new Error(
      `${lang}: names ${names.length} platforms (${names.join(", ")})`,
    );
  }

  // Keep the title, name and summary; replace the source note with ours.
  const title = head.split("\n")[0].replace(/^# Store/, "# Chrome Web Store");
  const fields = head.slice(head.indexOf("## Name"));
  return `${title}\n\n${NOTE.replace("LANG", lang)}\n\n${fields}## Description\n${description}`;
}

export function buildChromeListings({ write = true } = {}) {
  /** @type {Record<string, string>} */
  const outputs = {};
  for (const file of readdirSync(srcDir)) {
    if (!file.endsWith(".md")) continue;
    const lang = file.replace(/\.md$/, "");
    outputs[lang] = chromeListing(
      readFileSync(join(srcDir, file), "utf8"),
      lang,
    );
  }
  if (write) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    for (const [lang, content] of Object.entries(outputs)) {
      writeFileSync(join(outDir, `${lang}.md`), content);
    }
  }
  return outputs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildChromeListings();
  console.log("Wrote docs/store-listing/chrome from docs/store-listing/");
}
