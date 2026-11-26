import type { PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leerTokenCredencialSms } from "@/server/credencial-sms";
import * as db from "@/server/db";
import { enviarSmsPubli, mensajeSmsMadrid, remitenteSmsMadrid } from "@/server/envios/sms-publi";
import { hashEnlaceSms } from "@/server/envios/sms-seguimiento";
import { enviarLoteSmsMadrid, prepararLoteSmsMadrid, type FichaLoteSms } from "../scripts/ops/enviar-sms-madrid";

const texto = "Nombre, le esperamos el 29/11 a las 08:00 en la Caja Magica para las elecciones de Ecuador. Presente el QR de su credencial:\n{LINK}";
const mensaje = {
  id: 27,
  destino: "+34600000001",
  remitente: "+34679381651",
  texto,
  enlace: "https://madrid.consulado.app/s/PRUEBA",
  acuse: "https://madrid.consulado.app/api/prueba",
};

describe("SMS Publi de Madrid", () => {
  it("usa el primer nombre en GSM7 y reserva 18 caracteres para el enlace", () => {
    expect(mensajeSmsMadrid("  Nómbre Prueba  ")).toEqual({ ok: true, texto, longitud: 143 });
    expect(mensajeSmsMadrid("A".repeat(23))).toMatchObject({ ok: true, longitud: 160 });
    expect(mensajeSmsMadrid("A".repeat(24))).toEqual({ ok: false, motivo: "nombre_largo" });
    expect(mensajeSmsMadrid("PRUEBA_01")).toEqual({ ok: false, motivo: "nombre_invalido" });
    expect(remitenteSmsMadrid("M")).toBe("+34679381651");
    expect(remitenteSmsMadrid("H")).toBe("+34615273435");
  });

  it("solicita un enlace, un segmento y el acuse para un único destinatario", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status: "ok", result: [{ status: "ok", sms_id: "a123" }] })));
    expect(await enviarSmsPubli(mensaje, { apiKey: "clave-de-prueba", fetch })).toEqual({ estado: "aceptado", idExterno: "a123" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://api.gateway360.com/api/3.0/sms/send-link");
    expect(JSON.parse(init.body)).toEqual({
      api_key: "clave-de-prueba", link: mensaje.enlace, report_url: mensaje.acuse, encoding: "GSM7", concat: 0,
      messages: [{ from: "+34679381651", to: "34600000001", text: texto, custom: "CNESMS27" }],
    });
  });

  it("distingue un rechazo explícito de una aceptación sin identificador o sin respuesta", async () => {
    const enviar = (body: unknown, status: number) => enviarSmsPubli(mensaje, {
      apiKey: "clave-de-prueba", fetch: async () => new Response(JSON.stringify(body), { status }),
    });
    expect(await enviar({ status: "error", error_id: "INVALID_DESTINATION" }, 200)).toEqual({ estado: "fallo", codigo: "INVALID_DESTINATION" });
    expect(await enviar({ status: "ok", result: [{ status: "ok" }] }, 200)).toEqual({ estado: "incierto", codigo: "RESPUESTA_INCIERTA" });
    expect(await enviar({ status: "error" }, 502)).toEqual({ estado: "incierto", codigo: "HTTP_502" });
    expect(await enviarSmsPubli(mensaje, { apiKey: "clave-de-prueba", fetch: async () => { throw new Error("error de prueba"); } })).toEqual({ estado: "incierto", codigo: "RESPUESTA_INCIERTA" });
  });
});

describe("preflight del lote de Madrid", () => {
  const ficha: FichaLoteSms = {
    id: 1, cedula: "0000000001", nombres: "Nombre Prueba", telefono: "+34600000001", serie: "M",
    numero: 23, rol: "vocal", estado: null,
  };

  it("excluye solo Secretaría de F23 y retiene ambos destinatarios de un teléfono compartido", () => {
    const fichas: FichaLoteSms[] = [
      { ...ficha, numero: 14 },
      { ...ficha, id: 2, cedula: "0000000002", rol: "secretario", telefono: "+34600000002" },
      { ...ficha, id: 3, cedula: "0000000003", numero: 41, rol: "presidente" },
      { ...ficha, id: 4, cedula: "0000000004", serie: "H", telefono: "+34600000004" },
    ];
    const r = prepararLoteSmsMadrid(fichas);
    expect(r.informe).toMatchObject({ fichasF: 2, fichasM: 1, excluidasF23Secretaria: 1, destinosCompartidos: 1, fichasRetenidas: 2, padronCoincide: false });
    expect(r.preparadas.map(({ id }) => id)).toEqual([4]);
    expect(prepararLoteSmsMadrid(fichas, true).preparadas.map(({ id }) => id)).toEqual([1, 3, 4]);
    fichas[2] = { ...fichas[2], numero: 24 };
    expect(prepararLoteSmsMadrid(fichas, true).preparadas.map(({ id }) => id)).toEqual([4]);
  });

  it("cuenta registros inválidos y reservas previas con resultados agregados", () => {
    const r = prepararLoteSmsMadrid([
      { ...ficha, estado: "reservado" },
      { ...ficha, id: 2, cedula: "0000000002", nombres: "!PRUEBA", telefono: null },
      { ...ficha, id: 3, cedula: "0000000003", nombres: "A".repeat(24), telefono: "+34600000003" },
    ]);
    expect(r.informe).toMatchObject({ nombresInvalidos: 1, nombresLargos: 1, telefonosInvalidos: 1, existentes: { reservado: 1 }, pendientes: 0 });
    expect(JSON.stringify(r.informe)).not.toMatch(/Nombre|34600000001|0000000001/);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("confirma la reserva antes de cada solicitud y no vuelve a enviar las fichas al relanzar", async () => {
    vi.setSystemTime(new Date("2026-11-26T10:00:00+01:00"));
    const { preparadas } = prepararLoteSmsMadrid([
      { ...ficha, numero: 14 },
      { ...ficha, id: 6, cedula: "0000000006", numero: 41, rol: "presidente" },
    ], true);
    const reservas = new Map<number, string>();
    const tokens: string[] = [];
    vi.spyOn(db, "withTx").mockImplementation(async (operacion) => {
      let pendiente: { id: number; hash: string } | undefined;
      const query = async (sql: string, params: [number, string, string, string]) => {
        const [id, , , hash] = params;
        if (sql.includes("FROM cne.mjrv")) return { rowCount: 1 };
        if (sql.includes("SELECT 1 FROM cne.envios_sms")) return { rowCount: Number(reservas.has(id)) };
        if (sql.includes("INSERT INTO cne.envios_sms")) {
          pendiente = { id, hash };
          return { rows: [{ id }] };
        }
        throw new Error("Consulta inesperada en la prueba");
      };
      const valor = await operacion({ query } as unknown as PoolClient);
      if (pendiente) reservas.set(pendiente.id, pendiente.hash);
      return valor;
    });
    vi.spyOn(db, "query").mockResolvedValue([{ estado: "aceptado" }]);
    const peticion = vi.fn(async (_url: string, init: { body: string }) => {
      const { link, messages } = JSON.parse(init.body);
      const token = new URL(link).pathname.split("/").pop()!;
      const recaudo = leerTokenCredencialSms(token);
      if (!recaudo || recaudo === "prueba" || reservas.get(recaudo.id) !== hashEnlaceSms(token)) {
        throw new Error("Se solicitó un SMS antes de confirmar su reserva");
      }
      tokens.push(token);
      expect(messages).toMatchObject([{ to: "34600000001", custom: `CNESMS${recaudo.id}` }]);
      expect(leerTokenCredencialSms(token, Date.parse("2026-11-29T23:59:00+01:00"))).toBeNull();
      return new Response(JSON.stringify({ status: "ok", result: [{ status: "ok", sms_id: `prueba${recaudo.id}` }] }));
    });
    vi.stubGlobal("fetch", peticion);
    expect(await enviarLoteSmsMadrid(preparadas, "clave-de-prueba", "madrid.consulado.app")).toMatchObject({ aceptado: 2 });
    expect(new Set(tokens).size).toBe(2);
    expect(await enviarLoteSmsMadrid(preparadas, "clave-de-prueba", "madrid.consulado.app")).toMatchObject({ aceptado: 0, omitido: 2 });
    expect(peticion).toHaveBeenCalledTimes(2);
  });
});
