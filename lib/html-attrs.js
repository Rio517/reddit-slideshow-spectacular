/**
 * An attribute's decoded value from an opening tag; undefined when absent.
 *
 * @param {string} tag
 * @param {string} name
 */
export function attr(tag, name) {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : decodeEntities(value);
}

/** @type {Record<string, string>} */
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** @param {string} text */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()] ?? match;
    const code =
      entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : Number(entity.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}
