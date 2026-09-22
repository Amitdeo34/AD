// Best-effort text extraction from PDFs.
//
// Plenty of sites still circulate the DPR as a PDF print-out. This pulls the
// text out well enough to read a tabular layout back, but it is explicitly
// best-effort: scanned PDFs hold pictures, not text, and nothing here can read
// those. Callers surface the result for review rather than trusting it.
import { inflateRaw, inflateZlib } from './codec.js';

function inflate(raw) {
  // A PDF stream may or may not carry the zlib wrapper; try both framings.
  for (const method of [inflateZlib, inflateRaw]) {
    try {
      return Buffer.from(method(raw));
    } catch {
      // try the next framing
    }
  }
  return null;
}

function decodeLiteral(body) {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
    if (next in escapes) {
      out += escapes[next];
      i += 1;
    } else if (/[0-7]/.test(next)) {
      const octal = /^[0-7]{1,3}/.exec(body.slice(i + 1))[0];
      out += String.fromCharCode(parseInt(octal, 8));
      i += octal.length;
    } else if (next === '\n') i += 1;
    else i += 1;
  }
  return out;
}

function decodeHex(body) {
  const hex = body.replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  // Hex strings in a PDF are most often UTF-16BE, which shows up as a BOM or
  // as a run of high bytes that are zero.
  if (/^feff/i.test(hex)) {
    for (let i = 4; i + 3 < hex.length + 1; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return out;
  }
  for (let i = 0; i + 1 < hex.length + 1; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isFinite(code) && code) out += String.fromCharCode(code);
  }
  return out;
}

function textFromContent(content) {
  const lines = [];
  let line = '';
  // Walk the content stream operator by operator, keeping the layout hints
  // that matter: Td/TD/T*/TJ gaps become spaces, ET and line moves end a line.
  const pattern = /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|\bT[Jj*dD]\b|\bET\b|\bTL\b|(-?\d+\.?\d*)/g;
  let match;
  let pendingGap = 0;
  while ((match = pattern.exec(content))) {
    const token = match[0];
    if (token.startsWith('(')) {
      if (pendingGap < -100) line += ' ';
      line += decodeLiteral(token.slice(1, -1));
      pendingGap = 0;
    } else if (token.startsWith('<') && token.endsWith('>')) {
      line += decodeHex(token.slice(1, -1));
      pendingGap = 0;
    } else if (token === 'Td' || token === 'TD' || token === 'T*' || token === 'ET') {
      if (line.trim()) lines.push(line.trim());
      line = '';
      pendingGap = 0;
    } else if (match[1] !== undefined) {
      pendingGap = Number(match[1]);
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/**
 * Extract text lines from a PDF.
 *
 * @returns {{lines: string[], pages: number, scanned: boolean}} `scanned` is
 *   true when no text could be recovered, which almost always means the pages
 *   are images and the file needs OCR or the original spreadsheet.
 */
export function readPdfText(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const lines = [];
  let pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

  const haystack = buf.toString('latin1');
  const streamPattern = /stream\r?\n?/g;
  let match;
  while ((match = streamPattern.exec(haystack))) {
    const start = match.index + match[0].length;
    const end = haystack.indexOf('endstream', start);
    if (end < 0) break;
    streamPattern.lastIndex = end;

    const header = haystack.slice(Math.max(0, match.index - 400), match.index);
    const raw = buf.subarray(start, end);
    let content = null;
    if (/FlateDecode/.test(header)) {
      const out = inflate(raw);
      if (out) content = out.toString('latin1');
    } else if (!/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode|LZWDecode|RunLengthDecode|ASCII85Decode)/.test(header)) {
      content = raw.toString('latin1');
    }
    if (content && /\bT[Jj]\b/.test(content)) lines.push(...textFromContent(content));
  }

  if (!pages) pages = 1;
  return { lines, pages, scanned: lines.length === 0 };
}

/**
 * Turn extracted lines into rows by splitting on runs of whitespace — enough
 * to recover a printed table whose columns are separated by spaces.
 */
export function linesToRows(lines) {
  return lines
    .map((line) => line.split(/\s{2,}|\t|\s\|\s/).map((cell) => cell.trim()).filter((cell, i, all) => cell !== '' || i < all.length - 1))
    .filter((row) => row.length);
}
