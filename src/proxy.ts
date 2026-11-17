import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Provisional (T01): solo cabeceras. La separación por host llega en T06.
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
