import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, parse, resolve } from "node:path";
import { descifrar, type Elector } from "./formato";

export type { Elector } from "./formato";
export const CIERRE_PADRON_MOVIL = Date.parse("2026-11-29T18:00:00Z");
const REINTENTO = 15_000;
const TAMANO_MAXIMO = 64 * 1024 * 1024;

function errorPadron(cerrado: boolean) {
  return Object.assign(new Error(cerrado ? "La consulta del padrón ha cerrado." : "El padrón móvil no está disponible."), {
    code: cerrado ? "PADRON_CERRADO" : "PADRON_NO_DISPONIBLE",
  });
}

function carpetaPrivada(carpeta: string) {
  if (!isAbsolute(carpeta)) throw Error("Use una carpeta privada absoluta.");
  const dir = resolve(carpeta);
  if ([parse(dir).root, homedir(), tmpdir(), process.cwd()].includes(dir) || realpathSync.native(dir) !== dir) throw Error("Carpeta privada no válida.");
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw Error("Revise los permisos de la carpeta privada.");
  return dir;
}

function leerPrivado(dir: string, nombre: string, max: number) {
  const file = join(/* turbopackIgnore: true */ dir, nombre);
  if (!lstatSync(file).isFile()) throw Error("Archivo privado no válido.");
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > max || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw Error("Archivo privado no válido.");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

function retirarArchivos(carpeta: string) {
  const dir = carpetaPrivada(carpeta);
  // En Linux el descriptor fija el directorio aunque se sustituya su ruta durante la retirada.
  const fd = process.platform === "linux" ? openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW) : undefined;
  try {
    const base = fd === undefined ? dir : `/proc/self/fd/${fd}`;
    if (fd !== undefined && realpathSync.native(/* turbopackIgnore: true */ base) !== dir) throw Error("La carpeta privada ha cambiado.");
    let fallo = false;
    for (const nombre of ["clave", "padron.cne"]) {
      try {
        const ruta = join(/* turbopackIgnore: true */ base, nombre);
        const stat = lstatSync(ruta);
        if (stat.isFile() || stat.isSymbolicLink()) unlinkSync(ruta);
        else fallo = true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") fallo = true;
      }
    }
    if (fallo) throw Error("Retirada incompleta del padrón móvil.");
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function crearAlmacenPadronMovil(carpeta: string) {
  let indice: Map<string, Elector> | undefined;
  const inicioCivil = Date.now(), inicioMonotono = performance.now();
  let ultimaHora = inicioCivil;
  let proximaCarga = 0, proximaRetirada = 0;
  let aviso = "";
  let timer: NodeJS.Timeout | undefined;

  function reloj() {
    ultimaHora = Math.max(ultimaHora, Date.now(), inicioCivil + Math.floor(performance.now() - inicioMonotono));
    return ultimaHora;
  }
  function informar(mensaje: string) {
    if (aviso !== mensaje) console.warn(mensaje);
    aviso = mensaje;
  }
  function estado() {
    let servidorMs = reloj();
    if (servidorMs < CIERRE_PADRON_MOVIL && !indice && servidorMs >= proximaCarga) {
      proximaCarga = servidorMs + REINTENTO;
      try {
        const dir = carpetaPrivada(carpeta);
        const clave = leerPrivado(dir, "clave", 32);
        try { indice = descifrar(leerPrivado(dir, "padron.cne", TAMANO_MAXIMO), clave); }
        finally { clave.fill(0); }
        aviso = "";
      } catch { informar("No se pudo abrir el padrón móvil. Compruebe los dos archivos y sus permisos."); }
      servidorMs = reloj();
    }
    const abierto = servidorMs < CIERRE_PADRON_MOVIL;
    if (!abierto) {
      indice?.clear();
      indice = undefined;
      if (servidorMs >= proximaRetirada) {
        proximaRetirada = servidorMs + REINTENTO;
        try { retirarArchivos(carpeta); aviso = ""; }
        catch { informar("Revise la retirada de los archivos privados del padrón móvil. Se volverá a intentar."); }
      }
    }
    if (!timer) {
      const demora = abierto ? Math.min(REINTENTO, CIERRE_PADRON_MOVIL - servidorMs) : REINTENTO;
      timer = setTimeout(() => { timer = undefined; estado(); }, demora);
      timer.unref();
    }
    return { abierto, cierreMs: CIERRE_PADRON_MOVIL, servidorMs, disponible: Boolean(indice) };
  }

  function consultar(cedula: string): Elector | null {
    const e = estado();
    if (!e.abierto || !indice) throw errorPadron(!e.abierto);
    if (typeof cedula !== "string" || !/^\d{10}$/.test(cedula)) return null;
    const elector = indice.get(cedula) ?? null;
    if (!estado().abierto) throw errorPadron(true);
    return elector;
  }
  return { estado, consultar };
}

// Next puede cargar instrumentación y rutas desde bundles distintos en un mismo proceso.
const proceso = globalThis as typeof globalThis & { __cnePadronMovil2026?: ReturnType<typeof crearAlmacenPadronMovil> };
function activo() {
  const carpeta = process.env.CNE_MOVIL_PADRON_DIR;
  if (!carpeta) return;
  return proceso.__cnePadronMovil2026 ??= crearAlmacenPadronMovil(carpeta);
}

export function estadoPadronMovil() {
  const servidorMs = Date.now();
  return activo()?.estado() ?? { abierto: servidorMs < CIERRE_PADRON_MOVIL, cierreMs: CIERRE_PADRON_MOVIL, servidorMs, disponible: false };
}

export function consultarPadronMovil(cedula: string): Elector | null {
  const almacen = activo();
  if (!almacen) throw errorPadron(Date.now() >= CIERRE_PADRON_MOVIL);
  return almacen.consultar(cedula);
}
