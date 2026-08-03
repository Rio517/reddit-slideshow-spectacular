/**
 * Base64 transcode for moving binary across runtime.sendMessage, which is
 * JSON-serialized - a raw ArrayBuffer/Uint8Array is silently dropped (it arrives
 * as {} in Chrome). The blob proxy fetches media bytes in the background and
 * ships them to the content script as a base64 string instead. Chunked so a
 * multi-MB clip doesn't blow the call stack via String.fromCharCode's spread.
 */

// 32k bytes per fromCharCode call - well under the argument-count limit.
const CHUNK = 0x8000;

/**
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * @param {string} b64
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Decode base64 into a Blob off the JS hot path: the browser's native
 * data-URL fetch decoder replaces a per-character JS loop.
 * @param {string} base64
 * @param {string} type MIME type for the resulting Blob
 * @returns {Promise<Blob>}
 */
export async function base64ToBlob(base64, type) {
  const res = await fetch(`data:application/octet-stream;base64,${base64}`);
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type });
}
