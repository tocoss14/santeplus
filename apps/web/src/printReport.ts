import { printDocument, escapeHtml } from './print';

export interface ReportColumn {
  label: string;
  key: string;
  format?: (val: any, row: any) => string;
  align?: 'left' | 'right' | 'center';
}

interface PrintReportOpts {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: any[];
  summary?: { label: string; value: string; accent?: boolean }[];
  filters?: string;
}

function today(): string {
  return new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function now(): string {
  return new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function printReport(opts: PrintReportOpts): void {
  const { title, subtitle, columns, rows, summary, filters } = opts;

  const thead = columns.map(c =>
    `<th style="text-align:${c.align ?? 'left'}">${escapeHtml(c.label)}</th>`
  ).join('');

  const tbody = rows.map(row =>
    '<tr>' + columns.map(c => {
      const raw = row[c.key];
      const text = c.format ? c.format(raw, row) : (raw ?? '—');
      return `<td style="text-align:${c.align ?? 'left'}">${escapeHtml(String(text))}</td>`;
    }).join('') + '</tr>'
  ).join('');

  const summaryHtml = summary?.length
    ? `<div class="totals">${summary.map(s =>
        `<div class="row${s.accent ? ' big' : ''}"><span>${escapeHtml(s.label)}</span><span>${escapeHtml(s.value)}</span></div>`
      ).join('')}</div>`
    : '';

  const body = `
    <div class="band">
      <div>
        <div class="brand">SantéPlus</div>
        <div class="tag">Système de gestion de mutuelle santé</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;font-weight:600">État : ${escapeHtml(title)}</div>
        <div class="tag">${escapeHtml(now())}</div>
      </div>
    </div>

    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="meta">${escapeHtml(subtitle)}</p>` : ''}
    ${filters ? `<p class="meta"><b>Filtres :</b> ${escapeHtml(filters)}</p>` : ''}

    <table>
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>

    ${summaryHtml}

    <div class="legal">
      Imprimé le ${escapeHtml(now())} — SantéPlus &copy; ${new Date().getFullYear()}.
      Document à usage interne uniquement.
      ${rows.length} enregistrement(s).
    </div>
  `;

  printDocument(`État — ${title}`, body);
}

/**
 * Escape a value for CSV (RFC 4180).
 * Wraps in quotes if the value contains commas, quotes, or newlines.
 */
function csvCell(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

/**
 * Generate and download a CSV file from report columns and rows.
 * Reuses the same ReportColumn[] interface as printReport.
 */
export function exportCsv(filename: string, columns: ReportColumn[], rows: any[]): void {
  const header = columns.map(c => csvCell(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const raw = row[c.key];
      const text = c.format ? c.format(raw, row) : (raw ?? '');
      return csvCell(String(text).replace(/\u2009/g, ' ')); // thin-space cleanup
    }).join(',')
  ).join('\n');

  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const csv = BOM + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}
