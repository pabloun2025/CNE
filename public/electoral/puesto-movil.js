"use strict";
(() => {
  const el = id => document.getElementById(id);
  const mostrar = (id, visible) => { el(id).hidden = !visible; };
  const fragmento = location.hash.slice(1);
  const gestion = fragmento.startsWith("seguimiento=");
  const acceso = gestion ? fragmento.slice("seguimiento=".length) : fragmento;
  if (location.hash) history.replaceState(null, "", location.pathname);
  window.addEventListener("hashchange", () => { if (location.hash) location.reload(); });

  let abierto = false;
  let cerrado = false;
  let turno = "";
  let generacion = 0;
  let revision = 0;
  let limite = Infinity;
  let limiteReloj = Infinity;
  let temporizador;
  let relojCierre;
  let operativo = false;
  const controles = ["cedula","buscar","nombre","correo","documento","enviar"];

  function mensaje(id, texto = "", error = false) {
    const campo = el(id);
    campo.textContent = texto;
    campo.dataset.error = String(error);
    campo.hidden = !texto;
  }
  function bloquear(valor) {
    operativo = valor;
    controles.forEach(id => { el(id).disabled = valor; });
  }
  function retirarResultado() {
    generacion++;
    turno = "";
    el("envio").reset();
    mostrar("resultado", false);
    mostrar("envio", false);
    ["resultado-titulo","junta","zona","recinto"].forEach(id => { el(id).textContent = ""; });
    delete el("ubicacion").dataset.zona;
    mensaje("consulta-estado");
    mensaje("envio-estado");
    bloquear(false);
  }
  function retirarPuesto() {
    abierto = false;
    clearInterval(relojCierre);
    relojCierre = undefined;
    mostrar("cuenta-cierre", false);
    retirarResultado();
    el("consulta").reset();
    mostrar("puesto", false);
  }
  function cerrar() {
    cerrado = true;
    revision++;
    clearTimeout(temporizador);
    retirarPuesto();
    mostrar("reintentar", false);
    mensaje("mensaje", "La consulta del padrón ha cerrado.");
  }
  function permitido() {
    if (cerrado || !abierto) return false;
    if (performance.now() >= limite || Date.now() >= limiteReloj) { cerrar(); return false; }
    return true;
  }
  function mostrarCuenta() {
    if (!permitido()) return;
    const segundos = Math.ceil(Math.min(limite - performance.now(), limiteReloj - Date.now()) / 1000);
    const dias = Math.floor(segundos / 86400);
    const hora = [Math.floor(segundos % 86400 / 3600), Math.floor(segundos % 3600 / 60), segundos % 60]
      .map(n => String(n).padStart(2, "0")).join(":");
    el("cuenta-cierre").textContent = "Tiempo restante · " + (dias ? dias + " d " : "") + hora;
    mostrar("cuenta-cierre", true);
  }
  async function api(ruta, datos) {
    const opciones = { cache:"no-store", credentials:"omit", referrerPolicy:"no-referrer" };
    if (datos !== undefined) {
      opciones.method = "POST";
      opciones.headers = { "Content-Type":"application/json", Authorization:"Bearer " + acceso };
      opciones.body = JSON.stringify(datos);
    }
    let respuesta;
    try { respuesta = await fetch("/api/puesto-movil/" + ruta, opciones); }
    catch { throw Error("No se pudo conectar con el servicio."); }
    const body = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const error = Error(typeof body.error === "string" ? body.error : "No se pudo completar la solicitud.");
      error.status = respuesta.status;
      throw error;
    }
    return body;
  }
  function falloOperacion(error, id) {
    if (error.status === 410) { cerrar(); return; }
    if (error.status === 401 || error.status === 403) {
      retirarPuesto();
      mensaje("mensaje", error.message, true);
      return;
    }
    mensaje(id, error.message, true);
  }
  async function estado() {
    if (gestion || cerrado || !acceso) return;
    const actual = ++revision;
    const inicio = performance.now(), reloj = Date.now();
    try {
      const e = await api("estado");
      if (actual !== revision || cerrado) return;
      if (!Number.isFinite(e.cierreMs) || !Number.isFinite(e.servidorMs)) throw Error("No se pudo comprobar el horario del puesto.");
      const restante = e.cierreMs - e.servidorMs;
      if (restante <= 0) { cerrar(); return; }
      if (!e.disponible || !e.abierto) throw Error("El puesto móvil no está disponible en este momento.");
      // Anclar al inicio de la petición evita alargar el plazo por latencia o suspensión.
      limite = Math.min(limite, inicio + restante);
      limiteReloj = Math.min(limiteReloj, reloj + restante);
      const espera = Math.min(limite - performance.now(), limiteReloj - Date.now());
      if (espera <= 0) { cerrar(); return; }
      clearTimeout(temporizador);
      temporizador = setTimeout(espera > 2147483647 ? estado : cerrar, Math.min(espera, 2147483647));
      abierto = true;
      mostrarCuenta();
      relojCierre ??= setInterval(mostrarCuenta, 1000);
      mostrar("puesto", true);
      mostrar("reintentar", false);
      mensaje("mensaje");
    } catch (error) {
      if (actual !== revision || cerrado) return;
      retirarPuesto();
      mostrar("reintentar", true);
      mensaje("mensaje", error.message, true);
    }
  }

  el("reintentar").addEventListener("click", estado);
  el("cedula").addEventListener("input", () => { retirarResultado(); mensaje("mensaje"); });
  el("consulta").addEventListener("submit", async event => {
    event.preventDefault();
    if (operativo || !permitido()) return;
    retirarResultado();
    const actual = generacion;
    bloquear(true);
    mensaje("mensaje");
    mensaje("consulta-estado", "Consultando…");
    try {
      const data = await api("consulta", { cedula:el("cedula").value });
      if (actual !== generacion || !permitido()) return;
      if (typeof data.turno !== "string" || !data.turno) throw Error("No se pudo iniciar la atención. Repita la consulta.");
      const r = data.resultado;
      turno = data.turno;
      el("resultado-titulo").textContent = r ? "Asignación electoral" : "No consta en este padrón";
      mostrar("ubicacion", Boolean(r));
      if (r) {
        const madrid = r.recinto === "Caja Mágica";
        const zona = madrid ? r.zona : null;
        el("junta").textContent = r.junta ? String(r.junta).replace(/^([MF])(\d+)$/, "$2$1") : "Por verificar";
        el("recinto").textContent = r.recinto || "";
        el("recinto-etiqueta").textContent = r.verificarWeb && !madrid ? "Ciudad" : "Recinto";
        el("zona").textContent = zona || "";
        mostrar("zona-fila", Boolean(zona));
        el("ubicacion").dataset.zona = zona ? String(zona).toLowerCase() : "";
        mostrar("verificar", Boolean(r.verificarWeb || !r.junta || (madrid && !zona)));
      } else mostrar("verificar", true);
      mostrar("resultado", true);
      mostrar("envio", true);
      mensaje("consulta-estado");
      el("resultado-titulo").focus();
    } catch (error) { if (actual === generacion) falloOperacion(error, "consulta-estado"); }
    finally { if (actual === generacion) bloquear(false); }
  });

  el("envio").addEventListener("submit", async event => {
    event.preventDefault();
    if (!turno || operativo || !permitido()) return;
    const actual = generacion;
    const datos = { turno, nombre:el("nombre").value.trim(), correo:el("correo").value.trim(), documento:el("documento").value.trim().toUpperCase() };
    bloquear(true);
    mensaje("envio-estado", "Enviando el correo…");
    try {
      const res = await api("envio", datos);
      if (actual !== generacion || !permitido()) return;
      if (res.aceptado !== true) throw Error("No se pudo confirmar el envío. Compruebe la bandeja de entrada.");
      retirarResultado();
      el("consulta").reset();
      mensaje("mensaje", "El servicio de correo ha aceptado el envío del justificante y de la información electoral.");
      el("cedula").focus();
    } catch (error) {
      if (actual !== generacion) return;
      if (!error.status) mensaje("envio-estado", "No se pudo confirmar el envío. Compruebe la bandeja de entrada antes de volver a intentarlo.", true);
      else falloOperacion(error, "envio-estado");
    } finally { if (actual === generacion) bloquear(false); }
  });

  async function actualizar() {
    if (el("actualizar").disabled) return;
    el("actualizar").disabled = true;
    mensaje("mensaje", "Consultando las cifras…");
    try {
      const datos = await api("seguimiento", {});
      const campos = ["consultas","con","sin","correosAceptados","correosInciertos"];
      if (campos.some(k => !Number.isSafeInteger(datos[k]) || datos[k] < 0)) throw Error("No se pudieron comprobar las cifras.");
      campos.forEach(k => { el(k).textContent = datos[k].toLocaleString("es-ES"); });
      mostrar("cifras", true);
      mensaje("mensaje");
    } catch (error) { mostrar("cifras", false); mensaje("mensaje", error.message, true); }
    finally { el("actualizar").disabled = false; }
  }
  el("actualizar").addEventListener("click", actualizar);
  if (!/^[A-Za-z0-9_-]{43}$/.test(acceso)) {
    mensaje("mensaje", "Abra el enlace facilitado por la coordinación electoral para acceder al puesto.");
  } else if (gestion) {
    el("titulo").textContent = "Seguimiento del puesto móvil";
    mostrar("seguimiento", true);
    void actualizar();
  } else {
    void estado();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { revision++; mostrar("puesto", false); }
      else void estado();
    });
    window.addEventListener("pagehide", retirarPuesto);
    window.addEventListener("pageshow", event => { if (event.persisted) void estado(); });
    window.addEventListener("online", estado);
    window.addEventListener("offline", () => {
      if (cerrado) return;
      revision++;
      retirarPuesto();
      mostrar("reintentar", true);
      mensaje("mensaje", "Sin conexión. Vuelva a conectar el teléfono para consultar.", true);
    });
  }
})();
