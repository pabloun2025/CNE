import Link from "next/link";
import { SOLO_CONSUL } from "@/domain/roles";
import { AccesosPorEquipo } from "@/components/enlaces-estacion";
import { requireAdmin } from "@/server/guard";
import { listarEnlaces } from "@/server/estaciones";

export default async function Enlaces() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const enlaces = (await listarEnlaces()).filter((e) => e.activo && e.token);
  return (
    <main className="max-w-5xl stack-lg">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="hero">
          <h1>Enlaces de estación</h1>
          <p>Comparta con cada persona el enlace de su puesto.</p>
        </div>
        <Link className="button-like secondary" href="/admin/operadores/guias">Guías rápidas con QR</Link>
      </header>
      <AccesosPorEquipo enlaces={enlaces} />
    </main>
  );
}
