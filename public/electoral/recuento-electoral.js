"use strict";
(() => {
  const estado = document.getElementById("estado");
  const cifra = new Intl.NumberFormat("es-ES");
  const resumir = (grupo, datos) => {
    for (const campo of document.querySelectorAll(`[data-resumen="${grupo}"] [data-cifra]`)) {
      campo.textContent = cifra.format(datos[campo.dataset.cifra]);
    }
  };
  function tabla(grupo, filas) {
    const cuerpo = document.querySelector(`[data-detalle="${grupo}"]`);
    cuerpo.replaceChildren();
    if (!filas.length) {
      const celda = cuerpo.insertRow().insertCell();
      celda.colSpan = 4;
      celda.textContent = "Aún no hay equipos detectados.";
    }
    for (const fila of filas) {
      const renglon = cuerpo.insertRow();
      const equipo = document.createElement("th");
      equipo.scope = "row";
      equipo.textContent = fila.equipo === null ? "Sin número" : String(fila.equipo).padStart(12, "0");
      renglon.append(equipo);
      for (const valor of [fila.total, fila.con, fila.sin]) renglon.insertCell().textContent = cifra.format(valor);
    }
  }
  async function actualizar() {
    try {
      const respuesta = await fetch("/api/recuento-electoral", { cache: "no-store", credentials: "omit" });
      if (!respuesta.ok) throw Error();
      const datos = await respuesta.json();
      resumir("total", datos.total);
      for (const grupo of ["enLinea", "windows"]) {
        resumir(grupo, datos[grupo]);
        tabla(grupo, datos[grupo].detalle);
      }
      estado.textContent = "Actualización automática cada 10 segundos.";
    } catch {
      estado.textContent = "No se pudieron actualizar las cifras. El tablero volverá a intentarlo.";
    } finally {
      setTimeout(actualizar, 10_000);
    }
  }
  void actualizar();
})();
