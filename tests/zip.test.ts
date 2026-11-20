import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearZip } from "@/server/zip";

describe("descarga ZIP", () => {
  it("conserva los archivos y bytes de cada documento", async () => {
    const encoder = new TextEncoder();
    const descargar = crearZip([
      { nombre: "credencial-1.pdf", bytes: async () => encoder.encode("%PDF-1.7\nFICHA PRUEBA 1") },
      { nombre: "credencial-2.pdf", bytes: encoder.encode("%PDF-1.7\nFICHA PRUEBA 2") },
    ]);
    const carpeta = mkdtempSync(join(tmpdir(), "cne-zip-"));
    const ruta = join(carpeta, "credenciales.zip");
    try {
      writeFileSync(ruta, Buffer.from(await new Response(descargar).arrayBuffer()));
      const unzip = (opcion: string, ...ficheros: string[]) => execFileSync("unzip", [opcion, ruta, ...ficheros], { encoding: "utf8" });
      expect(unzip("-Z1").trim().split("\n")).toEqual(["credencial-1.pdf", "credencial-2.pdf"]);
      expect(unzip("-p", "credencial-1.pdf")).toBe("%PDF-1.7\nFICHA PRUEBA 1");
      expect(unzip("-p", "credencial-2.pdf")).toBe("%PDF-1.7\nFICHA PRUEBA 2");
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
