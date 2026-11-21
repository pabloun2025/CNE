// Roles de la administración de Madrid (C2). La superadmin no usa rol: tiene su propio portal.
export type RolAdmin = "consul" | "coordinador" | "financiero";
export const ROLES_ADMIN: RolAdmin[] = ["consul", "coordinador", "financiero"];
export const ETIQUETA_ROL: Record<RolAdmin, string> = { consul: "Cónsul", coordinador: "Coordinador (centro de mando)", financiero: "Financiero (finanzas e informes)" };

export const esRolAdmin = (v: unknown): v is RolAdmin => typeof v === "string" && (ROLES_ADMIN as string[]).includes(v);

// Conjuntos de roles que usan las guardas. Una página, ruta o acción sin conjunto explícito queda solo para «consul».
export const SOLO_CONSUL: RolAdmin[] = ["consul"];
export const CONSUL_Y_COORDINADOR: RolAdmin[] = ["consul", "coordinador"];
export const CONSUL_Y_FINANCIERO: RolAdmin[] = ["consul", "financiero"];
export const TODOS_LOS_ROLES: RolAdmin[] = ["consul", "coordinador", "financiero"];

// A dónde se lleva a quien entra en algo que no le corresponde. Siempre una pantalla que su rol sí puede ver.
export const INICIO_DE_ROL: Record<RolAdmin, string> = { consul: "/admin", coordinador: "/admin/mando", financiero: "/admin/finanzas" };

// Orden del funcionario: credencial antes del día; el día, puerta, foto, pago y constitución.
export const ENLACES_ADMIN: { href: string; texto: string; roles: RolAdmin[] }[] = [
  { href: "/admin", texto: "Inicio", roles: CONSUL_Y_FINANCIERO },
  { href: "/admin/mjrv", texto: "MJRV", roles: SOLO_CONSUL },
  { href: "/admin/credenciales", texto: "Credenciales", roles: SOLO_CONSUL },
  { href: "/admin/revocar", texto: "Revocar acceso", roles: SOLO_CONSUL },
  { href: "/admin/operadores", texto: "Enlaces de estación", roles: SOLO_CONSUL },
  { href: "/admin/documentos", texto: "Documentos (QR)", roles: SOLO_CONSUL },
  { href: "/admin/finanzas", texto: "Finanzas", roles: CONSUL_Y_FINANCIERO },
  { href: "/admin/finanzas/pagar", texto: "Revisar e imprimir", roles: CONSUL_Y_FINANCIERO },
  { href: "/admin/finanzas/caja", texto: "Caja", roles: CONSUL_Y_FINANCIERO },
  { href: "/admin/mando", texto: "Centro de mando", roles: CONSUL_Y_COORDINADOR },
  { href: "/admin/informes", texto: "Informes", roles: CONSUL_Y_FINANCIERO },
];

export const PASOS_MADRID: { href: string; texto: string; roles: RolAdmin[] }[] = [
  { href: "/admin/credenciales", texto: "Credencial", roles: SOLO_CONSUL },
  { href: "/admin/operadores", texto: "Puerta", roles: SOLO_CONSUL },
  { href: "/admin/documentos", texto: "Documentos de identidad", roles: SOLO_CONSUL },
  { href: "/admin/finanzas", texto: "Pago", roles: CONSUL_Y_FINANCIERO },
  { href: "/admin/mando", texto: "Constitución", roles: CONSUL_Y_COORDINADOR },
];
