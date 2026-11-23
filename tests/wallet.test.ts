import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { correoCredencial, textoCredencial } from "@/domain/mensaje-credencial";
import { mensajeCredencial } from "@/server/envios";
import { asegurarClase, claseId, configWallet, enlaceWallet, leerTokenWallet, objetoWallet, olvidarClaseVerificada, tokenWallet, urlGuardar, type Peticion } from "@/server/wallet/google";
import { GET } from "@/app/w/[token]/route";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// Clave RSA efímera y datos ficticios: ninguna llamada de red.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const ENTORNO = { GOOGLE_WALLET_ISSUER_ID: "3388000000000000001", GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "cuenta-prueba@ejemplo.invalid", GOOGLE_WALLET_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n") };
const SECRETO = "secreto-de-prueba";
const ficha = { id: 7, cedula: "0000000007", apellidos: "APELLIDO PRUEBA 007", nombres: "NOMBRE PRUEBA", cargo: "VOCAL", rotulo: "H01 · VOCAL" };
const config = configWallet(ENTORNO)!;
const cargaUtil = (url: string) => JSON.parse(Buffer.from(url.split("/").pop()!.split(".")[1], "base64url").toString());

describe("Google Wallet · configuración y token", () => {
  it("sin las tres variables no hay configuración ni enlace", () => {
    expect(configWallet({})).toBeNull();
    expect(configWallet({ ...ENTORNO, GOOGLE_WALLET_PRIVATE_KEY: "" })).toBeNull();
    expect(enlaceWallet(7, "madrid.ejemplo.invalid", {}, SECRETO)).toBeNull();
    expect(enlaceWallet(7, "", ENTORNO, SECRETO)).toBeNull();
  });
  it("el token es verificable, no lleva la cédula y rechaza manipulaciones", () => {
    const t = tokenWallet(7, SECRETO);
    expect(t).not.toContain("0000000007");
    expect(leerTokenWallet(t, SECRETO)).toBe(7);
    expect(leerTokenWallet(t, "otro")).toBeNull();
    expect(leerTokenWallet(t.replace(/^7/, "8"), SECRETO)).toBeNull();
    expect(leerTokenWallet("7.corto", SECRETO)).toBeNull();
    expect(enlaceWallet(7, "https://madrid.ejemplo.invalid/", ENTORNO, SECRETO)).toBe(`https://madrid.ejemplo.invalid/w/${t}`);
  });
});

describe("Google Wallet · objeto y enlace firmado", () => {
  it("el objeto lleva título, rótulo, cargo, nombre, cédula y el QR con la cédula; el id no tiene datos personales", () => {
    const o = objetoWallet(config, ficha, SECRETO);
    expect(o.classId).toBe("3388000000000000001.cne_madrid_mjrv_2026_v1");
    expect(o.id).toMatch(/^3388000000000000001\.mjrv_[0-9a-f]{24}$/);
    expect(o.id).not.toContain("0000000007");
    expect(o.id).toBe(objetoWallet(config, ficha, SECRETO).id);
    expect(o.cardTitle.defaultValue.value).toBe("Miembro de Junta Receptora del Voto");
    expect(o.subheader.defaultValue.value).toBe("H01 · VOCAL");
    expect(o.header.defaultValue.value).toBe("APELLIDO PRUEBA 007 NOMBRE PRUEBA");
    expect(o.barcode).toMatchObject({ type: "QR_CODE", value: "0000000007" });
    expect(JSON.stringify(o.textModulesData)).toContain("VOCAL");
  });
  it("el enlace es un JWT RS256 de guardado con la firma válida", () => {
    const url = urlGuardar(config, ficha, SECRETO, { ahora: new Date("2026-11-21T10:00:00Z") });
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const [h, p, f] = url.split("/").pop()!.split(".");
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(f, "base64url"))).toBe(true);
    const c = cargaUtil(url);
    expect(c).toMatchObject({ iss: "cuenta-prueba@ejemplo.invalid", aud: "google", typ: "savetowallet" });
    expect(c.payload.genericObjects).toHaveLength(1);
    expect(c.payload.genericClasses).toBeUndefined();
    expect(cargaUtil(urlGuardar(config, ficha, SECRETO, { claseEnJwt: true })).payload.genericClasses).toEqual([{ id: claseId(config) }]);
  });
});

describe("Google Wallet · clase idempotente (proveedor simulado)", () => {
  beforeEach(olvidarClaseVerificada);
  function falsa(estadoClase: number[]) {
    const llamadas: string[] = [];
    const respuestas = [...estadoClase];
    const peticion: Peticion = async (url, init) => {
      llamadas.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("oauth2")) return Response.json({ access_token: "token-falso" });
      return new Response("{}", { status: respuestas.shift() ?? 200 });
    };
    return { peticion, llamadas };
  }
  it("la crea si no existe, la verifica una vez y no repite llamadas", async () => {
    const f = falsa([404, 200, 200]);
    expect(await asegurarClase(config, f.peticion)).toBe(true);
    expect(f.llamadas.filter((l) => l.startsWith("POST https://walletobjects"))).toHaveLength(1);
    const n = f.llamadas.length;
    expect(await asegurarClase(config, f.peticion)).toBe(true);
    expect(f.llamadas).toHaveLength(n);
  });
  it("si ya existe no la crea; un fallo es silencioso y se reintenta después", async () => {
    const f = falsa([200]);
    expect(await asegurarClase(config, f.peticion)).toBe(true);
    expect(f.llamadas.some((l) => l.startsWith("POST https://walletobjects"))).toBe(false);
    olvidarClaseVerificada();
    expect(await asegurarClase(config, async () => { throw new Error("sin red"); })).toBe(false);
    expect(await asegurarClase(config, f.peticion)).toBe(true);
  });
});

describe("Google Wallet · mensajes", () => {
  const enlace = "https://madrid.ejemplo.invalid/w/7.abc";
  it("el texto y el correo (HTML y texto) llevan el enlace solo si existe", () => {
    expect(textoCredencial({ nombres: "N", rotulo: "H01", wallet: enlace })).toContain(enlace);
    expect(textoCredencial({ nombres: "N", rotulo: "H01" })).not.toContain("Wallet");
    const c = correoCredencial({ nombres: "N", junta: "H1", zona: "amarillo", wallet: enlace });
    expect(c.html).toContain(`href="${enlace}"`);
    expect(c.html).toContain("Guardar en Google Wallet (Android)");
    expect(c.texto).toContain(enlace);
    const sin = correoCredencial({ nombres: "N", junta: "H1", zona: "amarillo" });
    expect(sin.html + sin.texto).not.toContain("Wallet");
  });
});

describe("Google Wallet · ruta pública y mensajes de fichas", () => {
  let id = 0, idPrueba = 0;
  const previo = { ...process.env };
  beforeAll(async () => {
    await reiniciarBase({ correo: "super@prueba.cne", password: "clave-de-prueba-1", modo: "eleccion" });
    const insertar = async (cedula: string, prueba: boolean) => (await consultarDueno<{ id: number }>(
      "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial, es_prueba) SELECT $1,'APELLIDO PRUEBA','NOMBRE PRUEBA','VOCAL','vocal',id,'H01',$2 FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id", [cedula, prueba]))[0].id;
    id = await insertar("0000000101", false);
    idPrueba = await insertar("0000000102", true);
  });
  afterAll(async () => { process.env = previo; await closePools(); });
  const pedir = (token: string) => GET(new Request("http://x/w/" + token), { params: Promise.resolve({ token }) });

  it("sin configuración responde 404", async () => {
    for (const k of Object.keys(ENTORNO)) delete process.env[k];
    expect((await pedir(tokenWallet(id, process.env.APP_MASTER_KEY!))).status).toBe(404);
  });
  it("con configuración redirige a Google para una ficha real y 404 para prueba, baja, revocada o token falso", async () => {
    Object.assign(process.env, ENTORNO);
    // Clase ya verificada: el reintento silencioso no toca la red en la prueba.
    const { asegurarClase: a } = await import("@/server/wallet/google");
    await a(config, async (url) => (url.includes("oauth2") ? Response.json({ access_token: "t" }) : new Response("{}", { status: 200 })));
    const clave = process.env.APP_MASTER_KEY!;
    const r = await pedir(tokenWallet(id, clave));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    expect(r.headers.get("location")).not.toContain("0000000101");
    expect(JSON.stringify(cargaUtil(r.headers.get("location")!))).not.toContain("genericClasses");
    await consultarDueno("UPDATE cne.mjrv SET rotulo_credencial = NULL WHERE id = $1", [id]);
    const sinRotulo = await pedir(tokenWallet(id, clave));
    expect(sinRotulo.status).toBe(302);
    expect(cargaUtil(sinRotulo.headers.get("location")!).payload.genericObjects[0]).toMatchObject({
      subheader: { defaultValue: { value: "M1" } },
      textModulesData: expect.arrayContaining([{ id: "cargo", header: "Cargo", body: "2do. VOCAL PRINCIPAL" }]),
    });
    await consultarDueno("UPDATE cne.mjrv SET incorporado_en = now() WHERE id = $1", [id]);
    expect((await pedir(tokenWallet(id, clave))).status).toBe(404);
    await consultarDueno("UPDATE cne.mjrv SET incorporado_en = NULL WHERE id = $1", [id]);
    expect((await pedir(tokenWallet(idPrueba, clave))).status).toBe(404);
    expect((await pedir(`${id}.${"a".repeat(32)}`)).status).toBe(404);
    await consultarDueno("UPDATE cne.mjrv SET activo = false WHERE id = $1", [id]);
    expect((await pedir(tokenWallet(id, clave))).status).toBe(404);
    await consultarDueno("UPDATE cne.mjrv SET activo = true WHERE id = $1", [id]);
    await consultarDueno("INSERT INTO cne.credenciales_revocadas (mjrv_id, cedula, actor_nombre) VALUES ($1, '0000000101', 'Prueba')", [id]);
    expect((await pedir(tokenWallet(id, clave))).status).toBe(404);
    await consultarDueno("DELETE FROM cne.credenciales_revocadas WHERE mjrv_id = $1", [id]);
  });
  it("el mensaje de una ficha real lleva el enlace y el de una ficha de prueba no", async () => {
    Object.assign(process.env, ENTORNO, { HOST_MADRID: "madrid.ejemplo.invalid" });
    const d = { cedula: "0000000101", apellidos: "A", nombres: "N", cargo: "VOCAL", rotulo: "H01", serie: "H" as const, zona: "amarillo" as const, prueba: false };
    const persona = { id, junta: "H1", zona: "amarillo" as const };
    const real = await mensajeCredencial(d, "whatsapp", persona);
    expect(real.texto).toContain(`https://madrid.ejemplo.invalid/w/${id}.`);
    expect((await mensajeCredencial({ ...d, prueba: true }, "whatsapp", persona)).texto).not.toContain("/w/");
    expect((await mensajeCredencial(d, "correo", persona)).html).toContain("Guardar en Google Wallet (Android)");
  });
});
