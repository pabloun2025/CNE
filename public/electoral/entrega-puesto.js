"use strict";
(() => {
  const boton = document.getElementById("descargar");
  const estado = document.getElementById("estado");
  const credencial = /^#([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname);
  if (!credencial || !crypto.subtle) {
    estado.textContent = "Abra el enlace privado completo que recibió en el chat.";
    return;
  }
  boton.disabled = false;
  boton.addEventListener("click", async () => {
    boton.disabled = true;
    estado.textContent = "Descargando el ZIP. Mantenga esta página abierta.";
    try {
      const respuesta = await fetch("/api/entrega-puesto", { cache: "no-store", credentials: "omit",
        headers: { Authorization: "Bearer " + credencial[1] } });
      if (!respuesta.ok) throw Error(respuesta.status === 410 ? "El enlace de descarga ha caducado." : "La descarga no está disponible. Inténtelo de nuevo.");
      const cifrado = await respuesta.arrayBuffer();
      const clave = Uint8Array.from(atob(credencial[2].replace(/-/g,"+").replace(/_/g,"/").padEnd(44,"=")), x => x.charCodeAt(0));
      const aes = await crypto.subtle.importKey("raw", clave, "AES-GCM", false, ["decrypt"]);
      clave.fill(0);
      const zip = await crypto.subtle.decrypt({ name: "AES-GCM", iv: cifrado.slice(0,12) }, aes, cifrado.slice(12));
      const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = "PuestoElectoralWindows.zip";
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      estado.textContent = "ZIP enviado a Descargas.";
    } catch (e) { estado.textContent = e.message || "Repita la descarga."; }
    finally { boton.disabled = false; }
  });
})();
