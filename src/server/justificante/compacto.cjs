const alfabeto = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.$*+';
const radix = alfabeto.length;

// Tres símbolos del modo alfanumérico del QR representan dos bytes del sobre.
function compactarQr(token) {
  const datos = Buffer.from(token, 'base64url');
  let compacto = '.';
  for (let i = 0; i < datos.length; i += 2) {
    const par = i + 1 < datos.length;
    const valor = par ? datos[i] * 256 + datos[i + 1] : datos[i];
    compacto += alfabeto[valor % radix] + alfabeto[Math.floor(valor / radix) % radix];
    if (par) compacto += alfabeto[Math.floor(valor / (radix * radix))];
  }
  return compacto;
}

function normalizarTokenQr(token) {
  if (typeof token !== 'string') throw Error('Código QR inválido.');
  if (!token.startsWith('.')) return token;
  const codigo = token.slice(1);
  if (!/^[0-9A-Z.$*+\-]{184,927}$/.test(codigo) || codigo.length % 3 === 1)
    throw Error('Código QR inválido.');
  const bytes = [];
  for (let i = 0; i < codigo.length; i += 3) {
    const par = i + 2 < codigo.length;
    const inicio = alfabeto.indexOf(codigo[i]) + radix * alfabeto.indexOf(codigo[i + 1]);
    const valor = par ? inicio + radix * radix * alfabeto.indexOf(codigo[i + 2]) : inicio;
    if (valor >= (par ? 65536 : 256)) throw Error('Código QR inválido.');
    if (par) bytes.push(valor >>> 8);
    bytes.push(valor & 255);
  }
  return Buffer.from(bytes).toString('base64url');
}

module.exports = { compactarQr, normalizarTokenQr };
