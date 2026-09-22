// A short, stable key for a piece of text.
//
// Used to recognise "this shape of sheet again". It is a cache key, not a
// digest — nothing security-bearing hangs off it — so a small synchronous
// hash is the right tool, and it works identically on a server and in a
// browser tab.
export function shortHash(text) {
  // FNV-1a, run as two independent 32-bit lanes for a 64-bit key.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ ((code << 5) | (code >>> 3)), 0x85ebca6b) >>> 0;
  }
  return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'));
}
