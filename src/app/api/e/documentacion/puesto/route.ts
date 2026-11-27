import { esLadoDocumento } from "@/domain/documentos";
import { formatoPublicoJunta } from "@/domain/juntas";
import { borrarFotoDocumento, buscarParaValidacion, guardarDocumento, leerDocumentoEnRevision, MAX_BYTES } from "@/server/documentos";
import { accesoDirectoEstacion } from "@/server/estaciones";
import { validarCedula } from "@/server/mjrv";

export const dynamic = "force-dynamic";
const PRIVADO = { "cache-control": "private, no-store" };
const noAutorizado = (status: number) => Response.json({ error: "Este enlace no autoriza esta operación." }, { status });
const incorrecto = (mensaje: string) => Response.json({ error: mensaje }, { status: 400 });
const modoValido = (valor: unknown) => valor === "prueba" || valor === "eleccion";
const versionValida = (valor: unknown) => typeof valor === "string" && /^[0-9a-f]{64}$/.test(valor);
const idValido = (id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0;

export async function GET(request: Request) {
  const e = await accesoDirectoEstacion(request, "validacion_documental", "mesas");
  if (!e.ok) return noAutorizado(e.status);
  const q = new URL(request.url).searchParams;
  const id = Number(q.get("id")), lado = q.get("lado"), modo = q.get("modo"), version = q.get("version");
  if (!idValido(id) || !esLadoDocumento(lado) || !modoValido(modo) || !versionValida(version) || !version) {
    return incorrecto("Vuelva a abrir la ficha.");
  }
  const juntaId = Number(q.get("juntaId"));
  if (e.enlace.funcion === "mesas" && !idValido(juntaId)) return incorrecto("Seleccione la junta antes de revisar las fotos.");
  const imagen = await leerDocumentoEnRevision(id, lado, modo, version, e.enlace.funcion === "mesas" ? juntaId : undefined);
  return imagen ? new Response(new Uint8Array(imagen), { headers: { ...PRIVADO, "content-type": "image/jpeg" } })
    : new Response(null, { status: 404, headers: PRIVADO });
}

export async function POST(request: Request) {
  const e = await accesoDirectoEstacion(request, "mesas", "validacion_documental");
  if (!e.ok) return noAutorizado(e.status);
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const f = await request.formData().catch(() => null);
    const id = Number(f?.get("mjrvId")), lado = f?.get("lado"), imagen = f?.get("imagen"), modo = f?.get("modo");
    if (!idValido(id) || !esLadoDocumento(lado) || !modoValido(modo) || !(imagen instanceof File) || imagen.size > MAX_BYTES) {
      return incorrecto("Revise los datos de la foto (máximo 2 MB).");
    }
    const r = await guardarDocumento({ mjrvId: id, lado, modoEsperado: modo, imagen: Buffer.from(await imagen.arrayBuffer()), origen: "estacion", enlaceId: e.enlace.id });
    return r.ok ? Response.json({ ok: true, ...r.estado }, { headers: PRIVADO }) : Response.json({ error: r.mensaje }, { status: r.status });
  }

  const c = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (c?.accion === "buscar" && typeof c.cedula === "string") {
    const juntaId = e.enlace.funcion === "mesas" && idValido(c.juntaId) && typeof c.juntaId === "number" ? c.juntaId : undefined;
    const m = await buscarParaValidacion(c.cedula, juntaId);
    if (!m) return Response.json({ encontrada: false }, { headers: PRIVADO });
    const { version, ...ficha } = m;
    return Response.json({
      encontrada: true, ...ficha, junta: formatoPublicoJunta(ficha.junta),
      ...(e.enlace.funcion === "validacion_documental" || juntaId !== undefined ? { version } : {}),
    }, { headers: PRIVADO });
  }
  if (c?.accion === "borrar_foto") {
    const { mjrvId, lado, modo, version, juntaId } = c;
    if (typeof mjrvId !== "number" || !idValido(mjrvId) || !esLadoDocumento(lado)
      || !modoValido(modo) || typeof version !== "string" || !versionValida(version)) {
      return incorrecto("Vuelva a abrir la ficha antes de borrar.");
    }
    const mesas = e.enlace.funcion === "mesas";
    if (mesas && !idValido(juntaId)) return incorrecto("Seleccione la junta antes de borrar.");
    const r = await borrarFotoDocumento({ tipo: "operador", id: e.enlace.id, nombre: e.enlace.etiqueta },
      { id: mjrvId, lado, modo, version, juntaId: mesas && typeof juntaId === "number" ? juntaId : undefined });
    return r.ok ? Response.json({ ok: true, ...r.estado }, { headers: PRIVADO }) : Response.json({ error: r.mensaje }, { status: r.status });
  }
  if (c?.accion !== "validar") return incorrecto("Elija una operación.");
  if (e.enlace.funcion !== "validacion_documental") return noAutorizado(403);
  if (!idValido(c.mjrvId) || typeof c.mjrvId !== "number" || !modoValido(c.modo) || !versionValida(c.version) || typeof c.version !== "string") {
    return incorrecto("Vuelva a abrir la ficha.");
  }
  const resultado = await validarCedula({ tipo: "operador", id: e.enlace.id, nombre: e.enlace.etiqueta, portal: "finanzas" }, c.mjrvId, c.modo, c.version);
  return Response.json(resultado, { headers: PRIVADO });
}
