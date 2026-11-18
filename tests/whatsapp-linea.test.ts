import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { EvolutionSimulado, type ClienteEvolution } from "@/server/envios/evolution";
import { crearLinea, desvincularLinea, estadoLinea } from "@/server/whatsapp-linea";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion = (tipo = "superadmin"): Sesion => ({ sesionId: "x", usuarioId: 1, correo: "s@x.y", nombre: "S", tipo, debeCambiar: false, mfaVerificada: true });

describe("línea de WhatsApp de CNE (cliente simulado)", () => {
  beforeAll(async () => { await reiniciarBase(); });
  beforeEach(() => EvolutionSimulado.reiniciar());
  afterAll(closePools);

  it("solo la superadmin", async () => {
    await expect(estadoLinea(sesion("madrid_admin"))).rejects.toThrow("superadministración");
    await expect(crearLinea(sesion("madrid_admin"))).rejects.toThrow("superadministración");
    await expect(desvincularLinea(sesion("madrid_admin"))).rejects.toThrow("superadministración");
  });

  it("sin crear → «Crear y vincular» da un QR → vinculada → «Desvincular» la deja desconectada y apaga el interruptor", async () => {
    expect(await estadoLinea(sesion())).toMatchObject({ estado: "sin_crear", simulada: true, instancia: "cne-madrid" });
    const l = await crearLinea(sesion());
    expect(l).toMatchObject({ estado: "esperando_qr" });
    expect(l.qr).toMatch(/^data:image\/png;base64,/);

    EvolutionSimulado.completarVinculo("+34000000001"); // equivale a escanear el código
    expect(await estadoLinea(sesion())).toMatchObject({ estado: "vinculada", numero: "+34000000001" });
    expect((await consultarDueno<{ whatsapp_numero: string }>("SELECT whatsapp_numero FROM cne.configuracion"))[0].whatsapp_numero).toBe("+34000000001");

    await consultarDueno("UPDATE cne.configuracion SET whatsapp_real = true");
    expect(await desvincularLinea(sesion())).toEqual({ ok: true });
    expect(await estadoLinea(sesion())).toMatchObject({ estado: "desconectada", numero: null });
    expect(await consultarDueno("SELECT whatsapp_real, whatsapp_numero FROM cne.configuracion")).toEqual([{ whatsapp_real: false, whatsapp_numero: null }]);
    const acc = await consultarDueno<{ accion: string }>("SELECT accion FROM cne.auditoria WHERE accion LIKE 'linea_whatsapp%' ORDER BY id");
    expect(acc.map((a) => a.accion)).toEqual(["linea_whatsapp_creada", "linea_whatsapp_desvinculada"]);
  });

  it("crear dos veces no duplica la instancia", async () => {
    let creadas = 0;
    const base = new EvolutionSimulado();
    const cliente: ClienteEvolution = {
      simulado: true,
      crearInstancia: async () => { creadas++; await base.crearInstancia(); },
      conectar: () => base.conectar(), resumen: () => base.resumen(), cerrarSesion: () => base.cerrarSesion(), enviarDocumento: () => base.enviarDocumento(),
    };
    await crearLinea(sesion(), cliente);
    await crearLinea(sesion(), cliente);
    expect(creadas).toBe(1);
  });

  it("si Evolution no responde, el estado lo dice sin romper", async () => {
    const roto: ClienteEvolution = { ...new EvolutionSimulado(), simulado: false, resumen: async () => { throw new (await import("@/server/envios/evolution")).ErrorEvolution("Evolution API no responde (ECONNREFUSED)."); } } as unknown as ClienteEvolution;
    expect(await estadoLinea(sesion(), { cliente: roto })).toMatchObject({ estado: "desconectada", error: expect.stringContaining("no responde") });
  });
});
