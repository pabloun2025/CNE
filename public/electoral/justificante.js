"use strict";
(() => {
  const el = id => document.getElementById(id);
  window.addEventListener("hashchange", () => { if (location.hash) location.reload(); });
  const token = location.hash.slice(1);
  // El QR personal se conserva solo en memoria durante esta visita.
  if (location.hash) history.replaceState(null, "", location.pathname);
  let sesion;
  let solicitud;
  let archivo;
  let version = 0;
  function mensaje(texto) {
    el("mensaje").textContent = texto;
    el("mensaje").hidden = !texto;
  }
  async function post(ruta, datos) {
    let response;
    try {
      response = await fetch("/api/voto/" + ruta, { method: "POST", credentials: "omit", cache: "no-store", keepalive: ruta === "corte",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
    } catch { throw Error("Compruebe su conexión a internet y vuelva a intentarlo."); }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Error(body.error || "No se pudo completar la solicitud. Inténtelo de nuevo.");
    }
    return response;
  }
  if (!/^(?:[A-Za-z0-9_-]{165,825}|\.[0-9A-Z.$*+\-]{184,927})$/.test(token)) {
    el("entrada").hidden = true;
    mensaje("Escanee el código QR de justificante laboral de su ticket para continuar.");
    return;
  }
  void post("corte", { token }).catch(() => {});
  el("abrir").disabled = false;
  el("abrir").addEventListener("click", async () => {
    el("abrir").disabled = true;
    mensaje("Abriendo el formulario…");
    try {
      solicitud ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, "0")).join("");
      const datos = await (await post("abrir", { token, solicitud })).json();
      sesion = datos.sesion;
      el("nombre").textContent = datos.nombre;
      el("cedula").textContent = datos.cedula;
      el("entrada").hidden = true;
      el("formulario").hidden = false;
      el("envio-correo").hidden = false;
      el("documento").focus();
      mensaje("");
    } catch (error) { mensaje(error.message); el("abrir").disabled = false; }
  });
  function limpiarPdf() {
    version++;
    if (archivo) URL.revokeObjectURL(archivo);
    archivo = undefined;
    el("descargar").removeAttribute("href");
    el("entrega").hidden = true;
  }
  el("documento").addEventListener("input", () => { limpiarPdf(); mensaje(""); });
  el("formulario").addEventListener("submit", async evento => {
    evento.preventDefault();
    const boton = el("formulario").querySelector("button");
    if (boton.disabled) return;
    limpiarPdf();
    const turno = version;
    boton.disabled = true;
    mensaje("Preparando el PDF…");
    try {
      const blob = await (await post("pdf", { sesion, documento: el("documento").value })).blob();
      if (version !== turno) return;
      archivo = URL.createObjectURL(blob);
      el("descargar").href = archivo;
      el("entrega").hidden = false;
      el("entrega").querySelector("h2").focus();
      mensaje("");
    } catch (error) { mensaje(error.message); } finally { boton.disabled = false; }
  });
  el("envio-correo").addEventListener("submit", async evento => {
    evento.preventDefault();
    const boton = el("enviar-correo");
    if (boton.disabled) return;
    const correo = el("correo");
    const destino = correo.value.trim();
    const estado = el("correo-estado");
    boton.disabled = correo.disabled = true;
    estado.hidden = false;
    estado.textContent = "Enviando el justificante…";
    try {
      await post("correo", { sesion, correo: destino, documento: el("documento").value });
      estado.textContent = "Envío solicitado. Revise su bandeja de entrada y la carpeta de correo no deseado.";
    } catch (error) {
      estado.textContent = error.message;
      boton.disabled = correo.disabled = false;
    }
  });
})();
