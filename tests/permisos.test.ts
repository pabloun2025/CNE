import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { login } from "@/server/auth";
import { closePools } from "@/server/db";
import { crearEnlace, crearOperador, identificarEstacion } from "@/server/estaciones";
import { consultarDueno, marcarMfaVerificada, reiniciarBase } from "./helpers/db";

// M25 · Matriz de permisos (§16.1, §2): cada ruta API y cada acción de servidor frente a cada tipo de sesión.
// Descubre los archivos solos: una ruta o acción nueva sin regla en la matriz hace fallar la prueba.

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: (n: string, v: string) => void jar.set(n, v), delete: (n: string) => void jar.delete(n) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

type Tipo = "ninguna" | "admin" | "super_sin_2fa" | "superadmin" | "e_puerta" | "e_documentacion" | "e_finanzas" | "e_mando";
const TIPOS: Tipo[] = ["ninguna", "admin", "super_sin_2fa", "superadmin", "e_puerta", "e_documentacion", "e_finanzas", "e_mando"];
type Regla = Tipo[] | "publica";
const SOLO_ADMIN: Regla = ["admin"];
const SOLO_SUPER: Regla = ["superadmin"];
const MANDO: Regla = ["admin", "e_mando"];

// ─── Rutas API: «METODO /url» ───
const RUTAS: Record<string, Regla> = {
  "GET /admin/informes/descargar": SOLO_ADMIN,
  "GET /admin/documentos/cartel": SOLO_ADMIN,
  "GET /admin/credenciales/pdf": SOLO_ADMIN,
  "GET /api/admin/documentos/[id]/[lado]": SOLO_ADMIN,
  "GET /api/admin/resumen": SOLO_ADMIN,
  "GET /api/admin/finanzas/resumen": SOLO_ADMIN,
  "GET /api/mando/junta": MANDO,
  "GET /api/mando/propuesta": MANDO,
  "GET /api/mando/estado": MANDO,
  "GET /api/e/puerta": ["e_puerta"],
  "POST /api/e/puerta": ["e_puerta"],
  "POST /api/e/puerta/pase": ["e_puerta"],
  "POST /api/e/documentacion/foto": ["e_documentacion", "e_finanzas"],
  "POST /api/e/documentacion/buscar": ["e_documentacion", "e_finanzas"],
  "POST /api/e/finanzas/acta/[mjrvId]": ["e_finanzas"],
  "POST /api/e/finanzas/ficha": ["e_finanzas"],
  "POST /api/e/finanzas/confirmar": ["e_finanzas"],
  "GET /superadmin/respaldo/[archivo]": SOLO_SUPER,
  "GET /api/superadmin/whatsapp/estado": SOLO_SUPER,
  "GET /api/salud": "publica",
  "POST /api/d/foto": "publica", // pública pero cerrada por el interruptor del admin
  "POST /api/d/buscar": "publica",
};

// ─── Acciones de servidor: «archivo#nombre» ───
const ACCIONES: Record<string, Regla> = {
  "acceso-actions#accederAdmin": "publica", "acceso-actions#accederSuperadmin": "publica",
  "acceso-actions#cambiarContrasenaAdmin": "publica", "acceso-actions#cambiarContrasenaSuperadmin": "publica", // validan su propia cookie y la contraseña actual
  "acceso-actions#salirAdmin": "publica", "acceso-actions#salirSuperadmin": "publica",
  "estacion-actions#entrarEstacionAccion": "publica", "estacion-actions#cambiarOperadorAccion": "publica", // acceso por PIN
  "documentos-actions#fijarFormularioAccion": SOLO_ADMIN,
  "estacion-actions#crearOperadorAccion": SOLO_ADMIN, "estacion-actions#restablecerPinAccion": SOLO_ADMIN, "estacion-actions#activarOperadorAccion": SOLO_ADMIN,
  "estacion-actions#crearEnlaceAccion": SOLO_ADMIN, "estacion-actions#revocarEnlaceAccion": SOLO_ADMIN,
  "importar-actions#revisarImportacion": SOLO_ADMIN, "importar-actions#aplicarImportacionAccion": SOLO_ADMIN,
  "mjrv-actions#crearMjrvAccion": SOLO_ADMIN, "mjrv-actions#editarMjrvAccion": SOLO_ADMIN, "mjrv-actions#bajaMjrvAccion": SOLO_ADMIN,
  "pago-actions#guardarParametrosAccion": SOLO_ADMIN,
  "envios-actions#enviarCredencialAccion": SOLO_ADMIN, "envios-actions#enviarLoteAccion": SOLO_ADMIN,
  "movimiento-actions#aceptarAccion": MANDO, "movimiento-actions#pasarAccion": MANDO, "movimiento-actions#noViableAccion": MANDO,
  "movimiento-actions#incorporarVotanteAccion": MANDO, "movimiento-actions#asignarCargoAccion": MANDO, "movimiento-actions#quitarCargoAccion": MANDO,
  "movimiento-actions#moverManualAccion": MANDO, "movimiento-actions#excepcionAccion": MANDO, "movimiento-actions#rehabilitarAccion": MANDO,
  "superadmin-actions#crearAdminAccion": SOLO_SUPER, "superadmin-actions#restablecerAdminAccion": SOLO_SUPER, "superadmin-actions#activarAdminAccion": SOLO_SUPER,
  "superadmin-actions#cambiarModoAccion": SOLO_SUPER, "superadmin-actions#cargarDemoAccion": SOLO_SUPER, "superadmin-actions#quitarDemoAccion": SOLO_SUPER,
  "superadmin-actions#respaldarAccion": SOLO_SUPER, "superadmin-actions#prepararEleccionAccion": SOLO_SUPER,
  "superadmin-actions#interruptorEnvioAccion": SOLO_SUPER, "superadmin-actions#reanudarEnviosAccion": SOLO_SUPER, "superadmin-actions#guardarRemitenteAccion": SOLO_SUPER,
  "superadmin-actions#crearLineaAccion": SOLO_SUPER, "superadmin-actions#desvincularLineaAccion": SOLO_SUPER,
  // La verificación en dos pasos se hace con la contraseña ya puesta y antes de tener el segundo factor.
  "mfa-actions#comenzarMfaAccion": ["super_sin_2fa", "superadmin"], "mfa-actions#completarMfaAccion": ["super_sin_2fa", "superadmin"],
  "mfa-actions#verificarMfaAccion": ["super_sin_2fa", "superadmin"], "mfa-actions#recuperarMfaAccion": ["super_sin_2fa", "superadmin"],
};

function archivos(dir: string, nombre: (f: string) => boolean, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, nombre, acc);
    else if (nombre(e)) acc.push(p);
  }
  return acc;
}
const SRC = path.join(process.cwd(), "src");
const urlDe = (f: string) => "/" + path.relative(path.join(SRC, "app"), path.dirname(f)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/");

const rutasDescubiertas = archivos(path.join(SRC, "app"), (n) => n === "route.ts").flatMap((f) =>
  [...readFileSync(f, "utf8").matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => ({ clave: `${m[1]} ${urlDe(f)}`, metodo: m[1], archivo: f })));
const accionesDescubiertas = archivos(path.join(SRC, "server"), (n) => n.endsWith("-actions.ts")).flatMap((f) => {
  const texto = readFileSync(f, "utf8");
  if (!/^"use server"/m.test(texto)) return [];
  return [...texto.matchAll(/export async function (\w+)/g)].map((m) => ({ clave: `${path.basename(f, ".ts")}#${m[1]}`, archivo: f, nombre: m[1] }));
});

const sesionesHechas: Partial<Record<Tipo, Record<string, string>>> = {};
function ponerSesion(tipo: Tipo) {
  jar.clear();
  Object.entries(sesionesHechas[tipo] ?? {}).forEach(([k, v]) => jar.set(k, v));
}

describe("matriz de permisos", () => {
  beforeAll(async () => {
    process.env.RESPALDO_DIR = path.join(process.cwd(), ".tmp-permisos-respaldos");
    await reiniciarBase({ correo: "super@prueba.cne", password: "clave-super-1" });
    await consultarDueno("UPDATE cne.usuarios SET debe_cambiar = false");
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar) SELECT 'madrid_admin','admin@prueba.cne','Admin Prueba', password_hash, false FROM cne.usuarios WHERE tipo = 'superadmin'");
    const entrar = async (correo: string, portal: "admin" | "superadmin") => {
      const r = await login({ correo, password: "clave-super-1", portal, ip: "10.9.9.9", agente: "prueba" });
      if (!r.ok) throw new Error("login");
      return r.token;
    };
    sesionesHechas.ninguna = {};
    sesionesHechas.admin = { cne_admin: await entrar("admin@prueba.cne", "admin") };
    sesionesHechas.super_sin_2fa = { cne_super: await entrar("super@prueba.cne", "superadmin") };
    const tok = await entrar("super@prueba.cne", "superadmin");
    await marcarMfaVerificada(tok);
    sesionesHechas.superadmin = { cne_super: tok };
    const admin = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", debeCambiar: false, mfaVerificada: false };
    for (const f of ["puerta", "documentacion", "finanzas", "mando"] as const) {
      const e = await crearEnlace(admin, f, `${f} prueba`);
      const o = await crearOperador(admin, `Operador ${f}`, [f], "1234");
      if (!e.ok || !o.ok) throw new Error("estación");
      const s = await identificarEstacion(e.token, o.id, "1234", "prueba");
      if (!s.ok) throw new Error("PIN");
      sesionesHechas[`e_${f}` as Tipo] = { cne_estacion: s.sesionToken };
    }
    await consultarDueno("UPDATE cne.configuracion SET documentos_publico_abierto = true");
  });
  afterAll(async () => {
    const { rmSync } = await import("node:fs");
    rmSync(process.env.RESPALDO_DIR!, { recursive: true, force: true });
    await closePools();
  });

  it("toda ruta y toda acción descubierta tiene regla, y no sobran reglas", () => {
    expect(rutasDescubiertas.map((r) => r.clave).sort()).toEqual(Object.keys(RUTAS).sort());
    expect(accionesDescubiertas.map((a) => a.clave).sort()).toEqual(Object.keys(ACCIONES).sort());
  });

  describe("rutas API", () => {
    const PARAMS = { id: "1", lado: "anverso", mjrvId: "1", archivo: "cne-prep-20260101T000000Z.dump" };
    async function llamar(r: (typeof rutasDescubiertas)[number]): Promise<number> {
      const modulo = await import(/* @vite-ignore */ r.archivo);
      const url = `http://localhost${urlDe(r.archivo)}`;
      let init: RequestInit = { method: r.metodo };
      if (r.metodo === "POST") init = { method: "POST", ...(r.archivo.includes("foto") ? { body: new FormData() } : { body: "{}", headers: { "content-type": "application/json" } }) };
      try {
        return (await modulo[r.metodo](new Request(url, init), { params: Promise.resolve(PARAMS) })).status;
      } catch {
        return 500; // pasó la guarda y falló después por el cuerpo vacío: no es un rechazo de permisos
      }
    }
    for (const r of rutasDescubiertas) {
      const regla = RUTAS[r.clave];
      for (const tipo of TIPOS) {
        if (!regla) continue;
        const permitido = regla === "publica" || regla.includes(tipo);
        it(`${r.clave} · ${tipo} → ${permitido ? "permitido" : "denegado"}`, async () => {
          ponerSesion(tipo);
          const status = await llamar(r);
          if (permitido) expect([401, 403]).not.toContain(status);
          else expect([401, 403]).toContain(status);
        });
      }
    }
    for (const clave of ["POST /api/d/buscar", "POST /api/d/foto"]) {
      it(`${clave} · cerrado el formulario, nadie entra (ni el personal)`, async () => {
        await consultarDueno("UPDATE cne.configuracion SET documentos_publico_abierto = false");
        try {
          const r = rutasDescubiertas.find((x) => x.clave === clave)!;
          for (const tipo of TIPOS) { ponerSesion(tipo); expect(await llamar(r)).toBe(403); }
        } finally {
          await consultarDueno("UPDATE cne.configuracion SET documentos_publico_abierto = true");
        }
      });
    }
  });

  describe("acciones de servidor", () => {
    // Denegada = redirección al acceso/verificación, «Solo la …» o «su sesión ya no es válida».
    const DENEGADA = /^REDIRECT:\/(admin\/(acceso|cambiar-contrasena)|superadmin\/(acceso|cambiar-contrasena|verificacion))$|^Solo la /;
    async function denegada(a: (typeof accionesDescubiertas)[number]): Promise<boolean> {
      const fn = (await import(/* @vite-ignore */ a.archivo))[a.nombre] as (...args: unknown[]) => Promise<unknown>;
      const f = new FormData();
      const args = fn.length >= 2 ? [null, f] : fn.length === 1 ? [f] : [];
      await consultarDueno("DELETE FROM cne.intentos_acceso WHERE clave LIKE 'mfa:%'");
      try {
        const r = await fn(...args);
        return typeof r === "object" && r !== null && "mensaje" in r && /sesión ya no es válida/.test(String((r as { mensaje: unknown }).mensaje));
      } catch (e) {
        return DENEGADA.test((e as Error).message);
      }
    }
    for (const a of accionesDescubiertas) {
      const regla = ACCIONES[a.clave];
      if (!regla || regla === "publica") continue;
      for (const tipo of TIPOS) {
        const permitido = regla.includes(tipo);
        it(`${a.clave} · ${tipo} → ${permitido ? "permitida" : "denegada"}`, async () => {
          ponerSesion(tipo);
          expect(await denegada(a)).toBe(!permitido);
        });
      }
    }
  });

  describe("páginas", () => {
    const paginas = (sub: string) => archivos(path.join(SRC, "app", sub), (n) => n === "page.tsx");
    const leer = (f: string) => readFileSync(f, "utf8");
    it("cada página de /admin con menú llama a requireAdmin", () => {
      for (const f of paginas("admin").filter((f) => f.includes(`${path.sep}(panel)${path.sep}`))) expect(leer(f), f).toMatch(/requireAdmin\(/);
      expect(leer(path.join(SRC, "app/admin/(panel)/layout.tsx"))).toMatch(/requireAdmin\(/);
    });
    it("cada página de /superadmin llama a requireSuperadmin (las de antes de la 2FA, con su excepción explícita)", () => {
      for (const f of paginas("superadmin").filter((f) => !/acceso/.test(f))) expect(leer(f), f).toMatch(/requireSuperadmin\(/);
      expect(leer(path.join(SRC, "app/superadmin/(panel)/layout.tsx"))).toMatch(/requireSuperadmin\(\)/);
      expect(leer(path.join(SRC, "app/superadmin/verificacion/page.tsx"))).toMatch(/permitirSinMfa: true/);
      expect(leer(path.join(SRC, "app/superadmin/cambiar-contrasena/page.tsx"))).toMatch(/permitirCambio: true/);
    });
    it("la página de trabajo de estación exige requireEstacion", () => {
      expect(leer(path.join(SRC, "app/e/[token]/trabajo/page.tsx"))).toMatch(/requireEstacion\(/);
    });
  });
});
