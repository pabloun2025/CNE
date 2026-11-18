"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, requireSuperadmin } from "./guard";
import { comenzarMfa, completarMfa, usarCodigoRecuperacion, verificarMfa, type MfaResultado } from "./mfa";

const PAGINA = "/superadmin/verificacion";

async function terminar(r: MfaResultado): Promise<never> {
  if (r === "ok") redirect("/superadmin");
  if (r === "bloqueado") {
    (await cookies()).delete(COOKIE.superadmin);
    redirect("/superadmin/acceso");
  }
  redirect(`${PAGINA}?e=codigo`);
}

export async function comenzarMfaAccion(): Promise<void> {
  await comenzarMfa(await requireSuperadmin({ permitirSinMfa: true }));
  redirect(PAGINA);
}

export async function completarMfaAccion(f: FormData): Promise<void> {
  await terminar(await completarMfa(await requireSuperadmin({ permitirSinMfa: true }), String(f.get("codigo") ?? "")));
}

export async function verificarMfaAccion(f: FormData): Promise<void> {
  await terminar(await verificarMfa(await requireSuperadmin({ permitirSinMfa: true }), String(f.get("codigo") ?? "")));
}

export async function recuperarMfaAccion(f: FormData): Promise<void> {
  await terminar(await usarCodigoRecuperacion(await requireSuperadmin({ permitirSinMfa: true }), String(f.get("recuperacion") ?? "")));
}
