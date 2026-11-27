import { privado } from "@/server/justificante/http";

const pagina = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tablero de terminales · CNE Madrid</title>
<link rel="stylesheet" href="/electoral/justificante.css"><link rel="stylesheet" href="/electoral/recuento-offline.css">
<script defer src="/electoral/recuento-offline.js?v=terminales"></script></head>
<body><header><div><img src="/electoral/escudo.png" width="46" height="54" alt=""><p><strong>Consulado General del Ecuador</strong><br>Madrid · España</p></div></header>
<main><p class="fecha">Caja Mágica · 29 de noviembre de 2026</p><h1>Tablero de terminales</h1>
<form id="recuento">
<label for="clave">Clave del enlace de seguimiento</label>
<input id="clave" type="password" maxlength="43" required autocomplete="off" spellcheck="false">
<label for="previstos">Puestos sin conexión previstos (por ejemplo, 1, 2, 3)</label>
<input id="previstos" maxlength="300" inputmode="text" placeholder="1, 2, 3">
<label for="codigo">Código de cierre del puesto</label>
<input id="codigo" maxlength="160" spellcheck="false" autocomplete="off" placeholder="Puede pegar el enlace del QR">
<label for="archivo">O seleccione el archivo de cierre</label>
<input id="archivo" type="file" accept=".txt,text/plain">
<button>Actualizar recuento</button>
</form>
<p id="estado" role="status" aria-live="polite"></p>
<div id="resultado" class="tablero" hidden>
<section><h2>En línea</h2><p class="cifra" id="en-linea-usados"></p><p id="sin-terminal"></p><ul id="en-linea"></ul>
<form id="asignar"><label for="numero-en-linea">Número de terminal</label><input id="numero-en-linea" type="number" min="1" max="99" required><button>Generar enlace</button>
<label id="etiqueta-enlace" for="enlace" hidden>Enlace privado del terminal</label><input id="enlace" type="text" readonly hidden></form>
</section>
<section><h2>Sin conexión</h2><p class="cifra" id="offline-usados"></p><p id="totales"></p><p id="faltantes"></p><ul id="puestos"></ul></section>
</div>
</main></body></html>`;

export function GET() {
  return new Response(pagina, { headers: { ...privado, "content-type": "text/html; charset=utf-8" } });
}
