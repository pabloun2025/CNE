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
    previstos.value = localStorage.getItem("cne-recuento-previstos") ?? "";
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
    elemento("en-linea-usados").textContent = usados + " en uso · " + datos.enLinea.length + " asignados";
    elemento("sin-terminal").textContent = datos.sinTerminal
      ? datos.sinTerminal + " consultas sin número de terminal. No se pueden atribuir a un equipo." : "";
    lista("en-linea", datos.enLinea, fila =>
      "En línea " + numerar(fila.terminal) + (fila.con + fila.sin
        ? " · En el padrón: " + fila.con + " · No consta: " + fila.sin : " · Sin consultas"));
  }

  elemento("asignar").addEventListener("submit", async evento => {
    evento.preventDefault();
    const boton = evento.target.querySelector("button");
    const campo = elemento("enlace");
    boton.disabled = true;
    campo.hidden = elemento("etiqueta-enlace").hidden = true;
    try {
      const datos = await consultar({ altaEnLinea: Number(elemento("numero-en-linea").value) });
      mostrarEnLinea(datos);
      campo.value = datos.enlace;
      campo.hidden = elemento("etiqueta-enlace").hidden = false;
      campo.focus();
      campo.select();
      estado.textContent = "Enlace listo. Ábralo en el equipo al que se asignó ese número.";
    } catch (error) { estado.textContent = error.message; }
    finally { boton.disabled = false; }
  });

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
      const esperados = [...new Set(previstos.value.trim().split(/[,\s]+/).filter(Boolean))];
      if (esperados.some(n => !/^[1-9]\d?$/.test(n))) throw Error("Escriba números de puesto del 1 al 99, separados por comas.");
      const corte = codigoDe(codigo.value);
      const datos = await consultar(corte ? { codigo: corte } : {});
      try { localStorage.setItem("cne-recuento-previstos", esperados.join(", ")); }
      catch { /* Los totales ya están confirmados por el servidor. */ }
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
      const recibidos = new Set(datos.terminales.map(fila => String(fila.terminal)));
      const faltan = esperados.filter(id => !recibidos.has(id));
      elemento("faltantes").textContent = !esperados.length ? recibidos.size + " puestos con corte. Indique los puestos previstos para comprobar faltantes." :
        faltan.length ? "Falta el corte de los puestos " + faltan.join(", ") + "." : "Todos los puestos previstos han enviado un corte.";
      lista("puestos", datos.terminales, fila =>
        "Sin conexión " + numerar(fila.terminal) + " · En el padrón: " + fila.con_padron +
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
