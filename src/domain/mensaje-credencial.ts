// Texto del mensaje de la credencial (WhatsApp y correo), 09 §3.7 y decisión 10b. Función pura.
// «Comprobante de pago»: así se llama el acta en los documentos para el público (decisión 1).
export function textoCredencial(d: { nombres: string; rotulo: string; host?: string | null }): string {
  const base = `Buen día, ${d.nombres}. Le enviamos su credencial de miembro de Junta Receptora del Voto (${d.rotulo}). Preséntela con su cédula.`;
  const host = (d.host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!host) return base;
  return `${base} Para su comprobante de pago necesitamos la foto de su cédula (anverso y reverso). Puede subirla aquí: https://${host}/d`;
}
