const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Descargar el puesto electoral</title>
<link rel="stylesheet" href="/electoral/justificante.css"><script defer src="/electoral/entrega-puesto.js"></script></head>
<body><header><div><img src="/electoral/escudo.png" width="46" height="54" alt=""><p><strong>Consulado General del Ecuador</strong><br>Madrid · España</p></div></header>
<main><h1>Puesto electoral para Windows</h1><p class="intro">Descarga privada del archivo ZIP.</p>
<button type="button" id="descargar" disabled>Descargar ZIP</button><p id="estado" role="status"></p></main></body></html>`;

export function GET() {
  return new Response(pagina, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
