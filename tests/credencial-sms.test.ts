import { describe, expect, it } from "vitest";
import { tokenCredencialSms, leerTokenCredencialSms } from "@/server/credencial-sms";
import { GET } from "@/app/s/[token]/route";

const ficha = { id: 27, cedula: "0000000001", telefono: "+34000000000" };

describe("enlaces individuales de la credencial por SMS", () => {
  it("autentica la ficha y caduca en el instante fijado", () => {
    const ahora = Date.now();
    const token = tokenCredencialSms(ficha, ahora + 3_600_000);
    expect(leerTokenCredencialSms(token, ahora)).toEqual(ficha);
    expect(leerTokenCredencialSms(token, ahora + 3_600_000)).toBeNull();
    expect(leerTokenCredencialSms((token[0] === "A" ? "B" : "A") + token.slice(1), ahora)).toBeNull();
  });

  it("sirve el PDF ficticio sin caché e impide una descarga con un token inválido", async () => {
    const token = tokenCredencialSms(null, Date.now() + 3_600_000);
    const request = new Request("http://localhost/s/prueba");
    const r = await GET(request, { params: Promise.resolve({ token }) });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("content-disposition")).toContain("credencial-prueba.pdf");
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await GET(request, { params: Promise.resolve({ token: "invalido" }) })).status).toBe(404);
  });
});

it("rechaza un enlace real cuando cambia el teléfono de su ficha", async () => {
  const { closePools } = await import("@/server/db");
  const { consultarDueno, reiniciarBase } = await import("./helpers/db");
  await reiniciarBase({ correo: "super@prueba.cne", password: "clave-de-prueba-1", modo: "eleccion" });
  try {
    const [{ id }] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.mjrv (cedula,apellidos,nombres,cargo_original,rol,junta_origen_id,telefono_e164,es_prueba)
       SELECT $1,'APELLIDO PRUEBA','NOMBRE PRUEBA','SECRETARIO/A','secretario',id,$2,false
         FROM cne.juntas_madrid WHERE serie='H' AND numero=9 RETURNING id`, [ficha.cedula, ficha.telefono],
    );
    const token = tokenCredencialSms({ ...ficha, id }, Date.now() + 3_600_000);
    const descargar = () => GET(new Request("http://localhost/s/ficha"), { params: Promise.resolve({ token }) });
    expect((await descargar()).status).toBe(200);
    await consultarDueno("UPDATE cne.mjrv SET telefono_e164=$1 WHERE id=$2", ["+34000000001", id]);
    expect((await descargar()).status).toBe(404);
    await consultarDueno("UPDATE cne.mjrv SET telefono_e164=$1, activo=false WHERE id=$2", [ficha.telefono, id]);
    expect((await descargar()).status).toBe(404);
  } finally {
    await closePools();
  }
});
