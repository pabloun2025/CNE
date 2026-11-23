import Link from "next/link";

const secciones = [
  { ruta: "", texto: "Credenciales" },
  { ruta: "/whatsapp", texto: "Envíos de WhatsApp" },
  { ruta: "/envios", texto: "Seguimiento" },
  { ruta: "/imprimir", texto: "Imprimir planchas A4" },
];

export function PestanasCredenciales({ actual }: { actual: string }) {
  return <nav aria-label="Credenciales" className="section-tabs">
    {secciones.map(({ ruta, texto }) => (
      <Link key={ruta} href={`/admin/credenciales${ruta}`} aria-current={ruta === actual ? "page" : undefined} className="section-tab">{texto}</Link>
    ))}
  </nav>;
}
