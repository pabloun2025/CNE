import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { otpauthUri } from "@/domain/totp";
import { requireSuperadmin } from "@/server/guard";
import { estadoMfa } from "@/server/mfa";
import { comenzarMfaAccion, completarMfaAccion, recuperarMfaAccion, verificarMfaAccion } from "@/server/mfa-actions";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";
const boton = "w-full rounded bg-blue-700 px-4 py-3 font-semibold text-white";

export default async function Verificacion({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sesion = await requireSuperadmin({ permitirSinMfa: true });
  if (sesion.mfaVerificada) redirect("/superadmin");
  const estado = await estadoMfa(sesion);
  if (!estado) redirect("/superadmin/acceso");
  const error = (await searchParams).e === "codigo" ? "El código no es válido o ya se usó. Espere al siguiente e inténtelo de nuevo." : null;
  const aviso = error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>;

  if (estado.activada) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-semibold">Código de verificación</h1>
        {aviso}
        <form action={verificarMfaAccion} className="mt-4 space-y-4">
          <label className="block text-sm font-medium">Código de seis cifras de su aplicación
            <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus className={campo} />
          </label>
          <button className={boton}>Entrar</button>
        </form>
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer font-medium">No tengo el teléfono</summary>
          <form action={recuperarMfaAccion} className="mt-3 space-y-3">
            <label className="block font-medium">Código de recuperación (cada uno sirve una sola vez)
              <input name="recuperacion" autoComplete="off" required className={campo} />
            </label>
            <button className="rounded border border-slate-500 px-4 py-3 font-semibold">Usar código de recuperación</button>
          </form>
        </details>
      </main>
    );
  }

  if (!estado.pendiente) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-semibold">Configure la verificación en dos pasos</h1>
        {aviso}
        <p className="mt-3 text-sm">La superadministración exige, además de la contraseña, un código que cambia cada 30 segundos. Necesita una aplicación de autenticación en el teléfono: Google Authenticator, Microsoft Authenticator o FreeOTP.</p>
        <form action={comenzarMfaAccion} className="mt-4"><button className={boton}>Empezar</button></form>
      </main>
    );
  }

  const qr = await QRCode.toDataURL(otpauthUri(estado.pendiente.secreto, estado.correo), { margin: 2, width: 232 });
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Vincule su aplicación</h1>
      {aviso}
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>En la aplicación, añada una cuenta escaneando este código.</li>
        <li>Guarde los códigos de recuperación en un lugar seguro. No se vuelven a mostrar.</li>
        <li>Escriba el código de seis cifras que muestra la aplicación.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="Código QR para la aplicación de autenticación" width={232} height={232} className="mt-3 rounded bg-white" />
      <p className="mt-2 text-sm">Si no puede escanearlo, escriba esta clave: <code className="break-all">{estado.pendiente.secreto}</code></p>
      <div className="mt-4 rounded bg-yellow-50 p-3">
        <p className="text-sm font-medium">Códigos de recuperación</p>
        <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">{estado.pendiente.codigos.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
      <form action={completarMfaAccion} className="mt-4 space-y-4">
        <label className="block text-sm font-medium">Código de seis cifras
          <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className={campo} />
        </label>
        <button className={boton}>Activar y entrar</button>
      </form>
    </main>
  );
}
