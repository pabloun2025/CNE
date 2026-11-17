import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/salud/route";
import { closePools } from "@/server/db";
import { asegurarRolApp } from "./helpers/db";

describe("/api/salud", () => {
  const urlOriginal = process.env.DATABASE_URL;

  beforeAll(asegurarRolApp);
  afterEach(async () => {
    delete process.env.APP_VERSION;
    delete process.env.RENDER_GIT_COMMIT;
    process.env.DATABASE_URL = urlOriginal;
    await closePools();
  });
  afterAll(closePools);

  it("responde 200 con base ok y versión «dev» por defecto", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "dev", base: "ok" });
  });

  it("devuelve la versión de APP_VERSION", async () => {
    process.env.APP_VERSION = "abc123";
    expect((await (await GET()).json()).version).toBe("abc123");
  });

  it("si falta APP_VERSION usa RENDER_GIT_COMMIT", async () => {
    process.env.RENDER_GIT_COMMIT = "render9";
    expect((await (await GET()).json()).version).toBe("render9");
  });

  it("responde 503 sin datos cuando la base no contesta", async () => {
    const url = new URL(urlOriginal!);
    url.port = "1";
    process.env.DATABASE_URL = url.toString();
    await closePools();
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
