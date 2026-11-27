"use strict";
(() => {
  const elemento = id => document.getElementById(id);
  const codigo = elemento("codigo");
  const clave = elemento("clave");
  const previstos = elemento("previstos");
  const estado = elemento("estado");

  function codigoDe(texto) {
    const limpio = texto.trim();
    if (!limpio.startsWith("https://")) return limpio;
    const enlace = new URL(limpio);
    if (!["https://madrid.consulado.app", location.origin].includes(enlace.origin) ||
        !/^\/recuento-offline\/?$/.test(enlace.pathname)) throw Error("El enlace no corresponde al recuento de Madrid.");
    return enlace.hash.slice(1);
  }

  function leerFragmento() {
    if (!location.hash) return;
    codigo.value = location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
  }
  leerFragmento();
  window.addEventListener("hashchange", leerFragmento);
  try {
    clave.value = sessionStorage.getItem("cne-recuento-clave") ?? "";
    previstos.value = localStorage.getItem("cne-recuento-previstos") ?? "";
  } catch { /* Se pueden completar los campos en esta visita. */ }

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
      const acceso = clave.value.trim();
      if (!/^[\w-]{43}$/.test(acceso)) throw Error("Use la clave completa del enlace de seguimiento.");
      const esperados = [...new Set(previstos.value.trim().split(/[,\s]+/).filter(Boolean))];
      if (esperados.some(n => !/^[1-9]\d?$/.test(n))) throw Error("Escriba números de puesto del 1 al 99, separados por comas.");
      const corte = codigoDe(codigo.value);
      const response = await fetch("/api/puesto-movil/recuento-offline", {
        method: "POST", credentials: "omit", cache: "no-store",
        headers: { "content-type": "application/json", authorization: "Bearer " + acceso },
        body: JSON.stringify(corte ? { codigo: corte } : {}),
      });
      const datos = await response.json();
      if (!response.ok) throw Error(datos.error || "No se pudo actualizar el recuento.");
      try {
        sessionStorage.setItem("cne-recuento-clave", acceso);
        localStorage.setItem("cne-recuento-previstos", esperados.join(", "));
      } catch { /* Los totales ya están confirmados por el servidor. */ }
      codigo.value = "";
      const total = (columna) => datos.terminales.reduce((suma, fila) => suma + fila[columna], 0);
      const con = total("con_padron");
      const sin = total("sin_padron");
      const otra = total("otra");
      elemento("totales").textContent = (con + sin + otra) + " atenciones · En el padrón: " + con +
        " · No consta en el padrón: " + sin + " · Otra información: " + otra;
      const recibidos = new Set(datos.terminales.map(fila => String(fila.terminal)));
      const faltan = esperados.filter(id => !recibidos.has(id));
      elemento("faltantes").textContent = !esperados.length ? recibidos.size + " puestos con corte. Indique los puestos previstos para comprobar faltantes." :
        faltan.length ? "Falta el corte de los puestos " + faltan.join(", ") + "." : "Todos los puestos previstos han enviado un corte.";
      elemento("puestos").replaceChildren(...datos.terminales.map(fila => {
        const item = document.createElement("li");
        item.textContent = "Puesto " + fila.terminal + " · En el padrón: " + fila.con_padron +
          " · No consta: " + fila.sin_padron + " · Otra información: " + fila.otra + " · Corte " + fila.revision;
        return item;
      }));
      elemento("resultado").hidden = false;
      estado.textContent = {
        registrado: "Corte registrado.", anterior: "Ya existe un corte posterior de ese puesto.", "ya registrado": "Este corte ya estaba registrado.",
      }[datos.estado] || "Recuento actualizado.";
    } catch (error) { estado.textContent = error.message; }
    finally { boton.disabled = false; }
  });
})();
