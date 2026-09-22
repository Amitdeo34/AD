// Raw deflate, on Node.
//
// The browser build swaps this module for `codec.browser.js`, which does the
// same two jobs without Node. Everything above this line — ZIP, XLSX, DOCX,
// PDF — is written against these two functions and does not know or care
// which one it got.
import zlib from 'node:zlib';

export const inflateRaw = (bytes) => zlib.inflateRawSync(bytes);
export const deflateRaw = (bytes) => zlib.deflateRawSync(bytes, { level: 9 });
export const inflateZlib = (bytes) => zlib.inflateSync(bytes);
