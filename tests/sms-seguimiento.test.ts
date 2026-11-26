import { afterAll, beforeAll, expect, it } from "vitest";
import { GET } from "@/app/s/[token]/route";
import { POST } from "@/app/api/webhooks/smspubli/route";
import { tokenCredencialSms } from "@/server/credencial-sms";
import { closePools } from "@/server/db";
import { hashEnlaceSms, urlAcuseSms } from "@/server/envios/sms-seguimiento";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const cedula = "0000000001";
const telefono = "+34600000001";
let id: number;
let envio: number;
let token: string;

beforeAll(async () => {
  await reiniciarBase({ correo: "super@prueba.cne", password: "clave-de-prueba-1", modo: "eleccion" });
  [{ id }] = await consultarDueno<{ id: number }>(
    `INSERT INTO cne.mjrv (cedula,apellidos,nombres,rol,cargo_original,junta_origen_id,telefono_e164)
       SELECT $1,'PRUEBA','MUESTRA','vocal','VOCAL',id,$2 FROM cne.juntas_madrid WHERE serie='M' AND numero=1
       RETURNING id`, [cedula, telefono],
  );
  token = tokenCredencialSms({ id, cedula, telefono }, Date.now() + 600_000);
  [{ id: envio }] = await consultarDueno<{ id: number }>(
    `INSERT INTO cne.envios_sms (mjrv_id,destino,remitente,token_hash) VALUES ($1,$2,'+34679381651',$3) RETURNING id`,
    [id, telefono, hashEnlaceSms(token)],
  );
});

afterAll(closePools);

const consultar = async () => (await consultarDueno<{
  abierto_en: Date | null; estado: string; id_externo: string | null; clic_en: Date | null;
}>("SELECT abierto_en,estado,id_externo,clic_en FROM cne.envios_sms WHERE id=$1", [envio]))[0];

it("registra solamente la primera descarga válida del enlace enviado", async () => {
  const otro = tokenCredencialSms({ id, cedula, telefono }, Date.now() + 600_000);
  const descargar = (t: string, method = "GET", headers?: HeadersInit) =>
    GET(new Request("https://madrid.consulado.app/s/ficha", { method, headers }), { params: Promise.resolve({ token: t }) });
  expect((await descargar(otro)).status).toBe(200);
  expect((await descargar(token, "HEAD")).status).toBe(200);
  expect((await descargar(token, "GET", { "sec-purpose": "prefetch" })).status).toBe(200);
  expect((await consultar()).abierto_en).toBeNull();
  const resultado = await descargar(token);
  expect(resultado.headers.get("content-type")).toBe("application/pdf");
  const primera = (await consultar()).abierto_en;
  expect(primera).toBeInstanceOf(Date);
  await descargar(token);
  expect((await consultar()).abierto_en).toEqual(primera);
});

it("exige la firma del envío y controla acuses, clics y estados fuera de orden", async () => {
  const url = urlAcuseSms("madrid.consulado.app", envio);
  const post = (body: unknown, u = url) => POST(new Request(u, { method: "POST", body: JSON.stringify(body) }));
  const acuse = { sms_id: "PRUEBA012345", to: "34600000001", custom: `CNESMS${envio}`, status: "DELIVRD" };
  expect((await post([acuse], new URL(url).origin + new URL(url).pathname)).status).toBe(401);
  expect((await post([{ ...acuse, to: "34600000002" }])).status).toBe(200);
  expect((await consultar()).estado).toBe("reservado");
  expect((await post([acuse])).status).toBe(200);
  expect(await consultar()).toMatchObject({ estado: "entregado", id_externo: "PRUEBA012345", clic_en: null });
  expect((await post([{ ...acuse, status: "UNDELIV" }])).status).toBe(200);
  expect((await post({ PRUEBA012345: { msisdn: "34600000001", timestamp: "2026-11-26 12:00:00", ip: "192.0.2.1" } })).status).toBe(200);
  expect(await consultar()).toMatchObject({ estado: "entregado", clic_en: expect.any(Date) });
});
