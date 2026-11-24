// Letra pública de la junta en SQL: la serie interna H (hombres) se muestra M y la M (mujeres), F.
// Solo para textos que ve el usuario. Las consultas que comparan series siguen usando H/M internas.
export const juntaPublicaSql = (alias: string) =>
  `(CASE ${alias}.serie WHEN 'M' THEN 'F' ELSE 'M' END || ${alias}.numero)`;
