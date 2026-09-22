// The smallest XML helpers the Office formats need: entity handling and a tag
// scanner. Office XML is machine-written and shallow, so a scanner beats a
// full parser here — it is faster, and it cannot be tripped by a DPR that
// happens to contain angle brackets in a remark.

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeXml(text) {
  if (!text || !text.includes('&')) return text ?? '';
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Control characters are illegal in XML 1.0 and Excel refuses the file.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** Pull the attributes off a tag like `<c r="B4" t="s">`. */
export function attributes(tag) {
  const out = {};
  for (const [, name, quoted, bare] of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')|([\w:.-]+)(?=[\s/>])/g)) {
    if (name) out[name] = decodeXml(quoted ?? bare ?? '');
  }
  return out;
}

/** Every `<name …>…</name>` (and `<name … />`) element, in document order. */
export function elements(xml, name) {
  const pattern = new RegExp(`<${name}(\\s[^>]*?)?(/)?>`, 'g');
  const out = [];
  let match;
  while ((match = pattern.exec(xml))) {
    const open = match[0];
    if (match[2]) {
      out.push({ attrs: attributes(open), inner: '' });
      continue;
    }
    const close = xml.indexOf(`</${name}>`, pattern.lastIndex);
    const end = close < 0 ? xml.length : close;
    out.push({ attrs: attributes(open), inner: xml.slice(pattern.lastIndex, end) });
    pattern.lastIndex = end + name.length + 3;
  }
  return out;
}

/** The text of the first `<name>` child, entities resolved. */
export function textOf(xml, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decodeXml(match[1]) : '';
}

/** All text nodes concatenated, which is how rich-text runs are flattened. */
export function allText(xml, name) {
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g');
  let out = '';
  for (const match of xml.matchAll(pattern)) out += decodeXml(match[1]);
  return out;
}
