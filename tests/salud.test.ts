import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/salud/route";

describe("/api/salud", () => {
  afterEach(() => {
    delete process.env.APP_VERSION;
  });

  it("responde 200 con la versión por defecto", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "dev" });
  });

  it("devuelve la versión de APP_VERSION", async () => {
    process.env.APP_VERSION = "abc123";
    const res = await GET();
    expect((await res.json()).version).toBe("abc123");
  });
});
