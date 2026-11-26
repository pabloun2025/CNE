import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { CIERRE_PADRON_MOVIL, crearAlmacenPadronMovil } from "@/server/puesto-movil/padron";
import { indexar } from "@/server/puesto-movil/formato";
import { prepararPadronMovil } from "../scripts/preparar-padron-movil";

it("sustituye el padrón en memoria y en disco conservando la clave y el acceso", () => {
  const tmp=mkdtempSync(join(tmpdir(),"cne-reemplazo-prueba-"));
  vi.useFakeTimers({toFake:["Date","performance","setTimeout","clearTimeout"]});
  vi.setSystemTime(CIERRE_PADRON_MOVIL-10_000);
  try {
    const dir=join(tmp,"padron");
    const anterior={cedula:"0000000001",nombre:"PERSONA PRUEBA",recinto:"Caja Mágica",junta:"M1",zona:"Amarillo"};
    const nuevo={...anterior,cedula:"0000000002",recinto:"Toledo",zona:"Zona Única"};
    prepararPadronMovil([anterior],dir);
    const clave=readFileSync(join(dir,"clave"));
    const almacen=crearAlmacenPadronMovil(dir);
    expect(almacen.consultar(anterior.cedula)).not.toBeNull();
    almacen.reemplazar(indexar([nuevo]));
    expect(almacen.consultar(anterior.cedula)).toBeNull();
    expect(almacen.consultar(nuevo.cedula)?.zona).toBe("Zona Única");
    expect(readFileSync(join(dir,"clave"))).toEqual(clave);
    expect(crearAlmacenPadronMovil(dir).consultar(nuevo.cedula)?.junta).toBe("M1");
    vi.advanceTimersByTime(10_000);
    expect(()=>almacen.reemplazar(indexar([anterior]))).toThrow(/cerrado/);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    rmSync(tmp,{recursive:true,force:true});
  }
});
