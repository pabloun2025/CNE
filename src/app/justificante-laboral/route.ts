const pagina = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Justificante laboral · Consulado del Ecuador en Madrid</title>
<link rel="stylesheet" href="/electoral/justificante.css"><script src="/electoral/justificante.js?v=correo" defer></script></head>
<body><header><div><img src="/electoral/escudo.png" width="46" height="54" alt=""><p><strong>Consulado General del Ecuador</strong><br>Madrid · España</p></div></header>
<main><p class="fecha">Caja Mágica · 29 de noviembre de 2026</p>
<h1>Justificante laboral</h1><p class="intro">Descargue el justificante de su asistencia al recinto electoral para presentarlo ante su empresa.</p>
<noscript>Active JavaScript para abrir su justificante.</noscript>
<section id="entrada"><h2>Abrir el formulario</h2><p>Cada ticket permite tres aperturas. Al confirmar tendrá una hora para descargar el documento.</p>
<button type="button" id="abrir" disabled>Abrir mi justificante</button></section>
<form id="formulario" hidden><h2>Datos del justificante</h2><dl><dt>Nombres y apellidos</dt><dd id="nombre"></dd><dt>Cédula ecuatoriana</dt><dd id="cedula"></dd></dl>
<label for="documento">DNI o NIE español <span>(opcional)</span></label>
<input type="text" id="documento" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="ayuda">
<p id="ayuda">Si desea incluirlo, escriba el número y la letra de control.</p>
<button>Preparar PDF</button><p id="restantes"></p></form>
<section id="entrega" hidden><h2 tabindex="-1">Su PDF está listo</h2><a class="boton" id="descargar" download="justificante-laboral.pdf">Descargar PDF</a></section>
<form id="envio-correo" hidden aria-labelledby="correo-titulo">
<h2 id="correo-titulo">Recibir el PDF por correo</h2>
<label for="correo">Correo electrónico</label>
<input type="email" id="correo" maxlength="254" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required>
<button id="enviar-correo">Enviar por correo</button>
<p id="correo-estado" role="status" aria-live="polite" hidden></p></form>
<p id="mensaje" role="status" aria-live="polite" tabindex="-1" hidden></p>
<footer><a href="/guia-electoral.pdf">Consultar la guía electoral en PDF</a></footer></main></body></html>`;

export function GET() {
  return new Response(pagina, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
