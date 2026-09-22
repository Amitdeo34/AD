// A ZIP reader and writer, built on the deflate that ships with Node.
//
// XLSX and DOCX are both ZIP containers full of XML, so this one module is what
// lets the engine read the workbooks a client sends and write the workbooks and
// Word documents a PMO sends back — without a single dependency.
import zlib from 'node:zlib';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

export function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function findEocd(buf) {
  const floor = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= floor; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * Read a ZIP archive into a Map of path → Buffer.
 *
 * Only the two compression methods a spreadsheet tool ever emits are supported
 * — stored and deflate — and anything else is reported by name rather than
 * silently dropped, because a half-read DPR is worse than a rejected one.
 */
export function unzip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('Not a ZIP container (no end-of-central-directory record found)');

  let entryCount = buf.readUInt16LE(eocd + 10);
  let centralOffset = buf.readUInt32LE(eocd + 16);

  // ZIP64: the 32-bit fields saturate on archives with very many entries.
  if (centralOffset === 0xffffffff || entryCount === 0xffff) {
    const locator = eocd - 20;
    if (locator >= 0 && buf.readUInt32LE(locator) === EOCD64_LOCATOR_SIG) {
      const end64 = Number(buf.readBigUInt64LE(locator + 8));
      if (buf.readUInt32LE(end64) === EOCD64_SIG) {
        entryCount = Number(buf.readBigUInt64LE(end64 + 32));
        centralOffset = Number(buf.readBigUInt64LE(end64 + 48));
      }
    }
  }

  const files = new Map();
  let p = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (buf.readUInt32LE(p) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    let localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);

    if (localOffset === 0xffffffff) {
      // The real offset lives in the ZIP64 extra field (header id 0x0001).
      let q = p + 46 + nameLength;
      const extraEnd = q + extraLength;
      while (q + 4 <= extraEnd) {
        const id = buf.readUInt16LE(q);
        const size = buf.readUInt16LE(q + 2);
        if (id === 0x0001) {
          // Fields appear in a fixed order, each present only when saturated.
          let r = q + 4;
          if (buf.readUInt32LE(p + 24) === 0xffffffff) r += 8; // uncompressed
          if (compressedSize === 0xffffffff) r += 8;
          localOffset = Number(buf.readBigUInt64LE(r));
          break;
        }
        q += 4 + size;
      }
    }

    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;

    if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) continue;
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, zlib.inflateRawSync(raw));
    else throw new Error(`Unsupported compression method ${method} in "${name}"`);
  }
  return files;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Write a ZIP archive from `[path, contents]` pairs. Contents may be a string
 * or a Buffer; every entry is deflated unless that would make it larger.
 */
export function zip(entries, { modified = new Date(2020, 0, 1, 0, 0, 0) } = {}) {
  const { time, date } = dosDateTime(modified);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, contents] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(contents) ? contents : Buffer.from(String(contents), 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, eocd]);
}
