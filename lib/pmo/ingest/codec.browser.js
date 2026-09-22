// Raw deflate, without Node.
//
// A spreadsheet is a ZIP of XML, so a reporting engine that runs in a browser
// tab has to do its own compression. This is a complete RFC 1951 decoder and
// a fixed-Huffman encoder — enough to read any workbook a client sends and to
// write ones Excel and Word accept.

// ---------------------------------------------------------------- inflate

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** Canonical Huffman decoding table: how many codes of each length, in order. */
function buildTable(lengths) {
  const counts = new Uint16Array(16);
  for (const length of lengths) counts[length] += 1;
  counts[0] = 0;

  const offsets = new Uint16Array(16);
  for (let length = 1; length < 16; length += 1) offsets[length] = offsets[length - 1] + counts[length - 1];

  const symbols = new Uint16Array(lengths.length);
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    if (lengths[symbol]) {
      symbols[offsets[lengths[symbol]]] = symbol;
      offsets[lengths[symbol]] += 1;
    }
  }
  return { counts, symbols };
}

const FIXED_LITERALS = buildTable((() => {
  const lengths = new Uint8Array(288);
  lengths.fill(8, 0, 144);
  lengths.fill(9, 144, 256);
  lengths.fill(7, 256, 280);
  lengths.fill(8, 280, 288);
  return lengths;
})());
const FIXED_DISTANCES = buildTable(new Uint8Array(30).fill(5));

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.position = 0;
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  bits(count) {
    while (this.bitCount < count) {
      if (this.position >= this.bytes.length) throw new Error('Compressed data ended unexpectedly');
      this.bitBuffer |= this.bytes[this.position] << this.bitCount;
      this.position += 1;
      this.bitCount += 8;
    }
    const value = this.bitBuffer & ((1 << count) - 1);
    this.bitBuffer >>>= count;
    this.bitCount -= count;
    return value;
  }

  /** Huffman codes arrive most-significant bit first, one bit at a time. */
  symbol(table) {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length < 16; length += 1) {
      code |= this.bits(1);
      const count = table.counts[length];
      if (code - first < count) return table.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('Invalid Huffman code in compressed data');
  }
}

function readDynamicTables(reader) {
  const literalCount = reader.bits(5) + 257;
  const distanceCount = reader.bits(5) + 1;
  const codeLengthCount = reader.bits(4) + 4;

  const codeLengths = new Uint8Array(19);
  for (let i = 0; i < codeLengthCount; i += 1) codeLengths[CODE_LENGTH_ORDER[i]] = reader.bits(3);
  const codeTable = buildTable(codeLengths);

  const lengths = new Uint8Array(literalCount + distanceCount);
  let index = 0;
  while (index < lengths.length) {
    const symbol = reader.symbol(codeTable);
    if (symbol < 16) {
      lengths[index] = symbol;
      index += 1;
    } else if (symbol === 16) {
      if (index === 0) throw new Error('Invalid code length repeat');
      const previous = lengths[index - 1];
      const repeat = reader.bits(2) + 3;
      for (let i = 0; i < repeat; i += 1) lengths[index + i] = previous;
      index += repeat;
    } else if (symbol === 17) {
      index += reader.bits(3) + 3;
    } else {
      index += reader.bits(7) + 11;
    }
  }

  return {
    literals: buildTable(lengths.subarray(0, literalCount)),
    distances: buildTable(lengths.subarray(literalCount)),
  };
}

/** Decompress a raw deflate stream. */
export function inflateRaw(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const reader = new BitReader(input);
  // Office XML compresses roughly four to one, so this saves most regrowths.
  let output = new Uint8Array(Math.max(input.length * 4, 1024));
  let length = 0;

  const ensure = (extra) => {
    if (length + extra <= output.length) return;
    let size = output.length * 2;
    while (size < length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(output.subarray(0, length));
    output = grown;
  };

  for (;;) {
    const final = reader.bits(1);
    const type = reader.bits(2);

    if (type === 0) {
      // Stored: byte-aligned, with a length and its complement.
      reader.bitBuffer = 0;
      reader.bitCount = 0;
      const size = input[reader.position] | (input[reader.position + 1] << 8);
      reader.position += 4;
      ensure(size);
      output.set(input.subarray(reader.position, reader.position + size), length);
      reader.position += size;
      length += size;
    } else if (type === 1 || type === 2) {
      const tables = type === 1
        ? { literals: FIXED_LITERALS, distances: FIXED_DISTANCES }
        : readDynamicTables(reader);

      for (;;) {
        const symbol = reader.symbol(tables.literals);
        if (symbol < 256) {
          ensure(1);
          output[length] = symbol;
          length += 1;
        } else if (symbol === 256) {
          break;
        } else {
          const lengthIndex = symbol - 257;
          if (lengthIndex >= LENGTH_BASE.length) throw new Error('Invalid length code in compressed data');
          const copyLength = LENGTH_BASE[lengthIndex] + reader.bits(LENGTH_EXTRA[lengthIndex]);
          const distanceIndex = reader.symbol(tables.distances);
          const distance = DIST_BASE[distanceIndex] + reader.bits(DIST_EXTRA[distanceIndex]);
          if (distance > length) throw new Error('Invalid back-reference in compressed data');
          ensure(copyLength);
          // Deliberately byte by byte: an overlapping copy is legal and is how
          // deflate encodes a run.
          let from = length - distance;
          for (let i = 0; i < copyLength; i += 1) {
            output[length] = output[from];
            length += 1;
            from += 1;
          }
        }
      }
    } else {
      throw new Error('Invalid deflate block type');
    }

    if (final) break;
  }

  return output.subarray(0, length);
}

/** Decompress a zlib-wrapped stream (a two-byte header and a checksum). */
export function inflateZlib(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (input.length < 2) throw new Error('Not a zlib stream');
  return inflateRaw(input.subarray(2));
}

// ---------------------------------------------------------------- deflate

const WINDOW = 32768;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;

function lengthCode(value) {
  for (let i = LENGTH_BASE.length - 1; i >= 0; i -= 1) if (value >= LENGTH_BASE[i]) return i;
  return 0;
}

function distanceCode(value) {
  for (let i = DIST_BASE.length - 1; i >= 0; i -= 1) if (value >= DIST_BASE[i]) return i;
  return 0;
}

class BitWriter {
  constructor() {
    this.bytes = new Uint8Array(1024);
    this.length = 0;
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  ensure(extra) {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  /** Extra bits and headers: least-significant bit first. */
  bits(value, count) {
    this.bitBuffer |= (value & ((1 << count) - 1)) << this.bitCount;
    this.bitCount += count;
    while (this.bitCount >= 8) {
      this.ensure(1);
      this.bytes[this.length] = this.bitBuffer & 0xff;
      this.length += 1;
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }

  /** Huffman codes: most-significant bit first, so they go in reversed. */
  code(value, count) {
    for (let i = count - 1; i >= 0; i -= 1) this.bits((value >>> i) & 1, 1);
  }

  finish() {
    if (this.bitCount > 0) {
      this.ensure(1);
      this.bytes[this.length] = this.bitBuffer & 0xff;
      this.length += 1;
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
    return this.bytes.subarray(0, this.length);
  }
}

function writeLiteral(writer, symbol) {
  if (symbol < 144) writer.code(0x30 + symbol, 8);
  else writer.code(0x190 + symbol - 144, 9);
}

function writeLengthSymbol(writer, symbol) {
  if (symbol < 280) writer.code(symbol - 256, 7);
  else writer.code(0xc0 + symbol - 280, 8);
}

/**
 * Compress with LZ77 and the fixed Huffman tables.
 *
 * Fixed rather than dynamic tables on purpose: it costs a few percent of ratio
 * and saves the whole tree-building pass, which keeps this small enough to
 * read and to trust. Output is ordinary deflate — Excel, Word and zlib itself
 * all read it.
 */
export function deflateRaw(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const writer = new BitWriter();
  writer.bits(1, 1); // final block
  writer.bits(1, 2); // fixed Huffman

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const previous = new Int32Array(input.length).fill(-1);
  const hashAt = (at) => (
    ((input[at] << 10) ^ (input[at + 1] << 5) ^ input[at + 2]) & (HASH_SIZE - 1)
  );

  let at = 0;
  while (at < input.length) {
    let bestLength = 0;
    let bestDistance = 0;

    if (at + MIN_MATCH <= input.length) {
      const hash = hashAt(at);
      let candidate = head[hash];
      let chain = 0;
      const limit = Math.min(MAX_MATCH, input.length - at);
      while (candidate >= 0 && at - candidate <= WINDOW && chain < 32) {
        let length = 0;
        while (length < limit && input[candidate + length] === input[at + length]) length += 1;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = at - candidate;
          if (length >= limit) break;
        }
        candidate = previous[candidate];
        chain += 1;
      }
      previous[at] = head[hash];
      head[hash] = at;
    }

    if (bestLength >= MIN_MATCH) {
      const code = lengthCode(bestLength);
      writeLengthSymbol(writer, code + 257);
      if (LENGTH_EXTRA[code]) writer.bits(bestLength - LENGTH_BASE[code], LENGTH_EXTRA[code]);
      const distance = distanceCode(bestDistance);
      writer.code(distance, 5);
      if (DIST_EXTRA[distance]) writer.bits(bestDistance - DIST_BASE[distance], DIST_EXTRA[distance]);

      // Register the skipped positions so later matches can still find them.
      for (let i = 1; i < bestLength; i += 1) {
        if (at + i + MIN_MATCH <= input.length) {
          const hash = hashAt(at + i);
          previous[at + i] = head[hash];
          head[hash] = at + i;
        }
      }
      at += bestLength;
    } else {
      writeLiteral(writer, input[at]);
      at += 1;
    }
  }

  writeLengthSymbol(writer, 256); // end of block
  return writer.finish();
}
