export function printDocument(title: string, bodyHtml: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 13px; padding: 24px; max-width: 700px; margin: 0 auto; }
  .band { background: #0f766e; color: #fff; padding: 14px 18px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
  .band .brand { font-size: 18px; font-weight: 700; }
  .band .tag { font-size: 10px; color: #ccfbf1; }
  h1 { font-size: 16px; margin: 18px 0 4px; color: #0f766e; }
  .meta { color: #64748b; font-size: 11px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 6px 4px; }
  td { padding: 7px 4px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 10px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 4px; font-size: 13px; }
  .totals .row.big { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px; padding: 10px; font-weight: 700; font-size: 14px; color: #0f766e; margin-top: 6px; }
  .totals .row.amber { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px; font-weight: 700; font-size: 14px; color: #92400e; margin-top: 6px; }
  .info { margin: 8px 0; }
  .info b { display: inline-block; min-width: 130px; font-size: 11px; color: #64748b; text-transform: uppercase; }
  .legal { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; line-height: 1.5; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>${bodyHtml}</body>
</html>`);
  doc.close();

  const win = iframe.contentWindow!;
  const doPrint = () => {
    win.focus();
    win.print();
    setTimeout(() => { document.body.removeChild(iframe); }, 2000);
  };
  if (doc.readyState === 'complete') setTimeout(doPrint, 100);
  else iframe.onload = () => setTimeout(doPrint, 100);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
