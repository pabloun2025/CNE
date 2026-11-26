import { readFileSync } from "node:fs";
import { join } from "node:path";

export function credencialesMovil() {
  let acceso = process.env.CNE_MOVIL_ACCESO;
  let seguimiento = process.env.CNE_MOVIL_SEGUIMIENTO;
  const dir = process.env.CNE_MOVIL_PADRON_DIR;
  if ((!acceso || !seguimiento) && dir) {
    try {
      const data = readFileSync(join(/* turbopackIgnore: true */ dir, "acceso.bin"));
      try {
        if (data.length === 64) {
          acceso ??= data.subarray(0, 32).toString("base64url");
          seguimiento ??= data.subarray(32).toString("base64url");
        }
      } finally { data.fill(0); }
    } catch { /* La instalación todavía no está activa. */ }
  }
  return { acceso, seguimiento };
}
