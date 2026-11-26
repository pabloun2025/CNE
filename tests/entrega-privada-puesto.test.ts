import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { atenderEntrega } from "../src/server/entrega-puesto";

it("sirve únicamente las partes cifradas verificadas al destinatario de la entrega", async () => {
  const dir = await mkdtemp(join(tmpdir(), "entrega-puesto-"));
  const hash = (data: string) => createHash("sha256").update(data).digest("hex");
  const subir = "a".repeat(43), bajar = "b".repeat(43);
  const config = { id: "0".repeat(20), vence: Date.now()+60_000, subir: hash(subir), bajar: hash(bajar),
    partes: ["abc", "def"].map(p => ({size: p.length, sha256: hash(p)})) };
  const pedir = (method: string, token: string, body?: string, parte?: string) => atenderEntrega(new Request("https://example.test/api/entrega-puesto", {
    method, headers: {authorization: `Bearer ${token}`, ...(parte === undefined ? {} : {"x-parte": parte})}, body,
  }), config, dir);
  try {
    expect((await pedir("GET", subir)).status).toBe(404);
    expect((await pedir("POST", bajar,"abc","0")).status).toBe(404);
    expect((await pedir("POST", subir,"err","0")).status).toBe(400);
    expect((await pedir("POST", subir,"abc","0")).status).toBe(204);
    expect((await pedir("GET", bajar)).status).toBe(425);
    expect((await pedir("POST", subir,"def","1")).status).toBe(204);
    const respuesta = await pedir("GET", bajar);
    expect(respuesta.headers.get("cache-control")).toMatch(/no-store/);
    expect(await respuesta.text()).toBe("abcdef");
  } finally { await rm(dir,{recursive:true,force:true}); }
});
