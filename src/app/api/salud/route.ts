import { query } from "@/server/db";

// Comprobación de vida para Docker y el túnel. Sin sesión y sin datos personales.
export const dynamic = "force-dynamic";

export function versionActual(): string {
  return process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || "dev";
}

export async function GET() {
  try {
    await query("SELECT 1");
    return Response.json({ ok: true, version: versionActual(), base: "ok" });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
