# 08 · Lista de comprobación de la primera versión en producción (M17)

Se hace en producción, con el interruptor **Modo prueba** encendido (valor inicial). Todo lo que se registre queda etiquetado como prueba. Envíos de WhatsApp y correo: simulados (no hay código de envío real). Marque cada punto y anote fallos.

## A. Antes de desplegar

- [ ] `oracle-inspect.yml` (solo lectura): memoria libre ≥ 1,5 GB, disco libre ≥ 5 GB, existe la red `citas-prod_interna`. Si no, avisar a Pablo y no desplegar.
- [ ] Secreto `ORACLE_SSH_KEY` presente. `APP_MASTER_KEY` y la contraseña inicial de la superadmin pueden faltar: el servidor las genera la primera vez y las conserva en `/home/ubuntu/cne/.env.production` (600).
- [ ] Flujo **Deploy to Oracle** → `accion=desplegar` sobre `main` (host por defecto `madrid.consulado.app`).
- [ ] Flujo **Dominio** → `comprobar` y después `crear` para `madrid.consulado.app` (túnel existente, servicio `http://cne-app:38473`). Requiere `CLOUDFLARE_API_TOKEN`; sin él, se añade a mano en Zero Trust.

## B. Comprobaciones tras el despliegue (06 §4, 07 §3.5)

- [ ] `https://madrid.consulado.app/api/salud` → 200 con `"base":"ok"` y la versión (sha) desplegada.
- [ ] `https://madrid.consulado.app/admin/acceso` → 200 y banda roja **MODO PRUEBA** visible.
- [ ] Registro de `cne-migrate`: `SELECT count(*) FROM cne.juntas_madrid = 95`.
- [ ] `docker ps`: consulares (`citas-prod`) y teinvito con el mismo «Up …» que antes; `cne-prod` con 3 servicios en marcha (`cne-postgres`, `cne-app`, `cne-backup`).
- [ ] `/home/ubuntu/cne/.env.production` con permisos 600 y copia previa en `backups/pre-despliegue/` a partir del segundo despliegue.
- [ ] Superadmin: correo `SUPERADMIN_EMAIL` (o `superadmin@cne.local`); la contraseña inicial está en la línea `SUPERADMIN_PASSWORD_INICIAL` de `.env.production` (leer solo esa línea, no pegarla en chats ni registros). Se obliga a cambiarla al primer acceso.

## C. Recorrido con un móvil real (a 375 px)

1. [ ] `/superadmin/acceso`: entrar con la contraseña inicial → obliga a cambiarla → consola. Un correo o contraseña errónea da «Correo o contraseña incorrectos.»
2. [ ] Consola: el conmutador de modo dice «MODO PRUEBA»; **crear cuenta de administración Madrid** (se muestra una contraseña temporal una sola vez).
3. [ ] Cerrar sesión; `/admin/acceso`: entrar con esa cuenta → cambio obligatorio → inicio. Comprobar que la cookie de admin no abre `/superadmin` (redirige al acceso).
4. [ ] Superadmin → **Cargar datos de demostración** (570 fichas «APELLIDO PRUEBA 001…», cédulas 0000000001…, rótulos H01…M54). Pulsarlo dos veces: la segunda no duplica.
5. [ ] Admin → **Operadores y enlaces**: crear operadores (PIN de 4 dígitos) y un enlace de cada función: puerta, documentación, mando y finanzas. «Ver enlace y QR» muestra el QR de cada enlace.
6. [ ] Admin → **Credenciales** → «Hoja A4 (10 por hoja)». Imprimir una hoja de prueba (lleva la franja «PRUEBA»). **Leer con un móvil el QR de una credencial: debe dar exactamente la cédula.**
7. [ ] Móvil con el enlace de **puerta**: elegir nombre, teclear PIN. «Activar cámara» y leer 3 credenciales de la misma junta (por ejemplo H12): verde «Válida», nombre y junta, pitido agudo. Releer una: rojo «Ya registró su ingreso a las hh:mm», dos pitidos graves. Escribir una cédula inexistente: «QR no reconocido». Sin red: gris «No se pudo comprobar», nunca rojo.
8. [ ] **Centro de mando** (enlace de mando o `/admin/mando`): H12 pasa a verde «3 presentes» en ≤ 3 s; con 1 lectura, ámbar «Faltan 2». Indicadores y filtros («Faltan miembros», «Con suplentes transferibles», «Completas», «Todas»). Ficha de junta al pulsar.
9. [ ] **Propuesta**: con juntas incompletas y suplentes sobrantes aparece una tarjeta; **Aceptar** → la junta de destino queda con la marca ⇄. Probar «Siguiente propuesta» y «No viable» (con motivo).
10. [ ] Admin → **Documentos (QR)**: abrir el formulario y «Descargar cartel A4 con el QR». Con otro móvil abrir `https://madrid.consulado.app/d`: cédula → «¿Es usted?» (solo iniciales y junta) → foto de anverso y de reverso (recuadro, «Tomar foto», «Usar / Repetir»). La ficha del admin muestra las miniaturas y «Documentos completos». Cerrar el formulario: `/d` dice «Formulario cerrado».
11. [ ] Admin → **Finanzas** → Parámetros de pago: están **vacíos**; el aviso dice «pendientes de aprobación». Sin parámetros, el acta sale como BORRADOR y no se puede confirmar. Para ensayar, escribir valores **ficticios** (por ejemplo 100 USD, cambio 1) y **volver a vaciarlos** después si Pablo no los ha aprobado.
12. [ ] Estación de **finanzas**: leer o escribir una cédula con documentos completos → semáforo de requisitos → casilla «He verificado que cumplió sus funciones» → **Generar e imprimir acta** (PDF de 2 páginas con marca «PRUEBA — SIN VALIDEZ» y número `PRUEBA-000001`) → solo entonces aparece **Confirmar pago entregado** → «Pago confirmado … Pago simulado». Reimprimir dice «REIMPRESIÓN 2» y no marca el pago. Releer la cédula: banda roja «YA PAGADO».
13. [ ] Admin → **Finanzas** → Panel: «Pagados» y total EUR suben solo al confirmar (no al generar actas).
14. [ ] Revisar las pantallas a 375 px: sin desplazamiento horizontal, botones grandes, menú de admin desplegable.

## D. Qué anotar para M23 (captura automática)

Por cada modelo de móvil y navegador: ¿abre la cámara trasera?, ¿lee el QR de puerta rápido?, ¿enfoca el documento?, ¿el recuadro coincide con lo que se recorta?, ¿«Hacer o elegir foto» funciona como alternativa? Anotar fallos con modelo, sistema y navegador (sin datos personales).

## E. Reversión

`Deploy to Oracle` → `accion=revertir` vuelve a la imagen `cne:anterior`. Los cambios de esquema son aditivos, no hace falta restaurar la base. Copias: `backups/` (diaria, 14 días) y `backups/pre-despliegue/` (5 últimas).

## F. Límites conocidos de esta versión

- Superadministración sin 2FA (M18, obligatoria antes de cargar el Excel real). Mientras tanto, proteger `/superadmin*` con Cloudflare Access.
- Sin «Preparar elección» (M19): no pasar a modo elección con datos de prueba.
- Envíos de credenciales por WhatsApp/correo (M21), informe de cierre (M20), inicio con indicadores (M22) y captura automática (M23): pendientes.
- Rótulo de credencial (P-5), importe y fórmula de pago (P-7), plantilla del acta (P-6): sin aprobar; el sistema lo marca como pendiente.
