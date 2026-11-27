const indicadores = (grupo: string) => `<dl data-resumen="${grupo}">
  <div><dt>Equipos detectados</dt><dd data-cifra="equipos">—</dd></div>
  <div><dt>Búsquedas</dt><dd data-cifra="total">—</dd></div>
  <div><dt>Constan en el padrón</dt><dd data-cifra="con">—</dd></div>
  <div><dt>No constan</dt><dd data-cifra="sin">—</dd></div>
</dl>`;
const desglose = (grupo: string, titulo: string, nota: string) => `<section aria-labelledby="${grupo}-titulo">
  <h2 id="${grupo}-titulo">${titulo}</h2><p>${nota}</p>
  ${indicadores(grupo)}
  <div class="tabla"><table aria-label="Desglose por equipo · ${titulo}">
    <thead><tr><th scope="col">Equipo</th><th scope="col">Búsquedas</th><th scope="col">Constan</th><th scope="col">No constan</th></tr></thead>
    <tbody data-detalle="${grupo}"></tbody>
  </table></div>
</section>`;
const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Recuento del puesto electoral · Madrid</title>
<link rel="stylesheet" href="/electoral/recuento-electoral.css">
<script defer src="/electoral/recuento-electoral.js"></script></head>
<body><header><div class="ancho"><img src="/electoral/escudo.png" alt="" width="75" height="40">
<p>Consulado General del Ecuador en Madrid</p></div></header>
<main class="ancho"><h1>Recuento del puesto electoral</h1>
<p id="estado" role="status">Cargando cifras…</p>
<section aria-labelledby="general-titulo"><h2 id="general-titulo">Total general</h2>${indicadores("total")}</section>
${desglose("enLinea", "Puestos en línea", "Consulta de cifras actualizada automáticamente.")}
${desglose("windows", "Puestos Windows sin internet", "Último corte recibido de cada equipo. Las cifras pueden ser parciales hasta que se abra un ticket más reciente.")}
</main></body></html>`;

export function GET() {
  return new Response(pagina, { headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  } });
}
