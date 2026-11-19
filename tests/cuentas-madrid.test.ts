import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerSesion, login } from "@/server/auth";
import { closePools } from "@/server/db";
import { prepararBase } from "@/server/schema-apply";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// C3 · Tres cuentas de administración de Madrid (usuario, no correo), creadas en el arranque si faltan.
const preparar = () => prepararBase({ url: process.env.DATABASE_TEST_URL });
const entrar = (correo: string, password: string) => login({ correo, password, portal: "admin", ip: null, agente: null });

describe("cuentas de Madrid del arranque", () => {
  beforeAll(() => reiniciarBase());
  afterAll(closePools);

  it("las pruebas con superadmin explícita no siembran cuentas", async () => {
    expect(await consultarDueno("SELECT 1 FROM cne.usuarios WHERE tipo = 'madrid_admin'")).toHaveLength(0);
  });

  it("crea coordinador, consul y financiero con su rol, sin obligar a cambiar la contraseña", async () => {
    const r = await preparar();
    expect(r.cuentasMadridCreadas).toBe(3);
    const filas = await consultarDueno<{ correo: string; rol: string; debe_cambiar: boolean; activo: boolean; password_hash: string | null; password_pendiente: boolean }>("SELECT correo, rol, debe_cambiar, activo, password_hash, password_pendiente FROM cne.usuarios WHERE tipo = 'madrid_admin' ORDER BY correo");
    expect(filas.map((f) => [f.correo, f.rol, f.debe_cambiar, f.activo])).toEqual([["admin", "consul", false, true], ["consul", "consul", false, true], ["coordinador", "coordinador", false, true], ["financiero", "financiero", false, true]]);
    const admin = filas.find((f) => f.correo === "admin");
    expect(admin).toMatchObject({ password_hash: null, password_pendiente: true });
    for (const f of filas.filter((f) => f.correo !== "admin")) {
      expect(f.password_hash).toMatch(/^\$argon2id\$/);
      expect(f.password_hash).not.toContain("Elecciones2026");
      const l = await entrar(f.correo, "Elecciones2026");
      expect(l.ok && !l.debeCambiar).toBe(true);
      if (l.ok) expect((await leerSesion(l.token, "admin"))?.rol).toBe(f.rol);
    }
    expect((await entrar("Coordinador", "Elecciones2026")).ok).toBe(true); // mayúsculas: se normaliza
  });

  it("repetir el arranque no crea nada ni toca las contraseñas existentes", async () => {
    await consultarDueno("UPDATE cne.usuarios SET password_hash = 'marca-intacta' WHERE correo = 'financiero'");
    await consultarDueno("UPDATE cne.usuarios SET activo = false WHERE correo = 'consul'");
    expect((await preparar()).cuentasMadridCreadas).toBe(0);
    const f = await consultarDueno<{ correo: string; password_hash: string; activo: boolean }>("SELECT correo, password_hash, activo FROM cne.usuarios WHERE correo IN ('financiero','consul') ORDER BY correo");
    expect(f[1].password_hash).toBe("marca-intacta");
    expect(f[0].activo).toBe(false); // una cuenta desactivada a propósito sigue desactivada
  });

  it("si falta solo una, crea solo esa", async () => {
    await consultarDueno("DELETE FROM cne.sesiones WHERE usuario_id IN (SELECT id FROM cne.usuarios WHERE correo = 'coordinador')");
    await consultarDueno("DELETE FROM cne.usuarios WHERE correo = 'coordinador'");
    expect((await preparar()).cuentasMadridCreadas).toBe(1);
  });
});
