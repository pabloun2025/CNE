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
