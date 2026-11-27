import { readFileSync } from "node:fs";
import { buscarParaValidacion } from "./src/server/documentos";
import { marcarDocumentoParaRepetir } from "./src/server/mjrv";
import { closePools } from "./src/server/db";
import { formatoPublicoJunta } from "./src/domain/juntas";

class Control extends Error {}
function exigir(valor: unknown, mensaje: string): asserts valor { if (!valor) throw new Control(mensaje); }
async function main() {
  exigir(process.env.CNE_COTEJO_MODO === "ejecutar", "Operación desconocida.");
  const datos = JSON.parse(readFileSync(process.env.CNE_COTEJO_ARCHIVO!, "utf8")) as { cedula: string; nombre: string };
  const ficha = await buscarParaValidacion(datos.cedula);
  exigir(ficha?.modo === "eleccion" && formatoPublicoJunta(ficha.junta) === "F44" && ficha.nombre === datos.nombre,
    "La ficha ya no coincide con el caso indicado.");
  if (!ficha.necesitaRepetir) {
    exigir(ficha.validada && ficha.revisionEn, "La validación ya cambió. Revise la ficha vigente.");
    const r = await marcarDocumentoParaRepetir(
      { tipo: "usuario", id: 1, nombre: "Administración CNE", portal: "finanzas" },
      ficha.mjrvId, ficha.modo, ficha.version, ficha.revisionEn, "Fotos borrosas",
    );
    if (!r.ok) throw new Control(r.mensaje);
  }
  const actual = await buscarParaValidacion(datos.cedula);
  exigir(actual?.necesitaRepetir && !actual.validada && actual.motivoRepetir === "Fotos borrosas",
    "Compruebe el estado de la ficha.");
  console.log(JSON.stringify({ junta: "F44", estado: "necesita_repetir", motivo: actual.motivoRepetir,
    fotos_conservadas: actual.version === ficha.version }));
}
main().catch((e: unknown) => {
  console.error(e instanceof Control ? e.message : "Falló la comprobación del estado documental.");
  process.exitCode = 1;
}).finally(closePools);
