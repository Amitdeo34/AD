// Charts, drawn as SVG on the server.
//
// A PMO report is printed, mailed and pasted into a deck, so the chart has to
// be part of the document rather than something a browser assembles later.
// Every chart here is plain SVG with no script, and every one is accompanied
// by its own data table in the renderers — which is both the accessibility
// answer and the thing a client actually asks for.
import { escapeXml } from '../ingest/xml.js';
import { formatDate, formatMonth, startOfDay } from '../dates.js';

// Categorical slots 1–3 of the validated reference palette, in order. Three is
// the whole requirement here: planned, actual, forecast.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];

// Status colours are fixed and never re-themed. They always carry a written
// label, because the four of them are not separable by hue alone.
export const STATUS = {
  Critical: '#d03b3b',
  High: '#ec835a',
  Medium: '#fab219',
  Low: '#0ca30c',
  good: '#0ca30c',
  warn: '#fab219',
  bad: '#d03b3b',
};

const INK = '#0b0b0b';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#8a8a85';
const GRID = '#e6e6e1';
const AXIS = '#c9c9c3';

const esc = (value) => escapeXml(String(value ?? ''));

function niceTicks(max, count = 5) {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate >= raw) ?? magnitude * 10;
  const ticks = [];
  // The top tick must be at or above the largest value: a scale that stops
  // short does not clip the bar, it draws it outside the plot.
  for (let value = 0; value < max + step; value += step) ticks.push(Number(value.toFixed(10)));
  return ticks;
}

function compact(value) {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${(value / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(value / 1e5).toFixed(1)}L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatValue(value, format) {
  if (!Number.isFinite(value)) return '';
  if (format === 'percent') return `${(value * 100).toFixed(0)}%`;
  if (format === 'money') return compact(value);
  return compact(value);
}

function frame({ width, height, title, desc, body }) {
  return `<svg class="pmo-chart" role="img" aria-label="${esc(title)}" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">`
    + `<title>${esc(title)}</title><desc>${esc(desc ?? title)}</desc>`
    + `<rect width="${width}" height="${height}" fill="#ffffff"/>`
    + body
    + '</svg>';
}

function legend(entries, x, y) {
  let cursor = x;
  return entries.map((entry) => {
    const label = entry.label;
    const mark = entry.dashed
      ? `<line x1="${cursor}" y1="${y}" x2="${cursor + 16}" y2="${y}" stroke="${entry.color}" stroke-width="2" stroke-dasharray="5 3" stroke-linecap="round"/>`
      : `<rect x="${cursor}" y="${y - 4}" width="16" height="8" rx="3" fill="${entry.color}"/>`;
    const text = `<text x="${cursor + 22}" y="${y + 4}" font-size="11" fill="${INK_SECONDARY}">${esc(label)}</text>`;
    cursor += 22 + label.length * 6.1 + 18;
    return mark + text;
  }).join('');
}

// ------------------------------------------------------------------ S-curve

function scurve(spec) {
  const width = 760;
  const height = 340;
  const pad = { top: 44, right: 96, bottom: 44, left: 48 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const points = (spec.series ?? []).map((point) => ({ ...point, date: startOfDay(point.date) })).filter((point) => point.date);
  if (points.length < 2) return frame({ width, height, title: spec.title, body: `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="13" fill="${INK_MUTED}">Not enough data to plot a curve.</text>` });

  const first = points[0].date.getTime();
  const last = points[points.length - 1].date.getTime();
  const span = Math.max(last - first, 1);
  const x = (date) => pad.left + ((startOfDay(date).getTime() - first) / span) * plotWidth;
  const y = (value) => pad.top + plotHeight - Math.min(Math.max(value, 0), 1) * plotHeight;

  const path = (accessor, { from } = {}) => {
    const segments = [];
    let open = false;
    for (const point of points) {
      const value = accessor(point);
      if (!Number.isFinite(value) || (from && point.date < from)) {
        open = false;
        continue;
      }
      segments.push(`${open ? 'L' : 'M'}${x(point.date).toFixed(1)} ${y(value).toFixed(1)}`);
      open = true;
    }
    return segments.join(' ');
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((value) => (
    `<line x1="${pad.left}" y1="${y(value)}" x2="${pad.left + plotWidth}" y2="${y(value)}" stroke="${GRID}" stroke-width="1"/>`
    + `<text x="${pad.left - 8}" y="${y(value) + 4}" text-anchor="end" font-size="10" fill="${INK_MUTED}">${value * 100}%</text>`
  )).join('');

  // Six x labels at most, always including the last — but never two labels
  // close enough to overprint each other.
  const step = Math.max(1, Math.floor(points.length / 5));
  const labelled = points.filter((_, index) => index % step === 0 || index === points.length - 1);
  let lastLabelX = -Infinity;
  const xLabels = labelled
    .map((point, index) => {
      const at = x(point.date);
      const isLast = index === labelled.length - 1;
      if (at - lastLabelX < 58) {
        // Keep the final label and drop the one crowding it, so the axis
        // always ends on a readable date.
        if (!isLast) return '';
        return '';
      }
      lastLabelX = at;
      return `<text x="${at}" y="${pad.top + plotHeight + 18}" text-anchor="middle" font-size="10" fill="${INK_MUTED}">${esc(formatMonth(point.date))}</text>`;
    })
    .join('');

  const asOf = startOfDay(spec.asOf);
  const markers = [
    asOf ? { date: asOf, label: 'Data date', color: INK_MUTED } : null,
    ...(spec.markers ?? []).map((marker) => ({ ...marker, color: marker.label?.startsWith('Forecast') ? SERIES[2] : SERIES[0] })),
  ].filter(Boolean).filter((marker) => startOfDay(marker.date) >= points[0].date && startOfDay(marker.date) <= points[points.length - 1].date);

  const markerMarks = markers.map((marker, index) => (
    `<line x1="${x(marker.date)}" y1="${pad.top - 6}" x2="${x(marker.date)}" y2="${pad.top + plotHeight}" stroke="${marker.color}" stroke-width="1" stroke-dasharray="3 3"/>`
    + `<text x="${x(marker.date)}" y="${pad.top - 12 - (index % 2) * 13}" text-anchor="middle" font-size="9.5" fill="${marker.color}">${esc(marker.label)}</text>`
  )).join('');

  const lastActual = [...points].reverse().find((point) => Number.isFinite(point.actual));
  const lastPlanned = [...points].reverse().find((point) => Number.isFinite(point.planned));
  const lastForecast = [...points].reverse().find((point) => Number.isFinite(point.forecast));

  // Direct labels at the end of each line, nudged apart so they never collide.
  const endLabels = [
    lastPlanned ? { point: lastPlanned, value: lastPlanned.planned, label: 'Planned', color: SERIES[0] } : null,
    lastActual ? { point: lastActual, value: lastActual.actual, label: 'Actual', color: SERIES[1] } : null,
    lastForecast ? { point: lastForecast, value: lastForecast.forecast, label: 'Forecast', color: SERIES[2] } : null,
  ].filter(Boolean).sort((a, b) => y(a.value) - y(b.value));
  let previousY = -Infinity;
  const endMarks = endLabels.map((entry) => {
    const cy = Math.max(y(entry.value), previousY + 14);
    previousY = cy;
    return `<circle cx="${x(entry.point.date)}" cy="${y(entry.value)}" r="4" fill="${entry.color}" stroke="#ffffff" stroke-width="2"/>`
      + `<text x="${x(entry.point.date) + 9}" y="${cy + 4}" font-size="11" font-weight="600" fill="${entry.color}">${esc(entry.label)} ${(entry.value * 100).toFixed(1)}%</text>`;
  }).join('');

  const body = `<text x="${pad.left - 40}" y="22" font-size="13" font-weight="600" fill="${INK}">${esc(spec.title)}</text>`
    + gridLines
    + `<line x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${pad.left + plotWidth}" y2="${pad.top + plotHeight}" stroke="${AXIS}" stroke-width="1"/>`
    + markerMarks
    + `<path d="${path((point) => point.planned)}" fill="none" stroke="${SERIES[0]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${path((point) => point.actual)}" fill="none" stroke="${SERIES[1]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    + (lastForecast ? `<path d="${path((point) => point.forecast, { from: asOf })}" fill="none" stroke="${SERIES[2]}" stroke-width="2" stroke-dasharray="5 3" stroke-linejoin="round" stroke-linecap="round"/>` : '')
    + endMarks
    + xLabels
    + legend([
      { label: 'Planned', color: SERIES[0] },
      { label: 'Actual', color: SERIES[1] },
      ...(lastForecast ? [{ label: 'Forecast', color: SERIES[2], dashed: true }] : []),
    ], pad.left, height - 10);

  return frame({
    width,
    height,
    title: spec.title,
    desc: `Cumulative progress from ${formatDate(points[0].date)} to ${formatDate(points[points.length - 1].date)}.`,
    body,
  });
}

// ------------------------------------------------------------- grouped bars

function bars(spec, { horizontalLabels = true } = {}) {
  const categories = spec.categories ?? [];
  const series = spec.series ?? [];
  const width = 760;
  const rotate = horizontalLabels && categories.length > 8;
  const height = 312 + (rotate ? 40 : 0);
  const pad = { top: 56, right: 20, bottom: rotate ? 84 : 48, left: 56 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const max = Math.max(0, ...series.flatMap((entry) => entry.values.filter(Number.isFinite)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const y = (value) => pad.top + plotHeight - (Math.max(value, 0) / top) * plotHeight;

  if (!categories.length) {
    return frame({ width, height, title: spec.title, body: `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="13" fill="${INK_MUTED}">No data to plot.</text>` });
  }

  const groupWidth = plotWidth / categories.length;
  // A 2px gap between adjacent fills keeps the pair readable at print size.
  const barWidth = Math.max(2, Math.min(26, (groupWidth - 10) / series.length - 2));

  const gridLines = ticks.map((tick) => (
    `<line x1="${pad.left}" y1="${y(tick)}" x2="${pad.left + plotWidth}" y2="${y(tick)}" stroke="${GRID}" stroke-width="1"/>`
    + `<text x="${pad.left - 8}" y="${y(tick) + 4}" text-anchor="end" font-size="10" fill="${INK_MUTED}">${esc(formatValue(tick, spec.format))}</text>`
  )).join('');

  const marks = categories.map((category, index) => {
    const groupLeft = pad.left + index * groupWidth + (groupWidth - (barWidth + 2) * series.length) / 2;
    return series.map((entry, seriesIndex) => {
      const value = entry.values[index];
      if (!Number.isFinite(value) || value <= 0) return '';
      const barX = groupLeft + seriesIndex * (barWidth + 2);
      const barY = y(value);
      const barHeight = Math.max(pad.top + plotHeight - barY, 1);
      const radius = Math.min(4, barWidth / 2);
      // Rounded at the data end only; the baseline end stays square.
      return `<path d="M${barX.toFixed(1)} ${(barY + barHeight).toFixed(1)} L${barX.toFixed(1)} ${(barY + radius).toFixed(1)} Q${barX.toFixed(1)} ${barY.toFixed(1)} ${(barX + radius).toFixed(1)} ${barY.toFixed(1)} L${(barX + barWidth - radius).toFixed(1)} ${barY.toFixed(1)} Q${(barX + barWidth).toFixed(1)} ${barY.toFixed(1)} ${(barX + barWidth).toFixed(1)} ${(barY + radius).toFixed(1)} L${(barX + barWidth).toFixed(1)} ${(barY + barHeight).toFixed(1)} Z" fill="${SERIES[seriesIndex % SERIES.length]}"/>`;
    }).join('');
  }).join('');

  const labelStep = Math.max(1, Math.ceil(categories.length / (rotate ? 24 : 12)));
  const categoryLabels = categories.map((category, index) => {
    if (index % labelStep !== 0) return '';
    const cx = pad.left + index * groupWidth + groupWidth / 2;
    const cy = pad.top + plotHeight + 16;
    return rotate
      ? `<text x="${cx}" y="${cy}" font-size="9.5" fill="${INK_MUTED}" text-anchor="end" transform="rotate(-45 ${cx} ${cy})">${esc(category)}</text>`
      : `<text x="${cx}" y="${cy}" font-size="10" fill="${INK_MUTED}" text-anchor="middle">${esc(category)}</text>`;
  }).join('');

  const body = `<text x="16" y="22" font-size="13" font-weight="600" fill="${INK}">${esc(spec.title)}</text>`
    + gridLines
    + `<line x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${pad.left + plotWidth}" y2="${pad.top + plotHeight}" stroke="${AXIS}" stroke-width="1"/>`
    + marks
    + categoryLabels
    + legend(series.map((entry, index) => ({ label: entry.label, color: SERIES[index % SERIES.length] })), pad.left, height - 10);

  return frame({ width, height, title: spec.title, desc: `${series.map((entry) => entry.label).join(' and ')} across ${categories.length} categories.`, body });
}

// ------------------------------------------------------------- status bars

function statusBars(spec) {
  const rows = (spec.rows ?? []).filter((row) => Number.isFinite(row.value));
  const width = 760;
  const rowHeight = 30;
  const height = 48 + rows.length * rowHeight + 16;
  const labelWidth = 92;
  const pad = { left: 16 + labelWidth, right: 56, top: 44 };
  const plotWidth = width - pad.left - pad.right;
  const max = Math.max(1, ...rows.map((row) => row.value));

  const marks = rows.map((row, index) => {
    const y = pad.top + index * rowHeight;
    const barWidth = Math.max((row.value / max) * plotWidth, row.value > 0 ? 3 : 0);
    const color = STATUS[row.status] ?? STATUS[row.label] ?? SERIES[0];
    const radius = Math.min(4, barWidth / 2);
    return `<text x="${pad.left - 10}" y="${y + 15}" text-anchor="end" font-size="11.5" fill="${INK}">${esc(row.label)}</text>`
      + (barWidth > 0
        ? `<path d="M${pad.left} ${y + 4} L${(pad.left + barWidth - radius).toFixed(1)} ${y + 4} Q${(pad.left + barWidth).toFixed(1)} ${y + 4} ${(pad.left + barWidth).toFixed(1)} ${y + 4 + radius} L${(pad.left + barWidth).toFixed(1)} ${y + 16 - radius} Q${(pad.left + barWidth).toFixed(1)} ${y + 16} ${(pad.left + barWidth - radius).toFixed(1)} ${y + 16} L${pad.left} ${y + 16} Z" fill="${color}"/>`
        : '')
      + `<text x="${pad.left + barWidth + 8}" y="${y + 15}" font-size="11.5" font-weight="600" fill="${INK_SECONDARY}">${row.value}</text>`;
  }).join('');

  return frame({
    width,
    height,
    title: spec.title,
    desc: rows.map((row) => `${row.label}: ${row.value}`).join('; '),
    body: `<text x="16" y="22" font-size="13" font-weight="600" fill="${INK}">${esc(spec.title)}</text>${marks}`,
  });
}

/** Render a chart block to SVG. */
export function renderChart(spec) {
  switch (spec.chartType) {
    case 'scurve': return scurve(spec);
    case 'bars': return bars(spec);
    case 'histogram': return bars(spec, { horizontalLabels: true });
    case 'statusbars': return statusBars(spec);
    default: return '';
  }
}

/**
 * The same chart as rows.
 *
 * Shipped alongside every chart: it is the accessible view, it survives a
 * black-and-white print, and it is what a client pastes into their own deck.
 */
export function chartTable(spec) {
  if (spec.chartType === 'scurve') {
    const step = Math.max(1, Math.ceil((spec.series?.length ?? 0) / 24));
    return {
      columns: ['Date', 'Planned', 'Actual', 'Forecast'],
      rows: (spec.series ?? [])
        .filter((_, index) => index % step === 0)
        .map((point) => [
          formatDate(point.date),
          Number.isFinite(point.planned) ? `${(point.planned * 100).toFixed(1)}%` : '',
          Number.isFinite(point.actual) ? `${(point.actual * 100).toFixed(1)}%` : '',
          Number.isFinite(point.forecast) ? `${(point.forecast * 100).toFixed(1)}%` : '',
        ]),
    };
  }
  if (spec.chartType === 'statusbars') {
    return { columns: ['Severity', 'Count'], rows: (spec.rows ?? []).map((row) => [row.label, String(row.value)]) };
  }
  return {
    columns: ['Category', ...(spec.series ?? []).map((entry) => entry.label)],
    rows: (spec.categories ?? []).map((category, index) => [
      category,
      ...(spec.series ?? []).map((entry) => formatValue(entry.values[index], spec.format)),
    ]),
  };
}
