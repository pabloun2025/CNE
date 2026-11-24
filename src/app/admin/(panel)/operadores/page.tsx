import Link from "next/link";
import { SOLO_CONSUL } from "@/domain/roles";
import { ListaEnlacesEstacion } from "@/components/enlaces-estacion";
import { requireAdmin } from "@/server/guard";
import { listarEnlaces } from "@/server/estaciones";

export default async function Enlaces() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const enlaces = (await listarEnlaces()).filter((e) => e.activo && e.token);
  return (
    <main className="max-w-3xl stack">
      <h1>Enlaces de estación</h1>
      <p><Link className="button-like" href="/admin/operadores/guias">Guías rápidas con QR</Link></p>
      <ListaEnlacesEstacion enlaces={enlaces} />
    </main>
  );
}
