import { closePools } from "../../src/server/db";
import { prepararRectificacionWhatsApp } from "../../src/server/envios/rectificacion";

const modo = process.argv[2];
async function main() {
  if (modo !== "comprobar" && modo !== "preparar") throw new Error("Use comprobar o preparar.");
  const resultado = await prepararRectificacionWhatsApp(modo === "preparar");
  console.log(JSON.stringify(resultado));
  if (modo === "preparar" && !resultado.aplicada) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const detalle = (error as { code?: string }).code;
  console.error("La preparación se canceló. Código:", /^\w{5}$/.test(detalle ?? "") ? detalle : "validación");
  process.exitCode = 1;
}).finally(closePools);
