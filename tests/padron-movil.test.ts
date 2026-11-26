import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CIERRE_PADRON_MOVIL, crearAlmacenPadronMovil, estadoPadronMovil } from "../src/server/puesto-movil/padron";
import { prepararPadronMovil } from "../scripts/preparar-padron-movil";

const original = { cedula:"0000000001", nombre:"APELLIDO PRUEBA 001", recinto:"Caja Mágica", junta:"M12", zona:"Amarillo" };
const revisar = { cedula:"0000000002", nombre:"APELLIDO PRUEBA 002", recinto:"Toledo", junta:null, zona:null, verificarWeb:true };
let tmp: string;
let dir: string;
beforeEach(() => {
  vi.useFakeTimers({ toFake:["Date", "performance", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(CIERRE_PADRON_MOVIL - 1000);
  tmp = mkdtempSync(join(tmpdir(), "cne-padron-movil-prueba-"));
  dir = join(tmp, "privado");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(tmp,{recursive:true,force:true});
});

it("cifra sin datos de identificación en disco, abre únicamente por cédula exacta y mantiene la revisión del importador", () => {
  expect(prepararPadronMovil([original,revisar],dir)).toBe(2);
  expect(readdirSync(dir).sort()).toEqual(["clave","padron.cne"]);
  expect(readFileSync(join(dir,"clave"))).toHaveLength(32);
  expect(readFileSync(join(dir,"padron.cne")).includes(Buffer.from(original.nombre))).toBe(false);
  if (process.platform !== "win32") expect(statSync(join(dir,"clave")).mode & 0o777).toBe(0o600);
  const almacen = crearAlmacenPadronMovil(dir);
  expect(almacen.estado()).toMatchObject({ abierto:true, disponible:true });
  expect(almacen.consultar(original.cedula)).toEqual({nombre:original.nombre,recinto:original.recinto,junta:original.junta,zona:original.zona,verificarWeb:false});
  expect(almacen.consultar(revisar.cedula)).toMatchObject({ recinto:"Toledo", junta:null, verificarWeb:true });
  expect(almacen.consultar("000000001")).toBeNull();
  expect(almacen.consultar("0000000003")).toBeNull();
  expect(almacen.consultar("0000000001 ")).toBeNull();
  expect(() => prepararPadronMovil([revisar],dir)).toThrow();
});

it("el temporizador retira el índice y ambos archivos al cierre sin una solicitud y conserva los archivos ajenos", () => {
  prepararPadronMovil([original],dir);
  writeFileSync(join(dir,"conservar.txt"),"prueba");
  const almacen = crearAlmacenPadronMovil(dir);
  expect(almacen.estado().disponible).toBe(true);
  vi.advanceTimersByTime(999);
  expect(almacen.consultar(original.cedula)?.nombre).toBe(original.nombre);
  vi.advanceTimersByTime(1);
  expect(readdirSync(dir)).toEqual(["conservar.txt"]);
  expect(almacen.estado()).toMatchObject({abierto:false,disponible:false});
  expect(() => almacen.consultar(original.cedula)).toThrow(expect.objectContaining({code:"PADRON_CERRADO"}));
  vi.setSystemTime(CIERRE_PADRON_MOVIL - 60000);
  expect(almacen.estado().abierto).toBe(false);
});

it("arrancar tras el cierre retira una entrega incompleta y vuelve a intentar errores sin borrar directorios", () => {
  vi.spyOn(console,"warn").mockImplementation(()=>{});
  prepararPadronMovil([original],dir);
  unlinkSync(join(dir,"clave"));
  mkdirSync(join(dir,"clave"));
  vi.setSystemTime(CIERRE_PADRON_MOVIL);
  const almacen=crearAlmacenPadronMovil(dir);
  expect(almacen.estado().abierto).toBe(false);
  expect(existsSync(join(dir,"padron.cne"))).toBe(false);
  expect(statSync(join(dir,"clave")).isDirectory()).toBe(true);
  renameSync(join(dir,"clave"),join(dir,"conservar"));
  writeFileSync(join(dir,"clave"),Buffer.alloc(32));
  vi.advanceTimersByTime(15000);
  expect(readdirSync(dir)).toEqual(["conservar"]);
});

it("rechaza un archivo alterado, sin interpretar contenido ni convertirlo en ausencia", () => {
  vi.spyOn(console,"warn").mockImplementation(()=>{});
  prepararPadronMovil([original],dir);
  const archivo = join(dir,"padron.cne"), bytes = readFileSync(archivo);
  bytes[bytes.length-1] ^= 1;
  writeFileSync(archivo,bytes);
  const almacen=crearAlmacenPadronMovil(dir);
  expect(almacen.estado()).toMatchObject({abierto:true,disponible:false});
  expect(()=>almacen.consultar(original.cedula)).toThrow(expect.objectContaining({code:"PADRON_NO_DISPONIBLE"}));
});

it.skipIf(process.platform === "win32")("un enlace a otro directorio nunca abre ni retira sus archivos", () => {
  vi.spyOn(console,"warn").mockImplementation(()=>{});
  prepararPadronMovil([original],dir);
  const enlace=join(tmp,"enlace");
  symlinkSync(dir,enlace,"dir");
  const almacen=crearAlmacenPadronMovil(enlace);
  expect(almacen.estado().disponible).toBe(false);
  vi.advanceTimersByTime(1000);
  expect(readdirSync(dir).sort()).toEqual(["clave","padron.cne"]);
});

it("sin directorio configurado el estado es indisponible y no programa tareas", () => {
  vi.stubEnv("CNE_MOVIL_PADRON_DIR","");
  expect(estadoPadronMovil()).toEqual({abierto:true,disponible:false,servidorMs:Date.now(),cierreMs:CIERRE_PADRON_MOVIL});
  expect(vi.getTimerCount()).toBe(0);
});
