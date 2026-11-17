// Política de contraseñas: mínimo 8 caracteres (especificación §2, §16.1), sin más reglas de composición.
export const PASSWORD_MIN = 8;

// Lista corta de contraseñas obvias.
const BLOQUEADAS = ["12345678", "123456789", "password", "contrasena", "qwertyui", "11111111", "cne2026cne", "madrid2026"];

export function passwordProblem(password: string, correo = ""): string | null {
  if (password.length < PASSWORD_MIN) return `Use al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > 200) return "La contraseña es demasiado larga.";
  const baja = password.toLowerCase();
  if (BLOQUEADAS.includes(baja)) return "Esa contraseña es demasiado común.";
  if (correo && baja === correo.toLowerCase()) return "La contraseña no puede ser su correo.";
  return null;
}
