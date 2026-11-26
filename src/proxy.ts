import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cabeceras de seguridad en todas las respuestas. La separación es por rutas, no por host (07-plan-madrid §2).
export function proxy(request: NextRequest) {
  const esPuesto = request.headers.get("host")?.toLowerCase() === "cne.consulado.app";
  const url = request.nextUrl.clone();
  if (esPuesto && url.pathname === "/") url.pathname = "/puesto-movil";
  const response = esPuesto && request.nextUrl.pathname === "/" ? NextResponse.rewrite(url) : NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
