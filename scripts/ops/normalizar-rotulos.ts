import { closePools } from "../../src/server/db";
import { normalizarRotulos } from "../../src/server/normalizar-rotulos";

const modo = process.argv[2];
async function main() {
  if (modo !== "comprobar" && modo !== "aplicar") throw new Error("Use comprobar o aplicar.");
  const resultado = await normalizarRotulos(modo === "aplicar");
  console.log(JSON.stringify(resultado));
}

main().catch((error: unknown) => {
  const detalle = (error as { code?: string }).code;
  console.error("La normalización se canceló. Código:", /^\w{5}$/.test(detalle ?? "") ? detalle : "validación");
  process.exitCode = 1;
}).finally(closePools);
