import { afterAll, beforeAll, expect, it } from "vitest";
import { closePools, query } from "@/server/db";
import { guardarCorteWindows } from "@/server/recuento-electoral";
import { GET } from "@/app/api/recuento-electoral/route";
import { reiniciarBase } from "./helpers/db";

beforeAll(() => reiniciarBase());
afterAll(closePools);

it("suma solo el último corte de cada equipo y añade las consultas en línea", async () => {
  await guardarCorteWindows({ equipo: 101, total: 7, sin: 2 });
  await guardarCorteWindows({ equipo: 101, total: 7, sin: 2 });
  await guardarCorteWindows({ equipo: 101, total: 2, sin: 1 });
  await Promise.all([
    guardarCorteWindows({ equipo: 202, total: 3, sin: 0 }),
    guardarCorteWindows({ equipo: 202, total: 4, sin: 1 }),
  ]);
  await query(`INSERT INTO cne.puesto_movil_actividad (id,tipo,equipo,solicitud) VALUES
    ('0e657312-2202-421b-8314-a5fb1b46da00','con',303,'7561fcc0-6ce8-4fd3-a178-864f422b4c20'),
    ('0e657312-2202-421b-8314-a5fb1b46da01','sin',303,'7561fcc0-6ce8-4fd3-a178-864f422b4c21'),
    ('0e657312-2202-421b-8314-a5fb1b46da02','con',NULL,NULL)`);
  const respuesta=await GET();
  expect(respuesta.headers.get("cache-control")).toContain("no-store");
  expect(await respuesta.json()).toEqual({
    total:{equipos:3,total:14,con:10,sin:4},
    windows:{equipos:2,total:11,con:8,sin:3,detalle:[
      {equipo:101,total:7,con:5,sin:2},{equipo:202,total:4,con:3,sin:1},
    ]},
    enLinea:{equipos:1,total:3,con:2,sin:1,detalle:[
      {equipo:303,total:2,con:1,sin:1},{equipo:null,total:1,con:1,sin:0},
    ]},
  });
});
