import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { login } from "@/server/auth";
import { closePools } from "@/server/db";
import { crearEnlace, crearOperador, identificarEstacion } from "@/server/estaciones";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// M25 · Matriz de permisos (§16.1, §2): cada ruta API y cada acción de servidor frente a cada tipo de sesión.
// Descubre los archivos solos: una ruta o acción nueva sin regla en la matriz hace fallar la prueba.

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: (n: string, v: string) => void jar.set(n, v), delete: (n: string) => void jar.delete(n) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

// «admin» es la cuenta con rol consul; admin_coord y admin_fin, las de rol coordinador y financiero (C2).
type Tipo = "ninguna" | "admin" | "admin_coord" | "admin_fin" | "admin_docs" | "admin_mesas" | "superadmin" | "e_puerta" | "e_documentacion" | "e_finanzas" | "e_mando" | "e_mesas" | "e_validacion_documental";
const TIPOS: Tipo[] = ["ninguna", "admin", "admin_coord", "admin_fin", "admin_docs", "admin_mesas", "superadmin", "e_puerta", "e_documentacion", "e_finanzas", "e_mando", "e_mesas", "e_validacion_documental"];
type Regla = Tipo[] | "publica";
const SOLO_ADMIN: Regla = ["admin"];
const SOLO_SUPER: Regla = ["superadmin"];
const MANDO: Regla = ["admin", "admin_coord", "e_mando"];
const FINANZAS: Regla = ["admin", "admin_fin"];
const DOCUMENTACION: Tipo[] = ["admin", "admin_fin", "admin_docs"];
const CAPTURA: Regla = [...DOCUMENTACION, "admin_mesas"];

// ─── Rutas API: «METODO /url» ───
const RUTAS: Record<string, Regla> = {
  "GET /admin/credenciales/envios/descargar": SOLO_ADMIN,
  "GET /admin/informes/descargar": FINANZAS,
  "GET /admin/documentos/cartel": ["admin", "superadmin"],
  "GET /admin/operadores/guias/[n]": SOLO_ADMIN, // lleva los enlaces de estación activos
  "GET /admin/credenciales/pdf": SOLO_ADMIN,
  "POST /admin/credenciales/pdf": SOLO_ADMIN,
  "GET /api/admin/documentos/[id]/[lado]": SOLO_ADMIN,
  "GET /api/admin/resumen": FINANZAS,
  "GET /api/admin/finanzas/resumen": FINANZAS,
  "GET /api/admin/finanzas/escaneados": FINANZAS,
  "GET /api/admin/finanzas/recibos/[tipo]/[id]": FINANZAS,
  "POST /api/admin/finanzas/recibos/descargar": FINANZAS,
  "POST /api/admin/finanzas/recibos/contingencia": FINANZAS,
  "POST /api/admin/finanzas/recibos/emitir": FINANZAS,
  "GET /api/admin/finanzas/cedula/[id]/[lado]": CAPTURA,
  "POST /api/admin/finanzas/ficha": FINANZAS,
  "POST /api/admin/finanzas/confirmar": FINANZAS,
  "POST /api/admin/finanzas/nombres": FINANZAS,
  "POST /api/admin/finanzas/validar-cedula": DOCUMENTACION,
  "POST /api/admin/documentacion/buscar": CAPTURA,
  "POST /api/admin/verificacion-mesas": ["admin", "admin_mesas"],
  "POST /api/admin/finanzas/acta/[mjrvId]": FINANZAS,
  "POST /api/admin/finanzas/foto": CAPTURA,
  "DELETE /api/admin/finanzas/foto": CAPTURA,
  "GET /api/mando/junta": MANDO,
  "GET /api/mando/propuesta": MANDO,
  "GET /api/mando/estado": MANDO,
  "GET /api/e/puerta": ["e_puerta"],
  "POST /api/e/puerta": ["e_puerta"],
  "POST /api/e/puerta/pase": ["e_puerta"],
  "POST /api/e/puerta/texto": ["e_puerta"],
  "POST /api/e/documentacion/foto": ["e_documentacion"],
  "POST /api/e/documentacion/buscar": ["e_documentacion"],
  "POST /api/e/finanzas/escanear": ["e_finanzas"],
  "POST /api/e/mesas": ["e_mesas"],
  "POST /api/e/documentacion/puesto": ["e_mesas", "e_validacion_documental"],
  "GET /api/e/documentacion/puesto": ["e_validacion_documental", "e_mesas"],
  "GET /superadmin/respaldo/[archivo]": SOLO_SUPER,
  "GET /api/superadmin/whatsapp/estado": SOLO_SUPER,
  "GET /api/salud": "publica",
  "GET /api/recuento-electoral": "publica", // cifras agregadas y números de equipo
  "GET /api/puesto-movil/[operacion]": "publica", // solo disponibilidad y cierre
  "POST /api/puesto-movil/[operacion]": [], // credencial de enlace propia, independiente de las sesiones de CNE
  "GET /w/[token]": "publica", // enlace firmado por ficha; solo fichas reales activas (Google Wallet)
  "GET /s/[token]": "publica", // token cifrado por ficha, con caducidad y validación de revocación
  "POST /api/webhooks/evolution": [], // requiere la credencial de la línea de Evolution
  "POST /api/webhooks/smspubli": [], // valida una firma limitada al envío de SMS
  "POST /api/webhooks/brevo": [], // autentica el token de Brevo, no una sesión de CNE
  "POST /api/d/foto": "publica", // la ruta valida el archivo y limita peticiones por IP
  "POST /api/d/buscar": "publica",
  "GET /d/guia": "publica",
};

// ─── Acciones de servidor: «archivo#nombre» ───
const ACCIONES: Record<string, Regla> = {
  "acceso-actions#accederAdmin": "publica", "acceso-actions#accederSuperadmin": "publica",
  "acceso-actions#cambiarContrasenaAdmin": "publica", "acceso-actions#cambiarContrasenaSuperadmin": "publica", // validan su propia cookie y la contraseña actual
  "acceso-actions#salirAdmin": "publica", "acceso-actions#salirSuperadmin": "publica",
  "estacion-actions#entrarEstacionAccion": "publica", "estacion-actions#cambiarOperadorAccion": "publica", // acceso a Mando por PIN
  "estacion-actions#crearOperadorAccion": SOLO_SUPER, "estacion-actions#restablecerPinAccion": SOLO_SUPER, "estacion-actions#activarOperadorAccion": SOLO_SUPER,
  "estacion-actions#crearEnlaceAccion": SOLO_SUPER, "estacion-actions#revocarEnlaceAccion": SOLO_SUPER,
  "importar-actions#revisarImportacion": SOLO_ADMIN, "importar-actions#aplicarImportacionAccion": SOLO_ADMIN,
  "mjrv-actions#crearMjrvAccion": SOLO_ADMIN, "mjrv-actions#editarMjrvAccion": SOLO_ADMIN, "mjrv-actions#bajaMjrvAccion": SOLO_ADMIN, "mjrv-actions#borrarMjrvAccion": SOLO_ADMIN,
  "mjrv-actions#borrarMjrvSeleccionAccion": SOLO_ADMIN,
  "revocar-actions#revocarCredencialAccion": SOLO_ADMIN, "revocar-actions#revocarFueraAccion": SOLO_ADMIN,
  "pago-actions#guardarParametrosAccion": SOLO_SUPER,
  "credencial-config-actions#guardarMedidasCredencialAccion": SOLO_SUPER,
  "finanzas-nombres-actions#corregirNombresAccion": FINANZAS, "finanzas-nombres-actions#validarCedulaAccion": FINANZAS,
  "finanzas-nombres-actions#desvalidarCedulaAccion": FINANZAS,
  "envios-actions#controlarColaWhatsAppAccion": SOLO_ADMIN, "envios-actions#enviarCredencialAccion": SOLO_ADMIN, "envios-actions#enviarLoteAccion": SOLO_ADMIN,
  "sms-actions#enviarSmsAccion": SOLO_ADMIN,
  "movimiento-actions#aceptarAccion": MANDO, "movimiento-actions#pasarAccion": MANDO, "movimiento-actions#noViableAccion": MANDO,
  "movimiento-actions#incorporarVotanteAccion": MANDO, "movimiento-actions#asignarCargoAccion": MANDO, "movimiento-actions#quitarCargoAccion": MANDO,
  "movimiento-actions#moverManualAccion": MANDO, "movimiento-actions#excepcionAccion": MANDO, "movimiento-actions#rehabilitarAccion": MANDO,
  "superadmin-actions#crearAdminAccion": SOLO_SUPER, "superadmin-actions#cambiarRolAccion": SOLO_SUPER, "superadmin-actions#restablecerAdminAccion": SOLO_SUPER, "superadmin-actions#activarAdminAccion": SOLO_SUPER,
  "superadmin-actions#cambiarModoAccion": SOLO_SUPER, "superadmin-actions#cargarDemoAccion": SOLO_SUPER, "superadmin-actions#quitarDemoAccion": SOLO_SUPER,
  "superadmin-actions#respaldarAccion": SOLO_SUPER, "superadmin-actions#prepararEleccionAccion": SOLO_SUPER,
  "superadmin-actions#reiniciarOperativoAccion": SOLO_SUPER,
  "superadmin-actions#activarBandejaWhatsAppAccion": SOLO_SUPER,
  "superadmin-actions#interruptorEnvioAccion": SOLO_SUPER, "superadmin-actions#reanudarEnviosAccion": SOLO_SUPER, "superadmin-actions#guardarRemitenteAccion": SOLO_SUPER,
  "superadmin-actions#borrarFotosAccion": SOLO_SUPER,
  "superadmin-actions#crearLineaAccion": SOLO_SUPER, "superadmin-actions#desvincularLineaAccion": SOLO_SUPER,
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
const enlacesDirectos: Partial<Record<Tipo, string>> = {};
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
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar, rol) SELECT 'madrid_admin','coord@prueba.cne','Coordinador Prueba', password_hash, false, 'coordinador' FROM cne.usuarios WHERE tipo = 'superadmin'");
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar, rol) SELECT 'madrid_admin','fin@prueba.cne','Financiero Prueba', password_hash, false, 'financiero' FROM cne.usuarios WHERE tipo = 'superadmin'");
    const { crearAdmin } = await import("@/server/superadmin");
    const superId = (await consultarDueno<{ id: number }>("SELECT id FROM cne.usuarios WHERE tipo = 'superadmin'"))[0].id;
    const creada = await crearAdmin({
      sesionId: "x", usuarioId: superId, correo: "super@prueba.cne", nombre: "Superadmin Prueba",
      tipo: "superadmin", rol: "consul", debeCambiar: false,
    }, "documentacion-prueba", "Documentación Prueba", "validador", "clave-super-1", "clave-super-1");
    expect(creada).toEqual({ ok: true });
    const mesas = await crearAdmin({
      sesionId: "x", usuarioId: superId, correo: "super@prueba.cne", nombre: "Superadmin Prueba",
      tipo: "superadmin", rol: "consul", debeCambiar: false,
    }, "mesa-prueba", "Mesa Prueba", "verificador_mesas", "clave-super-1", "clave-super-1");
    expect(mesas).toEqual({ ok: true });
    const entrar = async (correo: string, portal: "admin" | "superadmin") => {
      const r = await login({ correo, password: "clave-super-1", portal, ip: "10.9.9.9", agente: "prueba" });
      if (!r.ok) throw new Error("login");
      return r.token;
    };
    sesionesHechas.ninguna = {};
    sesionesHechas.admin = { cne_admin: await entrar("admin@prueba.cne", "admin") };
    sesionesHechas.admin_coord = { cne_admin: await entrar("coord@prueba.cne", "admin") };
    sesionesHechas.admin_fin = { cne_admin: await entrar("fin@prueba.cne", "admin") };
    sesionesHechas.admin_docs = { cne_admin: await entrar("documentacion-prueba", "admin") };
    sesionesHechas.admin_mesas = { cne_admin: await entrar("mesa-prueba", "admin") };
    sesionesHechas.superadmin = { cne_super: await entrar("super@prueba.cne", "superadmin") };
    const admin = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", rol: "consul" as const, debeCambiar: false };
    for (const f of ["puerta", "documentacion", "finanzas", "mando", "mesas", "validacion_documental"] as const) {
      const e = await crearEnlace(admin, f, `${f} prueba`);
      if (!e.ok) throw new Error("estación");
      if (f !== "mando") {
        enlacesDirectos[`e_${f}`] = e.token;
        continue;
      }
      const o = await crearOperador(admin, `Operador ${f}`, "Prueba", [f], "1234");
      if (!o.ok) throw new Error("operador");
      const s = await identificarEstacion(e.token, o.id, "1234", "prueba");
      if (!s.ok) throw new Error("PIN");
      sesionesHechas[`e_${f}` as Tipo] = { cne_estacion: s.sesionToken };
    }
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

  it("envía al coordinador directamente a Mando desde /admin", async () => {
    ponerSesion("admin_coord");
    const { default: AdminInicio } = await import("@/app/admin/(panel)/page");
    await expect(AdminInicio()).rejects.toThrow("REDIRECT:/admin/mando");
  });

  it("el validador marca la ficha sin emitir un recibo y detecta una foto sustituida", async () => {
    ponerSesion("admin_docs");
    const { POST: buscar } = await import("@/app/api/admin/documentacion/buscar/route");
    const { POST: validar } = await import("@/app/api/admin/finanzas/validar-cedula/route");
    const post = (ruta: string, datos: unknown) => new Request(`http://localhost${ruta}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(datos),
    });
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
      SELECT '0000000042', 'PRUEBA', 'PERSONA', 'VOCAL', 'vocal', id FROM cne.juntas_madrid WHERE serie='H' AND numero=12`);
    const ficha = async () => (await buscar(post("/api/admin/documentacion/buscar", { cedula: "0000000042" }))).json();
    const previa = await ficha();
    await consultarDueno(`INSERT INTO cne.documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256, origen, es_prueba)
      VALUES ($1, 'pasaporte', decode('00','hex'), decode('00','hex'), 30000, 10, 10, decode(md5('pasaporte-prueba'),'hex'), 'estacion', true)`, [previa.mjrvId]);
    const abierta = await ficha();
    expect(abierta).toMatchObject({ pasaporte: true, completos: true, validada: false, modo: "prueba" });
    await consultarDueno("UPDATE cne.documentos_mjrv SET creado_en = clock_timestamp() WHERE mjrv_id = $1", [abierta.mjrvId]);
    const envio = (version: string) => validar(post("/api/admin/finanzas/validar-cedula", { mjrvId: abierta.mjrvId, modo: abierta.modo, version }));
    expect(await (await envio(abierta.version)).json()).toMatchObject({ ok: false, mensaje: expect.stringContaining("cambiaron") });
    expect(await (await envio((await ficha()).version)).json()).toEqual({ ok: true });
    expect((await ficha()).validada).toBe(true);
    expect(await consultarDueno("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [abierta.mjrvId])).toEqual([]);
    expect(await consultarDueno("SELECT id FROM cne.pendientes_impresion WHERE mjrv_id = $1", [abierta.mjrvId])).toEqual([]);
    expect(await consultarDueno("SELECT mjrv_id FROM cne.pagos_confirmados WHERE mjrv_id = $1", [abierta.mjrvId])).toEqual([]);
  });

  describe("rutas API", () => {
    const PARAMS = { n: "1", id: "1", tipo: "acta", lado: "anverso", mjrvId: "1", archivo: "cne-prep-20260101T000000Z.dump" };
    async function llamar(r: (typeof rutasDescubiertas)[number], token?: string): Promise<number> {
      const modulo = await import(/* @vite-ignore */ r.archivo);
      const url = `http://localhost${urlDe(r.archivo)}`;
      let init: RequestInit = { method: r.metodo };
      if (r.metodo === "POST") init = { method: "POST", ...(r.archivo.includes("foto") ? { body: new FormData() } : { body: "{}", headers: { "content-type": "application/json" } }) };
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      try {
        const operacion = r.metodo === "GET" ? "estado" : "consulta";
        return (await modulo[r.metodo](new Request(url, { ...init, headers }), { params: Promise.resolve({ ...PARAMS, operacion }) })).status;
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
          const status = await llamar(r, enlacesDirectos[tipo]);
          if (permitido) expect([401, 403]).not.toContain(status);
          else expect([401, 403]).toContain(status);
        });
      }
    }
    it("el formulario de contingencia con Origin nulo solo se admite desde el mismo origen", async () => {
      ponerSesion("admin_fin");
      const { POST } = await import("@/app/api/admin/finanzas/recibos/emitir/route");
      const enviar = (sitio: string) => POST(new Request("http://localhost/api/admin/finanzas/recibos/emitir", {
        method: "POST", headers: { origin: "null", "sec-fetch-site": sitio }, body: new URLSearchParams(),
      }));
      expect((await enviar("same-origin")).status).toBe(400); // Llegó a la validación de fichas.
      expect((await enviar("cross-site")).status).toBe(403);
    });

  });

  it("el enlace de mesa puede capturar, pero no validar y caduca", async () => {
    ponerSesion("ninguna");
    const { POST } = await import("@/app/api/e/documentacion/puesto/route");
    const { POST: mesas } = await import("@/app/api/e/mesas/route");
    const post = (token: string, data: object) => new Request("http://localhost/api/e/documentacion/puesto", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(data),
    });
    const tokenMesa = enlacesDirectos.e_mesas!;
    const tokenValidacion = enlacesDirectos.e_validacion_documental!;
    expect((await POST(post(tokenMesa, { accion: "validar" }))).status).toBe(403);
    expect((await POST(post(tokenValidacion, { accion: "validar" }))).status).toBe(400);
    expect((await mesas(post(tokenValidacion, { accion: "consultar" }))).status).toBe(403);
    expect((await mesas(post(tokenValidacion, { accion: "panorama" }))).status).toBe(403);
    expect((await mesas(post(tokenValidacion, { accion: "ausencia", juntaId: 1 }))).status).toBe(403);
    const panorama = await mesas(post(tokenMesa, { accion: "panorama" }));
    expect(panorama.status).toBe(200);
    expect(panorama.headers.get("cache-control")).toBe("private, no-store");
    expect(await panorama.json()).toHaveLength(95);
    await consultarDueno("UPDATE cne.enlaces_estacion SET expira_en = now() - interval '1 second' WHERE funcion = 'mesas'");
    expect((await mesas(post(tokenMesa, { accion: "consultar" }))).status).toBe(401);
    await consultarDueno("UPDATE cne.enlaces_estacion SET expira_en = NULL WHERE funcion = 'mesas'");
  });

  it("el puesto de mesa solo previsualiza fotos vigentes de la junta seleccionada", async () => {
    ponerSesion("ninguna");
    const { GET, POST } = await import("@/app/api/e/documentacion/puesto/route");
    const { encryptBuffer } = await import("@/server/crypto");
    const [{ id: junta }, { id: otraJunta }] = await consultarDueno<{ id: number }>(
      "SELECT id::int FROM cne.juntas_madrid WHERE serie='H' ORDER BY numero LIMIT 2",
    );
    const cedula = "0000000187";
    const [{ id }] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
       VALUES ($1, 'APELLIDO DE PRUEBA', 'NOMBRE DE PRUEBA', 'VOCAL', 'vocal', $2) RETURNING id::int`, [cedula, junta],
    );
    const foto = Buffer.from("Solo bytes de prueba");
    const { ciphertext, nonce } = encryptBuffer(foto);
    await consultarDueno(
      `INSERT INTO cne.documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, sha256, bytes, ancho, alto, origen)
       VALUES ($1, 'pasaporte', $2, $3, decode('00','hex'), 30000, 500, 400, 'publico')`,
      [id, ciphertext, nonce],
    );
    const base = "http://localhost/api/e/documentacion/puesto";
    const headers = { authorization: `Bearer ${enlacesDirectos.e_mesas!}`, "content-type": "application/json" };
    const consulta = await POST(new Request(base, { method: "POST", headers, body: JSON.stringify({ accion: "buscar", cedula, juntaId: junta }) }));
    const { version } = await consulta.json() as { version: string };
    const ver = (juntaId: number, v = version) => GET(new Request(
      `${base}?id=${id}&lado=pasaporte&modo=prueba&version=${v}&juntaId=${juntaId}`, { headers },
    ));
    const imagen = await ver(junta);
    expect(imagen.status).toBe(200);
    expect(imagen.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await imagen.arrayBuffer())).toEqual(foto);
    expect((await ver(otraJunta)).status).toBe(404);
    expect((await ver(junta, "a".repeat(64))).status).toBe(404);
  });

  describe("acciones de servidor", () => {
    // Denegada = redirección al acceso/verificación, «Solo la …» o «su sesión ya no es válida».
    const DENEGADA = /^REDIRECT:\/(admin\/(acceso|cambiar-contrasena|mando|finanzas|validacion-documental|verificacion-mesas)|superadmin\/(acceso|cambiar-contrasena))$|^Solo la /;
    async function denegada(a: (typeof accionesDescubiertas)[number]): Promise<boolean> {
      const fn = (await import(/* @vite-ignore */ a.archivo))[a.nombre] as (...args: unknown[]) => Promise<unknown>;
      const f = new FormData();
      const args = fn.length >= 2 ? [null, f] : fn.length === 1 ? [f] : [];
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
    // Roles que puede usar cada página de /admin (sin entrada aquí, la prueba falla) y a dónde redirige a los demás.
    const ROLES_PAGINA: Record<string, string[]> = {
      "": ["consul", "financiero"],
      "validacion-documental": ["consul", "financiero", "validador"],
      "verificacion-mesas": ["consul", "verificador_mesas"],
      mando: ["consul", "coordinador"], finanzas: ["consul", "financiero"], "finanzas/pagar": ["consul", "financiero"], "finanzas/documentos": ["consul", "financiero"], "finanzas/caja": ["consul", "financiero"], "finanzas/recibos": ["consul", "financiero"], "finanzas/recibos/emitir": ["consul", "financiero"], informes: ["consul", "financiero"],
      credenciales: ["consul"], "credenciales/envios": ["consul"], "credenciales/sms": ["consul"], "credenciales/whatsapp": ["consul"], "credenciales/whatsapp/bandeja": ["consul"], "credenciales/imprimir": ["consul"], revocar: ["consul"], documentos: ["consul"], operadores: ["consul"], "operadores/guias": ["consul"], mjrv: ["consul"], "mjrv/importar": ["consul"], "mjrv/nueva": ["consul"], "mjrv/[id]": ["consul"],
    };
    const NOMBRE_CONJUNTO: Record<string, string> = { "consul,coordinador,financiero,validador,verificador_mesas": "TODOS_LOS_ROLES", "consul,verificador_mesas": "MESAS_ADMIN", "consul,financiero,validador": "DOCUMENTACION_ADMIN", "consul,coordinador": "CONSUL_Y_COORDINADOR", "consul,financiero": "CONSUL_Y_FINANCIERO", consul: "SOLO_CONSUL" };
    const clavePagina = (f: string) => path.relative(path.join(SRC, "app/admin/(panel)"), path.dirname(f)).split(path.sep).join("/");
    it("cada página de /admin con menú declara sus roles y coinciden con la matriz", () => {
      const delPanel = paginas("admin").filter((f) => f.includes(`${path.sep}(panel)${path.sep}`));
      expect(delPanel.map(clavePagina).sort()).toEqual(Object.keys(ROLES_PAGINA).sort());
      for (const f of delPanel) expect(leer(f), f).toContain(`roles: ${NOMBRE_CONJUNTO[ROLES_PAGINA[clavePagina(f)].join(",")]} }`);
    });
    for (const rol of ["consul", "coordinador", "financiero", "validador", "verificador_mesas"]) {
      it(`el rol ${rol} entra solo a sus pantallas; el resto lo redirige a la suya`, async () => {
        ponerSesion(rol === "consul" ? "admin" : rol === "coordinador" ? "admin_coord" : rol === "financiero" ? "admin_fin" : rol === "validador" ? "admin_docs" : "admin_mesas");
        const inicio = { consul: "/admin", coordinador: "/admin/mando", financiero: "/admin/finanzas", validador: "/admin/validacion-documental", verificador_mesas: "/admin/verificacion-mesas" }[rol];
        for (const f of paginas("admin").filter((f) => f.includes(`${path.sep}(panel)${path.sep}`))) {
          const permitido = ROLES_PAGINA[clavePagina(f)].includes(rol);
          const pagina = (await import(/* @vite-ignore */ f)).default as (p: unknown) => Promise<unknown>;
          let redirigida: string | null = null;
          try { await pagina({ params: Promise.resolve({ id: "1" }), searchParams: Promise.resolve({}) }); } catch (e) { const m = /^REDIRECT:(.*)$/.exec((e as Error).message); if (m) redirigida = m[1]; }
          expect(redirigida, `${rol} en /admin/${clavePagina(f)}`).toBe(permitido ? null : inicio);
        }
      });
    }
    it("cada página de /superadmin llama a requireSuperadmin", () => {
      for (const f of paginas("superadmin").filter((f) => !/acceso/.test(f))) expect(leer(f), f).toMatch(/requireSuperadmin\(/);
      expect(leer(path.join(SRC, "app/superadmin/(panel)/layout.tsx"))).toMatch(/requireSuperadmin\(\)/);
      expect(leer(path.join(SRC, "app/superadmin/cambiar-contrasena/page.tsx"))).toMatch(/permitirCambio: true/);
    });
    it("la página de trabajo de estación exige requireEstacion", () => {
      expect(leer(path.join(SRC, "app/e/[token]/trabajo/page.tsx"))).toMatch(/requireEstacion\(/);
    });
  });
});
