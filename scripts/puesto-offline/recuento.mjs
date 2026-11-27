import { toCanvas } from "qrcode";

const clave = "cne-madrid-29n-recuento-v1";
const el = id => document.getElementById(id);
const categorias = ["con", "sin", "otra"];
let datos;

function estado(texto) { el("estado").textContent = texto; }

function guardar(copia) {
  try { localStorage.setItem(clave, JSON.stringify(copia)); }
  catch { estado("No se guardó el cambio. Compruebe el almacenamiento del navegador."); return; }
  datos = copia;
  mostrar();
}

function mostrar() {
  el("atencion").hidden = false;
  el("entrega").hidden = true;
  el("puesto").textContent = "Terminal sin conexión " + String(datos.terminal).padStart(2, "0").replace(/(\d)(?=(\d{3})+$)/g, "$1-");
  for (const campo of categorias) el(campo).textContent = datos[campo];
  el("total").textContent = datos.con + datos.sin + datos.otra;
  el("deshacer").disabled = !datos.ultima;
  estado("Recuento guardado en este navegador.");
}

function alCambiar(evento) {
  if (evento.key !== clave || !evento.newValue) return;
  datos = JSON.parse(evento.newValue);
  mostrar();
}
window.addEventListener("storage", alCambiar);

try {
  const anterior = localStorage.getItem(clave);
  if (anterior) {
    datos = JSON.parse(anterior);
    mostrar();
  } else {
    const instalacion = Array.from(crypto.getRandomValues(new Uint8Array(8)), n => n.toString(16).padStart(2, "0")).join("");
    const terminal = 100_000_000_000_000 + Number.parseInt(instalacion.slice(0, 12), 16);
    guardar({ terminal, instalacion, revision: 0, con: 0, sin: 0, otra: 0, ultima: null });
  }
} catch { estado("No se pudo guardar o recuperar el recuento. Abra el archivo en el navegador habitual."); }

for (const boton of document.querySelectorAll("[data-categoria]")) {
  boton.addEventListener("click", () => {
    const categoria = boton.dataset.categoria;
    guardar({ ...datos, [categoria]: datos[categoria] + 1, revision: datos.revision + 1, ultima: categoria });
  });
}
el("deshacer").addEventListener("click", () => {
  const categoria = datos.ultima;
  if (!categoria) return;
  guardar({ ...datos, [categoria]: datos[categoria] - 1, revision: datos.revision + 1, ultima: null });
});
el("cierre").addEventListener("click", async () => {
  const codigo = [datos.terminal <= 99 ? 1 : 2, datos.terminal, datos.instalacion, datos.revision, datos.con, datos.sin, datos.otra].join(".");
  el("codigo").value = codigo;
  try {
    await toCanvas(el("qr"), "https://madrid.consulado.app/recuento-offline#" + codigo, { width: 300, margin: 4 });
    el("qr").hidden = false;
  } catch { el("qr").hidden = true; }
  el("entrega").hidden = false;
});
el("codigo").addEventListener("focus", evento => evento.target.select());
el("archivo").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([el("codigo").value + "\n"], { type: "text/plain" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "corte-puesto-" + datos.terminal + "-r" + datos.revision + ".txt";
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
