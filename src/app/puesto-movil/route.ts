import { credencialesMovil } from "@/server/puesto-movil/credenciales";

const pagina = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Puesto móvil de información electoral · Madrid</title>
<link rel="stylesheet" href="/electoral/puesto-movil.css"><script defer src="/electoral/puesto-movil.js?v=zona-unica"></script></head>
<body>
<header><div class="cabecera"><img src="/electoral/escudo.png" alt="República del Ecuador" width="82" height="43"><div><strong>Consulado General del Ecuador</strong><span>Madrid · España</span></div></div></header>
<main data-acceso-puesto="">
<p class="jornada">29 de noviembre de 2026 · Madrid</p><h1 id="titulo">Puesto móvil de información electoral</h1>
<noscript><p>Active JavaScript para utilizar el puesto móvil.</p></noscript>
<p id="mensaje" role="status" aria-live="polite" hidden></p><button id="reintentar" type="button" class="secundario" hidden>Volver a conectar</button>
<div id="puesto" hidden>
  <form id="consulta" class="panel" autocomplete="off">
    <label for="cedula">Cédula ecuatoriana</label><div class="buscar"><input id="cedula" type="text" inputmode="numeric" pattern="[0-9]{10}" placeholder="10 dígitos" spellcheck="false" required aria-describedby="consulta-estado"><button id="buscar" type="submit">Consultar</button></div>
    <p id="consulta-estado" class="feedback" role="status" hidden></p>
  </form>
  <section id="resultado" class="panel" hidden><h2 id="resultado-titulo" tabindex="-1">Asignación electoral</h2>
    <div id="ubicacion"><div class="asignacion"><div><span>Junta receptora del voto</span><strong id="junta"></strong></div><div id="zona-fila" hidden><span id="zona-etiqueta">Zona</span><strong id="zona"></strong></div></div><p><span id="recinto-etiqueta">Recinto</span> <b id="recinto"></b></p></div>
    <p id="verificar" class="verificar" hidden>Verifique la asignación en la consulta oficial del CNE. <a href="https://lugarvotacion.cne.gob.ec/" target="_blank" rel="noopener noreferrer">Consultar el CNE</a></p>
  </section>
  <form id="envio" class="panel" autocomplete="off" hidden>
    <h2>Enviar por correo</h2><p class="ayuda">El correo incluye el justificante laboral en PDF y la información electoral.</p>
    <div id="datos-nombre" hidden><label for="nombre">Nombres y apellidos</label><input id="nombre" type="text" minlength="2" maxlength="120" autocomplete="off" aria-describedby="nombre-ayuda">
    <p id="nombre-ayuda" class="detalle">Escríbalos tal como figuran en el documento de la persona atendida. El Consulado conservará el nombre, la cédula y el correo para orientar sobre el empadronamiento.</p></div>
    <label for="correo">Correo electrónico</label><input id="correo" type="email" maxlength="254" autocomplete="off" inputmode="email" autocapitalize="none" spellcheck="false" required>
    <div id="dominios-correo" role="group" aria-label="Dominios de correo sugeridos" hidden></div>
    <label for="documento">DNI o NIE español <small>(opcional)</small></label><input id="documento" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="documento-ayuda"><p id="documento-ayuda" class="detalle">Incluya la letra de control.</p>
    <button id="enviar" type="submit">Enviar justificante e información</button><p id="envio-estado" class="feedback" role="status" hidden></p>
  </form>
</div>
<section id="seguimiento" class="panel" hidden><h2>Actividad del puesto móvil</h2><dl id="cifras" hidden>
  <div><dt>Consultas realizadas</dt><dd id="consultas"></dd></div>
  <div><dt>Con registro en el padrón</dt><dd id="con"></dd></div>
  <div><dt>Sin registro en el padrón</dt><dd id="sin"></dd></div>
  <div><dt>Correos aceptados</dt><dd id="correosAceptados"></dd></div>
  <div><dt>Correos sin confirmación</dt><dd id="correosInciertos"></dd></div>
</dl><div class="acciones-seguimiento"><button id="actualizar" class="secundario" type="button">Actualizar cifras</button><button id="descargar-contactos" type="button">Descargar contactos para empadronamiento</button></div></section>
<footer>La consulta cierra el 29 de noviembre a las 19:00, hora de Madrid.<p id="cuenta-cierre" hidden></p></footer>
</main></body></html>`;

export function GET(request: Request) {
  const host = request.headers.get("host")?.toLowerCase();
  const acceso = host === "cne.consulado.app" ? credencialesMovil().acceso : undefined;
  const html = acceso && /^[A-Za-z0-9_-]{43}$/.test(acceso)
    ? pagina.replace('data-acceso-puesto=""', `data-acceso-puesto="${acceso.slice(0, 18)}"`)
    : pagina;
  return new Response(html, {headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, private",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow, noarchive",
  }});
}
