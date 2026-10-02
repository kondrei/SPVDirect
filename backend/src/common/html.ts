const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function renderPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · SPVDirect</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#1a1a1a;margin:0;padding:16px}
  main{max-width:560px;margin:48px auto;background:#fff;border:1px solid #e3e5e8;border-radius:10px;padding:28px}
  h1{font-size:1.4rem;margin:0 0 12px}
  p,li{line-height:1.55}
  .btn{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;margin-top:12px;border:0;cursor:pointer;font:inherit}
  .btn-danger{background:#b91c1c}
  .muted{color:#5b6270;font-size:.9rem}
</style>
</head>
<body><main>${bodyHtml}</main></body>
</html>`;
}
