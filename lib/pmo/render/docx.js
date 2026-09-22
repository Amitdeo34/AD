// The report as a Word document.
//
// Consulting deliverables get edited before they are issued — a partner adds a
// sentence, a client's name is corrected, a section is cut. An HTML page
// cannot absorb that; a .docx can. Charts come through as the table behind
// them, which is what survives track-changes and a black-and-white print
// anyway.
import { zip } from '../ingest/zip.js';
import { escapeXml } from '../ingest/xml.js';
import { chartTable } from './charts.js';
import { formatCell, NUMERIC_FORMATS } from './format.js';
import { formatDate } from '../dates.js';

const esc = (value) => escapeXml(String(value ?? ''));

const TONE_FILL = { good: 'F2FBF2', warn: 'FFFAED', bad: 'FDF2F2' };
const SEVERITY_COLOR = { Critical: 'D03B3B', High: 'EC835A', Medium: 'B8860B', Low: '0CA30C' };

function run(text, { bold = false, italic = false, color = null, size = null } = {}) {
  const props = [
    bold ? '<w:b/>' : '',
    italic ? '<w:i/>' : '',
    color ? `<w:color w:val="${color}"/>` : '',
    size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : '',
  ].join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function paragraph(runs, { style = null, spacingAfter = 120, pageBreakBefore = false, align = null } = {}) {
  const props = [
    style ? `<w:pStyle w:val="${style}"/>` : '',
    pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    align ? `<w:jc w:val="${align}"/>` : '',
    `<w:spacing w:after="${spacingAfter}"/>`,
  ].join('');
  return `<w:p><w:pPr>${props}</w:pPr>${Array.isArray(runs) ? runs.join('') : runs}</w:p>`;
}

const text = (value, options) => paragraph(run(value, options), options);

function cell(content, { width, fill = null, bold = false, color = null, align = 'left' }) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>`
    + (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '')
    + '<w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:left w:w="72" w:type="dxa"/><w:right w:w="72" w:type="dxa"/></w:tcMar>'
    + '</w:tcPr>'
    + paragraph(run(content, { bold, color, size: 16 }), { spacingAfter: 0, align })
    + '</w:tc>';
}

const PAGE_WIDTH = 14570; // A4 landscape, inside 12mm margins, in twips

function tableXml(columns, rows, { currency } = {}) {
  const weights = columns.map((column) => column.width ?? 14);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map((weight) => Math.round((weight / total) * PAGE_WIDTH));

  const borders = '<w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((edge) => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="E6E6E1"/>`).join('')
    + '</w:tblBorders>';

  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${columns
    .map((column, index) => cell(column.label, { width: widths[index], fill: '10284B', bold: true, color: 'FFFFFF' }))
    .join('')}</w:tr>`;

  const body = rows.map((row) => {
    const fill = TONE_FILL[row._tone] ?? null;
    return `<w:tr>${columns.map((column, index) => {
      const value = row[column.key];
      const display = formatCell(value, column.format, { currency });
      const color = column.format === 'severity' ? SEVERITY_COLOR[value] ?? null : null;
      return cell(display, {
        width: widths[index],
        fill,
        bold: column.format === 'severity',
        color,
        align: NUMERIC_FORMATS.has(column.format) ? 'right' : 'left',
      });
    }).join('')}</w:tr>`;
  }).join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="${PAGE_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr>`
    + `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`
    + head + body + '</w:tbl>'
    + paragraph('', { spacingAfter: 120 });
}

function blockXml(block, { currency }) {
  switch (block.kind) {
    case 'narrative':
      return (block.title ? text(block.title, { style: 'Heading3' }) : '')
        + block.paragraphs.map((value) => text(value)).join('');

    case 'kpis':
      return tableXml(
        [{ key: 'label', label: 'Measure', width: 20 }, { key: 'value', label: 'Value', width: 16 }, { key: 'sub', label: 'Basis', width: 30 }],
        block.items.map((kpi) => ({ label: kpi.label, value: kpi.value, sub: kpi.sub ?? '', _tone: kpi.tone === 'red' ? 'bad' : kpi.tone === 'amber' ? 'warn' : kpi.tone === 'green' ? 'good' : null })),
        { currency },
      );

    case 'table':
      return block.rows?.length
        ? tableXml(block.columns, block.rows, { currency })
          + (block.note ? text(block.note, { italic: true, size: 16 }) : '')
        : text(block.emptyText ?? 'No entries.', { italic: true });

    case 'chart': {
      const data = chartTable(block);
      if (!data.rows.length) return '';
      return text(block.title, { style: 'Heading3' })
        + tableXml(
          data.columns.map((column) => ({ key: column, label: column, width: 16 })),
          data.rows.map((row) => Object.fromEntries(row.map((value, index) => [data.columns[index], value]))),
          { currency },
        );
    }

    case 'exceptions':
      return (block.title ? text(block.title, { style: 'Heading3' }) : '')
        + (block.items?.length
          ? block.items.map((item) => (
            paragraph([
              run(`${item.severity}  `, { bold: true, color: SEVERITY_COLOR[item.severity] ?? '000000' }),
              run(item.title, { bold: true }),
              run(`   ${item.category}${item.area ? ` · ${item.area}` : ''}${item.isNew ? ' · New' : ` · ${item.trend}`}`, { italic: true, color: '8A8A85', size: 16 }),
            ], { spacingAfter: 40 })
            + text(item.subject, { bold: true, spacingAfter: 40 })
            + text(item.detail, { spacingAfter: 40 })
            + paragraph([run('Recommended action: ', { bold: true }), run(item.recommendation)], { spacingAfter: 40 })
            + text(`${item.metricLabel ? `${item.metricLabel}: ${item.metricDisplay} · ` : ''}Owner: ${item.owner ?? 'To be assigned'}${item.dueDate ? ` · Due: ${formatDate(item.dueDate)}` : ''}`,
              { italic: true, color: '52514E', size: 16, spacingAfter: 200 })
          )).join('')
          : text(block.emptyText ?? 'No exceptions.', { italic: true }));

    case 'callout':
      return paragraph([run(`${block.title}. `, { bold: true }), run(block.text)], { spacingAfter: 160 });

    case 'list':
      return (block.title ? text(block.title, { style: 'Heading3' }) : '')
        + block.items.map((item) => text(`•  ${item}`, { spacingAfter: 60 })).join('');

    default:
      return '';
  }
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="10284B"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="52514E"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="360" w:after="140"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="E6E6E1"/></w:pBdr></w:pPr><w:rPr><w:b/><w:color w:val="10284B"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="10284B"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
</w:styles>`;

/**
 * Render a report pack to a .docx file.
 *
 * @returns {Buffer}
 */
export function renderDocx(pack) {
  const meta = pack.meta ?? {};
  const project = meta.project ?? {};
  const currency = project.currency ?? 'INR';

  const facts = [
    ['Project', project.name], ['Client', project.client], ['Contractor', project.contractor],
    ['Prepared by', project.consultant], ['Reporting period', meta.period?.label],
    ['Data date', meta.asOf ? formatDate(meta.asOf) : null],
    ['Issued', formatDate(meta.generatedAt ?? new Date())],
    ['Data readiness', Number.isFinite(meta.dataReadiness) ? `${meta.dataReadiness}/100` : null],
  ].filter(([, value]) => value);

  const cover = text(pack.title, { style: 'Title' })
    + text(pack.subtitle ?? '', { style: 'Subtitle' })
    + tableXml(
      [{ key: 'label', label: 'Particulars', width: 20 }, { key: 'value', label: 'Detail', width: 46 }],
      facts.map(([label, value]) => ({ label, value })),
      { currency },
    );

  const body = pack.sections.map((section, index) => (
    text(`${index + 1}. ${section.title}`, { style: 'Heading1', pageBreakBefore: section.pageBreak || index === 0 })
    + (section.subtitle ? text(section.subtitle, { italic: true, color: '52514E' }) : '')
    + section.blocks.map((block) => blockXml(block, { currency })).join('')
  )).join('');

  const footer = text(
    `Generated by the PMO Reporting Engine on ${formatDate(meta.generatedAt ?? new Date())}. `
    + 'Figures derive from contractor-submitted records and are not independently verified on site unless stated.',
    { italic: true, color: '8A8A85', size: 16 },
  );

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${cover}${body}${footer}
<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="794" w:right="680" w:bottom="794" w:left="680" w:header="426" w:footer="426" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['word/styles.xml', STYLES_XML],
    ['word/document.xml', document],
  ]);
}
