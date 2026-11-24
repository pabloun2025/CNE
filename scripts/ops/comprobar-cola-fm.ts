import { closePools } from "../../src/server/db";
import { comprobarCola, lineasRecuento } from "../../src/server/envios/comprobar-cola";

// Solo lectura: no envía nada ni escribe en la base. Imprime recuentos, sin datos personales.
async function main() {
  const r = await comprobarCola();
  console.log(lineasRecuento(r).join("\n") || "La cola no tiene envíos reales pendientes.");
  const malos = r.reduce((n, g) => n + g.incoherentes, 0);
  console.log(malos ? `INCOHERENCIAS: ${malos}` : "Sin incoherencias.");
  if (malos) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const detalle = (error as { code?: string }).code;
  console.error("La comprobación se canceló. Código:", /^\w{5}$/.test(detalle ?? "") ? detalle : "validación");
  process.exitCode = 1;
}).finally(closePools);
