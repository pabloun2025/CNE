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

1. [ ] `/superadmin/acceso`: entrar con la contraseña inicial → obliga a cambiarla → (desde la segunda versión) verificación en dos pasos, ver sección G → consola. Un correo o contraseña errónea da «Correo o contraseña incorrectos.»
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

## D. Qué anotar para calibrar M23 (captura automática)

Por cada modelo de móvil y navegador: ¿abre la cámara trasera?, ¿lee el QR de puerta rápido?, ¿enfoca el documento?, ¿el recuadro coincide con lo que se recorta?, ¿«Hacer o elegir foto» funciona como alternativa? Anotar fallos con modelo, sistema y navegador (sin datos personales). Con la captura automática (segunda versión): ¿se toma sola en ~1 s con el documento quieto?, ¿dispara con una pared vacía o con el documento borroso (no debería)?, ¿tarda demasiado con poca luz? Los umbrales (`MIN_NITIDEZ`, `MAX_MOVIMIENTO`, `MS_ESTABLE` en `src/domain/captura-auto.ts`) son un punto de partida y se ajustan con estas notas.

## E. Reversión

`Deploy to Oracle` → `accion=revertir` vuelve a la imagen `cne:anterior`. Los cambios de esquema son aditivos, no hace falta restaurar la base. Copias: `backups/` (diaria, 14 días) y `backups/pre-despliegue/` (5 últimas).

## F. Límites conocidos (actualizado en la segunda versión)

- Rótulo de credencial (P-5), importe y fórmula de pago (P-7), plantilla del acta (P-6): sin aprobar; el sistema lo marca como pendiente.
- Envíos de credenciales: solo simulados. `WHATSAPP_REAL_SEND=true` o `EMAIL_REAL_SEND=true` se rechazan hasta conectar Evolution API / Brevo (no hay proveedor real escrito).
- Aviso de atención simultánea (M24, P-8): no construido, no aprobado.
- Los umbrales de la captura automática no están calibrados con móviles reales (solo probados con cámara simulada en Chrome).

## G. Segunda tanda (M18–M25): comprobaciones nuevas

Despliegue: la imagen ahora instala `postgresql-client-16` (PGDG) para el respaldo de M19; la construcción necesita red hacia `apt.postgresql.org`. Migraciones nuevas, aditivas e idempotentes: `2026-11-18-mfa-superadmin.sql` (columnas de 2FA en `usuarios` y tabla `codigos_recuperacion`) y `2026-11-18-envios-unico.sql` (índice único parcial en `envios_credencial`).

**G1. 2FA de la superadmin (M18).** Hacer con el teléfono de Pablo.
1. [ ] Entrar en `/superadmin/acceso` con la contraseña: la primera vez lleva a «Configure la verificación en dos pasos» (nada de `/superadmin` abre antes). Si se escribe `/superadmin` a mano, redirige a la verificación.
2. [ ] «Empezar» → QR y 10 códigos de recuperación. **Guardar los códigos fuera del servidor** (no se vuelven a mostrar). Escanear con Google Authenticator/Microsoft Authenticator/FreeOTP, escribir el código → consola.
3. [ ] Cerrar sesión y entrar de nuevo: pide el código de 6 cifras. Un código ya usado se rechaza (esperar al siguiente). Tras 5 fallos en 15 minutos la cuenta cierra sus sesiones.
4. [ ] «No tengo el teléfono» con un código de recuperación: entra y ese código ya no sirve. Anotar cuáles quedan.
5. [ ] Si se pierde el teléfono y los códigos: no hay pantalla de restablecimiento (a propósito). Hay que anular a mano en la base: `UPDATE cne.usuarios SET mfa_secreto=NULL, mfa_secreto_nonce=NULL, mfa_pendiente=NULL, mfa_pendiente_nonce=NULL, mfa_activada_en=NULL, mfa_ultimo_contador=NULL WHERE tipo='superadmin'` (pide autorización de Pablo; el siguiente acceso vuelve a pedir configurar).

**G2. Borrar datos de prueba y preparar para elección (M19).** Solo cuando Pablo lo ordene (noche del 28); antes ensayar con datos de demostración.
1. [ ] Consola → «Preparar elección»: lista lo que se borrará (con recuento) y lo que se conserva.
2. [ ] «Solo crear respaldo para descargar» → «Descargar respaldo» (`.dump`). Guardarlo fuera del servidor (contiene cédulas y fotos cifradas; sin `APP_MASTER_KEY` no se leen las fotos). El archivo vive en el contenedor y se pierde al reiniciarlo.
3. [ ] Escribir `PREPARAR ELECCIÓN` y pulsar el botón rojo: hace un respaldo nuevo y lo comprueba con `pg_restore --list`; si falla, dice «No se limpió nada» y el modo no cambia. Si va bien: recuentos borrados, enlace de descarga, modo elección. Los datos de demostración desaparecen; cuentas, operadores/PIN, enlaces, juntas, fichas reales y parámetros siguen.
4. [ ] Repetirlo: borra 0 y no toca nada. La banda MODO PRUEBA desaparece de todas las pantallas.
5. [ ] Copia interna: `SELECT lote, tabla, count(*) FROM cne.respaldo_limpieza GROUP BY 1,2` (las fotos de ensayo no se duplican ahí: están en el `.dump`).

**G3. Informe de cierre (M20).** [ ] Admin → Informes → «Descargar PDF» y «Descargar Excel»: mismas filas que el panel de finanzas, con USD, tipo de cambio, EUR, momento y operador; hora de corte; el total coincide con el panel (solo confirmados); sin fotos; en modo prueba lleva «PRUEBA — SIN VALIDEZ». Abrir el Excel: la cédula conserva los ceros.

**G4. Envío simulado de credenciales (M21).** [ ] Ficha de una persona con teléfono/correo → «Enviar por WhatsApp/correo»: queda «Enviada al servicio (simulado)» y no sale ningún mensaje; pulsarlo otra vez dice que ya hay un envío. Sin teléfono/correo el botón está desactivado. Admin → Credenciales → envío por lote a quienes faltan. Mensaje de aviso «Envío SIMULADO» visible.

**G5. Inicio del admin (M22).** [ ] `/admin` muestra dos bloques: apertura de juntas (credenciales preparadas/pendientes, ingresados, juntas con tres presentes, incompletas, sin nadie) y pagos (documentos completos, pagos confirmados, total EUR). Se actualiza cada 10 s; los pagos no suben al imprimir actas. A 375 px las tarjetas pasan a 2 columnas sin desplazamiento horizontal.

**G6. Captura automática (M23).** [ ] En `/d` (y en la estación de documentación): con la cámara abierta, la barra verde avanza y la foto se toma sola tras ~1 s con el documento quieto y nítido; con la cámara tapada o movida no dispara; «Tomar foto» y «Hacer o elegir foto» siguen funcionando; la casilla «Captura automática» la apaga; tras «Repetir» hay 2 s de pausa.

**G7. Matriz de permisos (M25).** Automática en CI (`tests/permisos.test.ts`); no requiere acción manual. Toda ruta API o acción de servidor nueva debe añadirse a la matriz o la prueba falla.

## H. Decisiones del 18-11-2026 (D01–D13): comprobaciones nuevas

Despliegue: una migración nueva, aditiva e idempotente: `2026-11-19-decisiones-18-11.sql` (importe en EUR, resultado `reingreso_autorizado`, cargos asumidos, fichas abiertas en finanzas, interruptores y cola de envío). Antes de publicar: copia de la base (la hace `scripts/deploy-oracle.sh`). **Revertir tras D03:** la imagen anterior mostraría importes de USD vacíos en actas nuevas; no se pierden datos, pero no se recomienda revertir una vez haya pagos reales. El envío real **nace apagado** y solo lo enciende la superadmin.

**H1. Claves de envío (D05, D06).** [ ] `/superadmin/envios` dice «Claves de envío: WhatsApp sí, correo sí» (el despliegue las copia de consulares sin imprimirlas). Si dice «no», el envío sigue simulado: no es un fallo.

**H2. Línea de WhatsApp de CNE (D06).** Con el teléfono de la línea de CNE en la mano.
1. [ ] `/superadmin/envios` → «Crear y vincular» → aparece un QR que se renueva cada 3 s. Escanearlo desde WhatsApp › Dispositivos vinculados. El estado pasa a «Vinculada con +34…».
2. [ ] La instancia se llama `cne-madrid`. En el servidor: `docker ps` muestra los contenedores de consulares (incluido `citas-prod-evolution-api`) con el mismo «Up» de antes; ninguna otra instancia de Evolution ha cambiado.
3. [ ] Pulsar «Crear y vincular» con la línea ya creada no duplica nada. «Desvincular» (pide confirmar) la deja «Desconectada» y apaga el interruptor de WhatsApp.

**H3. Envío simulado con el interruptor apagado (D07).** [ ] Con ambos interruptores en «apagado», enviar la credencial a una ficha real de prueba: queda «Enviada al servicio (simulado)» y no sale nada. La pantalla de credenciales dice «Envío SIMULADO».

**H4. Envío real (D07, D08). SOLO con orden expresa de Pablo.**
1. [ ] Crear fichas reales de prueba con **dos o tres teléfonos y correos propios** (no de demostración: las de demostración nunca salen por real).
2. [ ] En `/superadmin/envios` guardar el remitente del correo (dirección verificada en Brevo y **nombre** que indique Pablo: sin nombre el correo real no se puede encender). Comprobar que `HOST_MADRID` está definido.
3. [ ] Escribir `ENVIO REAL` para encender el canal. Si falta clave, línea vinculada, remitente o `HOST_MADRID`, no se enciende y dice qué falta.
4. [ ] Enviar: la ficha queda «En cola» y sale de 9 a 21 h (Madrid), un mensaje cada 20–45 s (WhatsApp) o 2–5 s (correo). Comprobar en el teléfono y el correo: PDF de la credencial, texto «Buen día… credencial… comprobante de pago… https://<host>/d» y que el enlace abre el formulario de la cédula (si está cerrado, la pantalla de credenciales lo avisa).
5. [ ] Los contadores de `/superadmin/envios` (en cola, enviados hoy de 150/200, próximo envío) cambian. Latido en el registro del contenedor: `docker logs cne-prod-cne-app-1 | grep "cola de envíos"`.
6. [ ] Apagar el interruptor: lo pendiente queda «En cola» sin salir. Tras 5 fallos seguidos el canal se pausa con motivo y solo la superadmin lo reanuda («Reanudar envíos»). Si el contenedor se reinicia a medias, la fila interrumpida pasa a «Falló el envío: Interrumpido…» y no se reenvía sola.
7. [ ] Con 570 fichas el WhatsApp tarda unos 4 días a 150 al día: empezar a enviar **no más tarde del 24-11**.

**H5. Puerta (D04).** [ ] Leer dos veces el mismo QR: la segunda sale en **amarillo** («Ya ingresó a las hh:mm», nombre y junta, un pitido medio) con «Dejar pasar» y «No pasa / Siguiente»; «Dejar pasar» no cambia el contador de ingresados. Una cédula de baja sale en rojo «Dada de baja en la lista»; una desconocida, en rojo «QR no reconocido».

**H6. Centro de mando (D09–D11).** [ ] Una junta solo es verde con presidente, secretario y vocal cubiertos («Falta secretario», «Faltan presidente y vocal» en ámbar; rojo si nadie). El suplente de la propia junta asume el cargo solo («Suplente de la junta»). La ficha de junta muestra los tres cargos con «Asignar» (a mano) y «Quitar». La propuesta de traslado indica el cargo (editable) y al aceptar queda «Trasladado desde Hx». Sin suplentes sobrantes aparece «No hay suplentes transferibles. Si hace falta, incorpore un votante». «Incorporar votante» con un **votante ficticio en modo prueba**: queda presente con la marca «Incorporada desde votantes», cubre el cargo, se puede documentar y cobrar, y «Preparar elección» lo borra.

**H7. Finanzas (D03, D12).** [ ] Parámetros de pago: solo importe en EUR, pagador y lugar (sin USD ni tipo de cambio). Sin importe el acta sale BORRADOR. Con un importe de prueba evidente el acta se titula «Comprobante de pago» y dice «Importe entregado: NN,NN EUR». Vaciar el importe de prueba después. Abrir la misma ficha en dos puestos de finanzas: el segundo ve en ámbar «Finanzas N (operador) abrió esta ficha hace n min»; no bloquea. El informe PDF/Excel ya no lleva columnas de USD ni de cambio.

**H8. Importador (D02).** [ ] Con el Excel real: si trae columna de rótulo, se imprime tal cual; si no, la vista previa avisa en grande «no trae columna de rótulo: se imprimirá el texto de la junta tal cual». Si el archivo usa M01/F01 (masculino/femenino) la vista previa lo avisa con el recuento por serie (M→H, F→M): **comprobar el recuento antes de aplicar**.

**H9. Borrar fotos de cédula (D13).** [ ] Consola de superadmin › «Fotos de cédula»: muestra el recuento y cuántas personas aún no tienen pago confirmado. Sin la frase `BORRAR FOTOS` no borra; con ella borra las del modo actual, queda en la auditoría y finanzas vuelve a pedir las fotos. Las copias diarias conservan las fotos cifradas hasta 14 días.

**H10. Matriz de permisos y compatibilidad.** Automática en CI: rutas y acciones nuevas (`POST /api/e/puerta/pase`, `GET /api/superadmin/whatsapp/estado`, cargos, incorporar, interruptores, borrar fotos) están en `tests/permisos.test.ts`.
