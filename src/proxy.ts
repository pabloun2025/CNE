import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cabeceras de seguridad en todas las respuestas. La separación es por rutas, no por host (07-plan-madrid §2).
export function proxy(request: NextRequest) {
  void request;
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
