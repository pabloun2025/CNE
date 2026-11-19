import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { prepararBase } from "@/server/schema-apply";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// El arranque solo asegura la cuenta «admin» (sin contraseña). Cónsul, coordinador y financiero los crea la superadmin.
const preparar = () => prepararBase({ url: process.env.DATABASE_TEST_URL });
const cuentas = () => consultarDueno<{ correo: string; rol: string; debe_cambiar: boolean; password_hash: string | null; password_pendiente: boolean }>(
  "SELECT correo, rol, debe_cambiar, password_hash, password_pendiente FROM cne.usuarios WHERE tipo = 'madrid_admin' ORDER BY correo",
);

describe("cuentas de Madrid del arranque", () => {
  beforeAll(() => reiniciarBase());
  afterAll(closePools);

  it("las pruebas con superadmin explícita no siembran cuentas", async () => {
    expect(await consultarDueno("SELECT 1 FROM cne.usuarios WHERE tipo = 'madrid_admin'")).toHaveLength(0);
  });

  it("crea solo la cuenta admin, sin contraseña y sin las otras cuentas", async () => {
    const r = await preparar();
    expect(r.adminCreada).toBe(true);
    expect(await cuentas()).toEqual([{ correo: "admin", rol: "consul", debe_cambiar: false, password_hash: null, password_pendiente: true }]);
  });

  it("repetir el arranque no toca la contraseña de admin ni inventa cónsul, coordinador o financiero", async () => {
    await consultarDueno("UPDATE cne.usuarios SET password_hash = 'marca-intacta', password_pendiente = false WHERE correo = 'admin'");
    expect((await preparar()).adminCreada).toBe(false);
    expect(await cuentas()).toEqual([{ correo: "admin", rol: "consul", debe_cambiar: false, password_hash: "marca-intacta", password_pendiente: false }]);
  });
});
