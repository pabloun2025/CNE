"use strict";
(() => {
  const elemento = id => document.getElementById(id);
  const codigo = elemento("codigo");
  const clave = elemento("clave");
  const estado = elemento("estado");

  function codigoDe(texto) {
    const limpio = texto.trim();
    if (!limpio.startsWith("https://")) return limpio;
    const enlace = new URL(limpio);
    if (!["https://madrid.consulado.app", location.origin].includes(enlace.origin) ||
        !/^\/recuento-offline\/?$/.test(enlace.pathname)) throw Error("El enlace no corresponde al recuento de Madrid.");
    return enlace.hash.slice(1);
  }

  let claveEnlace;
  function leerFragmento() {
    if (!location.hash) return;
    const segmento = location.hash.slice(1);
    const credencial = /^seguimiento=([A-Za-z0-9_-]{43})$/.exec(segmento);
    if (credencial) claveEnlace = credencial[1];
    else codigo.value = segmento;
    history.replaceState(null, "", location.pathname);
  }
  leerFragmento();
  window.addEventListener("hashchange", leerFragmento);
  try {
    clave.value = sessionStorage.getItem("cne-recuento-clave") ?? "";
  } catch { /* Se pueden completar los campos en esta visita. */ }

  async function consultar(datos) {
    const acceso = clave.value.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(acceso)) throw Error("Use la clave completa del enlace de seguimiento.");
    const respuesta = await fetch("/api/puesto-movil/recuento-offline", {
      method: "POST", credentials: "omit", cache: "no-store",
      headers: { "content-type": "application/json", authorization: "Bearer " + acceso },
      body: JSON.stringify(datos),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw Error(resultado.error || "No se pudo actualizar el recuento.");
    try { sessionStorage.setItem("cne-recuento-clave", acceso); } catch { /* Solo para esta visita. */ }
    return resultado;
  }

  function lista(id, filas, textoFila) {
    elemento(id).replaceChildren(...filas.map(fila => {
      const item = document.createElement("li");
      item.textContent = textoFila(fila);
      return item;
    }));
  }

  const numerar = n => String(n).padStart(2, "0");
  function mostrarEnLinea(datos) {
    const usados = datos.enLinea.filter(fila => fila.con + fila.sin > 0).length;
    elemento("en-linea-usados").textContent = usados + " terminales con consultas";
    elemento("sin-terminal").textContent = datos.sinTerminal
      ? datos.sinTerminal + " consultas sin número de terminal. No se pueden atribuir a un equipo." : "";
    lista("en-linea", datos.enLinea.filter(fila => fila.con + fila.sin > 0), fila =>
      "En línea " + numerar(fila.terminal) + " · En el padrón: " + fila.con + " · No consta: " + fila.sin);
  }

  elemento("archivo").addEventListener("change", async evento => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    try {
      if (archivo.size > 200) throw Error("El archivo de cierre debe contener un solo código.");
      codigo.value = codigoDe(await archivo.text());
      estado.textContent = "Código cargado. Pulse Actualizar recuento.";
    } catch (error) { estado.textContent = error.message; }
    finally { evento.target.value = ""; }
  });

  elemento("recuento").addEventListener("submit", async evento => {
    evento.preventDefault();
    const boton = evento.target.querySelector("button");
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      const corte = codigoDe(codigo.value);
      const datos = await consultar(corte ? { codigo: corte } : {});
      mostrarEnLinea(datos);
      const usados = datos.terminales.filter(fila => fila.revision > 0).length;
      elemento("offline-usados").textContent = usados + " en uso · " + datos.terminales.length + " con corte";
      codigo.value = "";
      const total = (columna) => datos.terminales.reduce((suma, fila) => suma + fila[columna], 0);
      const con = total("con_padron");
      const sin = total("sin_padron");
      const otra = total("otra");
      elemento("totales").textContent = (con + sin + otra) + " atenciones · En el padrón: " + con +
        " · No consta en el padrón: " + sin + " · Otra información: " + otra;
      lista("puestos", datos.terminales, fila =>
        "Sin conexión " + numerar(fila.terminal).replace(/(\d)(?=(\d{3})+$)/g, "$1-") + " · En el padrón: " + fila.con_padron +
        " · No consta: " + fila.sin_padron + " · Otra información: " + fila.otra + " · Corte " + fila.revision);
      elemento("resultado").hidden = false;
      estado.textContent = {
        registrado: "Corte registrado.", anterior: "Ya existe un corte posterior de ese puesto.", "ya registrado": "Este corte ya estaba registrado.",
      }[datos.estado] || "Recuento actualizado.";
    } catch (error) { estado.textContent = error.message; }
    finally { boton.disabled = false; }
  });
  if (claveEnlace) {
    clave.value = claveEnlace;
    elemento("recuento").requestSubmit();
  }
})();
