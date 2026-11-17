// Comprobación de vida sin sesión. Más adelante (T05) hará SELECT 1.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, version: process.env.APP_VERSION || "dev" });
}
