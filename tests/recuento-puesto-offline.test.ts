import { randomUUID } from "node:crypto";
import { asignarTerminalEnLinea, registrarConsultaMovil } from "@/server/puesto-movil/terminal-online";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { recuentoOffline } from "@/server/puesto-movil/recuento-offline";
import { reiniciarBase } from "./helpers/db";

beforeAll(() => reiniciarBase());
afterAll(closePools);

it("conserva el último corte por puesto, admite rectificaciones y no suma duplicados", async () => {
  const viejo = "1.1.0123456789abcdef.3.2.1.0";
  const nuevo = "1.1.0123456789abcdef.6.2.2.0";
  const otro = "1.2.abcdeffedcba0123.2.0.1.1";

  await Promise.all([recuentoOffline(viejo), recuentoOffline(nuevo), recuentoOffline(otro)]);
  expect((await recuentoOffline(nuevo)).estado).toBe("ya registrado");
  expect((await recuentoOffline(viejo)).estado).toBe("anterior");
  expect((await recuentoOffline()).terminales).toMatchObject([
    { terminal: 1, revision: 6, con_padron: 2, sin_padron: 2, otra: 0 },
    { terminal: 2, revision: 2, con_padron: 0, sin_padron: 1, otra: 1 },
  ]);
  expect((await recuentoOffline("1.1.0123456789abcdef.7.2.1.0")).terminales[0].sin_padron).toBe(1);
  await expect(recuentoOffline("1.1.abcdeffedcba0123.8.2.1.0")).rejects.toMatchObject({ status: 409 });
  await expect(recuentoOffline("1.1.0123456789abcdef.7.2.2.0")).rejects.toMatchObject({ status: 409 });
  await expect(recuentoOffline("1.1.0123456789abcdef.3.4.0.0")).rejects.toMatchObject({ status: 400 });
});

it("numera los terminales en línea, vincula un navegador y separa las consultas sin asignar", async () => {
  const enlace = await asignarTerminalEnLinea(11);
  const token = new URL(enlace).hash.slice("#terminal=".length);
  const instalacion = "0123456789abcdef";
  await registrarConsultaMovil(randomUUID(), "con", token, instalacion);
  await registrarConsultaMovil(randomUUID(), "sin", token, instalacion);
  await registrarConsultaMovil(randomUUID(), "sin", undefined, undefined);
  await expect(registrarConsultaMovil(randomUUID(), "con", token, "fedcba9876543210")).rejects.toMatchObject({ status: 409 });
  const otro = new URL(await asignarTerminalEnLinea(12)).hash.slice("#terminal=".length);
  await expect(registrarConsultaMovil(randomUUID(), "con", otro, instalacion)).rejects.toMatchObject({ status: 409 });
  await expect(registrarConsultaMovil(randomUUID(), "con", "12." + token.split(".")[1], "fedcba9876543210")).rejects.toMatchObject({ status: 403 });
  expect(await recuentoOffline()).toMatchObject({
    enLinea: [{ terminal: 11, con: 1, sin: 1 }, { terminal: 12, con: 0, sin: 0 }],
    sinTerminal: 1,
  });
});
