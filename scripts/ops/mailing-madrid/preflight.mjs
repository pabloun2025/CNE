const llave = process.env.BREVO_API_KEY?.trim();
if (!llave) process.exit(1);
async function consultar(ruta) {
  const respuesta = await fetch(`https://api.brevo.com/v3${ruta}`, {
    headers: { "api-key": llave, accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  console.log(JSON.stringify({ ruta, http: respuesta.status }));
  if (!respuesta.ok) return {};
  return respuesta.json();
}
const [cuenta, remitentes, listas] = await Promise.all([
  consultar("/account"),
  consultar("/senders"),
  consultar("/contacts/lists?limit=10"),
  consultar("/emailCampaigns?limit=1"),
]);
const nombre = "Madrid · Mailing electoral · 29-11-2026";
const remitente = remitentes.senders?.find((r) => r.email === "avisos@consulado.app");
console.log(JSON.stringify({
  planes: cuenta.plan?.map(({ type, credits, creditsType }) => ({ type, credits, creditsType })),
  marketing: cuenta.planVerticals?.filter((p) => p.planCategory === "Marketing").map(({ planType, status, credits }) => ({ planType, status, credits })),
  dominioAutenticado: remitente?.active === true,
  remitenteId: remitente?.id,
  listasDisponibles: listas.count,
  listaYaCreada: listas.lists?.some((l) => l.name === nombre),
}));
