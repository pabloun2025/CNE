import Link from "next/link";

const secciones = [
  { ruta: "", texto: "Credenciales" },
  { ruta: "/whatsapp", texto: "Envíos de WhatsApp" },
  { ruta: "/whatsapp/bandeja", texto: "Bandeja de WhatsApp", prefetch: false },
  { ruta: "/envios", texto: "Seguimiento" },
  { ruta: "/imprimir", texto: "Imprimir planchas A4" },
];

export function PestanasCredenciales({ actual }: { actual: string }) {
  return <nav aria-label="Credenciales" className="section-tabs">
    {secciones.map(({ ruta, texto, prefetch }) => (
      <Link key={ruta} href={`/admin/credenciales${ruta}`} prefetch={prefetch} aria-current={ruta === actual ? "page" : undefined} className="section-tab">{texto}</Link>
    ))}
  </nav>;
}
