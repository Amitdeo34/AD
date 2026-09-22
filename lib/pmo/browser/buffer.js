// Just enough Buffer to run the engine in a browser tab.
//
// The ZIP, XLSX, DOCX and PDF code is written against Node's Buffer, which is
// itself a Uint8Array with a few accessors bolted on. Rather than rewrite four
// binary formats for the browser, this supplies those accessors — the ones the
// engine actually calls, and no more.
const utf8Decoder = new TextDecoder('utf-8');
const utf8Encoder = new TextEncoder();

export class PortableBuffer extends Uint8Array {
  static isBuffer(value) {
    return value instanceof PortableBuffer;
  }

  static alloc(size) {
    return new PortableBuffer(size);
  }

  static from(value, encoding) {
    if (typeof value === 'string') {
      if (encoding === 'latin1' || encoding === 'binary') {
        const out = new PortableBuffer(value.length);
        for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
        return out;
      }
      if (encoding === 'hex') {
        const out = new PortableBuffer(value.length >> 1);
        for (let i = 0; i < out.length; i += 1) out[i] = parseInt(value.substr(i * 2, 2), 16);
        return out;
      }
      const encoded = utf8Encoder.encode(value);
      const out = new PortableBuffer(encoded.length);
      out.set(encoded);
      return out;
    }
    if (value instanceof ArrayBuffer) return new PortableBuffer(value);
    if (ArrayBuffer.isView(value)) {
      const out = new PortableBuffer(value.byteLength);
      out.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      return out;
    }
    if (Array.isArray(value)) return new PortableBuffer(value);
    return new PortableBuffer(0);
  }

  static concat(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new PortableBuffer(total);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }

  toString(encoding = 'utf8', start = 0, end = this.length) {
    const slice = this.subarray(start, end);
    if (encoding === 'hex') {
      let out = '';
      for (const byte of slice) out += byte.toString(16).padStart(2, '0');
      return out;
    }
    if (encoding === 'latin1' || encoding === 'binary') {
      // Chunked: a single spread of a multi-megabyte PDF blows the stack.
      let out = '';
      for (let at = 0; at < slice.length; at += 0x8000) {
        out += String.fromCharCode.apply(null, slice.subarray(at, at + 0x8000));
      }
      return out;
    }
    return utf8Decoder.decode(slice);
  }

  equals(other) {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i += 1) if (this[i] !== other[i]) return false;
    return true;
  }

  get view() {
    // Cached because the ZIP reader asks for it once per entry field.
    if (!this._view) this._view = new DataView(this.buffer, this.byteOffset, this.byteLength);
    return this._view;
  }

  readUInt16LE(offset = 0) { return this.view.getUint16(offset, true); }
  readUInt32LE(offset = 0) { return this.view.getUint32(offset, true); }
  readBigUInt64LE(offset = 0) { return this.view.getBigUint64(offset, true); }
  writeUInt16LE(value, offset = 0) { this.view.setUint16(offset, value, true); return offset + 2; }
  writeUInt32LE(value, offset = 0) { this.view.setUint32(offset, value >>> 0, true); return offset + 4; }
}

/** Install as the global the engine's binary code expects. */
export function installBuffer(target = globalThis) {
  if (!target.Buffer) target.Buffer = PortableBuffer;
  return target.Buffer;
}
