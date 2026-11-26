import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
const prefijos = { X:'0', Y:'1', Z:'2' };

export function validarDocumentoEspanol(dato) {
  const numero = String(dato ?? '').trim().toUpperCase();
  if (!numero) return null;
  const dni = /^\d{8}[A-Z]$/.test(numero);
  const nie = /^[XYZ]\d{7}[A-Z]$/.test(numero);
  if (!dni && !nie) throw Error('Introduzca un DNI o NIE español con su letra de control.');
  const cifras = dni ? numero.slice(0,-1) : prefijos[numero[0]] + numero.slice(1,-1);
  if (letras[Number(cifras) % 23] !== numero.at(-1)) throw Error('La letra de control del DNI o NIE no es válida.');
  return { tipo:dni ? 'DNI' : 'NIE', numero };
}

export function validarDatosLaborales(input) {
  const nombre = typeof input.nombre === 'string' ? input.nombre.trim().normalize('NFC').replace(/\s+/gu,' ') : '';
  if (nombre.length < 2 || nombre.length > 120 || !/\p{L}/u.test(nombre) || /[\p{Cc}\p{Cf}]/u.test(nombre)) throw Error('Introduzca los nombres y apellidos completos.');
  const cedula = typeof input.cedula === 'string' ? input.cedula.trim() : '';
  if (!/^\d{10}$/.test(cedula)) throw Error('Introduzca los diez dígitos de la cédula ecuatoriana.');
  return { nombre, cedula, documento:validarDocumentoEspanol(input.documento) };
}

function leerArial() {
  const dir=process.env.CNE_FUENTES_ARIAL_DIR ?? '/usr/local/share/fonts/cne';
  try {
    return { regular:readFileSync(join(/* turbopackIgnore: true */ dir,'arial.ttf')),
      negrita:readFileSync(join(/* turbopackIgnore: true */ dir,'arialbd.ttf')) };
  } catch { return null; }
}

export async function prepararDocumentoLaboral(plantilla, fuente, datos) {
  const pdf = await PDFDocument.load(plantilla);
  pdf.setTitle('Justificante laboral de asistencia al recinto electoral');
  pdf.registerFontkit(fontkit);
  const arial=leerArial();
  const regular=arial ? await pdf.embedFont(arial.regular,{subset:true}) : await pdf.embedFont(StandardFonts.Helvetica);
  const bold=arial ? await pdf.embedFont(arial.negrita,{subset:true}) : await pdf.embedFont(StandardFonts.HelveticaBold);
  const caracteresArial=new Set(bold.getCharacterSet());
  const nombreFont=arial && [...datos.nombre].every(letra=>caracteresArial.has(letra.codePointAt(0))) ? bold : await pdf.embedFont(fuente,{subset:true});
  const page = pdf.getPage(0);
  const soportados = new Set(nombreFont.getCharacterSet());
  if ([...datos.nombre].some(letra => !soportados.has(letra.codePointAt(0)))) throw Error('El nombre contiene caracteres que requieren asistencia consular.');

  const x = 95.6, ancho = 402, altura = page.getHeight(), color = rgb(.12,.20,.35);
  const texto = (value,left,top,size,font) => page.drawText(value,{x:left,y:altura-top,size,font,color});
  const anchoNombre = s => nombreFont.widthOfTextAtSize(s,13);
  let lineas = [datos.nombre];
  const partes = datos.nombre.split(' ');
  if (anchoNombre(datos.nombre) > ancho && partes.length > 1) {
    let corte = 1;
    for (let i = 2; i < partes.length; i++) {
      if (Math.abs(anchoNombre(partes.slice(0,i).join(' ')) - anchoNombre(datos.nombre)/2) <
          Math.abs(anchoNombre(partes.slice(0,corte).join(' ')) - anchoNombre(datos.nombre)/2)) corte = i;
    }
    lineas = [partes.slice(0,corte).join(' '),partes.slice(corte).join(' ')];
  }
  const size = Math.min(13,13 * ancho / Math.max(...lineas.map(anchoNombre)));
  texto('NOMBRES Y APELLIDOS',x,237,8.5,bold);
  lineas.forEach((linea,i) => texto(linea,x,252+i*13,size,nombreFont));
  texto('CÉDULA ECUATORIANA',x,279,8.5,bold);
  texto(datos.cedula,x,295,11,regular);
  if (datos.documento) {
    texto(datos.documento.tipo,x+245,279,8.5,bold);
    texto(datos.documento.numero,x+245,295,11,regular);
  }
  return pdf.save();
}
