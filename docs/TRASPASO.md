# Traspaso del Proyecto CNE — estado al 24-11-2026

Documento para que otra IA (o persona) continúe el trabajo sin perder contexto. **Léalo entero antes de tocar nada.** Responsable del proyecto: Pablo Martínez (Ministro, Embajada del Ecuador en España). Se comunica en español, trato de usted, preguntas en opciones de selección (A/B/C) con recomendación.

**Último estado, 24-11-2026.** Consulte la [sección 41](#41-entrega-de-guías-con-qr-y-comprobación-del-archivo-de-recibos-24-11) para las guías con QR y el cierre de la revisión F/M, la [sección 23](#23-importe-comunicado-a-los-mjrv) para la guía de pago, la [sección 22](#22-cédula-como-identificador-y-foto-de-pasaporte) para la captura, la [sección 19](#19-credenciales-por-zona-y-alta-manual) para las credenciales y la [sección 18](#18-reinicio-integral-y-recibos-de-madrid) para los recibos y el reinicio.

## 1. Qué es y qué alcance tiene hoy

- Repositorio privado `pabloun2025/CNE`. Rama de trabajo `claude/optimistic-wozniak-ksg62y`; **producción se publica solo desde `main`** (Pablo autorizó trabajar sobre `main`).
- **Alcance vigente: solo el sistema operativo de Madrid** (miembros de las juntas receptoras del voto, MJRV) para la jornada del **29-11-2026** en la Caja Mágica (95 juntas: M1–M41 y F1–F54, seis zonas de color).
- **Fuera de alcance por decisión de Pablo (18-11):** el portal de reporte consular y el tablero DGSMH **no se construyen**. Sus documentos de diseño (00–06) quedan como referencia; la maqueta estática del tablero sigue en `maqueta/` y en https://tablero-dgsmh.onrender.com (Render, sitio estático gratuito).
- Las tres funciones principales del sistema (así lo presenta Pablo): **el QR de la credencial sirve para armar las juntas**, **las fotos de la cédula o del pasaporte sirven para el comprobante de pago**, y **el pago es ordenado y seguro** (nadie cobra dos veces).

## 2. Orden de lectura

1. `AGENTS.md` (reglas que no se negocian) y `.claude/skills/karpathy-guidelines/SKILL.md`.
2. Este documento.
3. `ESPECIFICACION_FUNCIONAL.md` §7, «Mapa de juntas de Madrid», §8 y las entradas **«DECIDIDO (18-11-2026)»** (prevalecen; lo antiguo está marcado «SUSTITUIDO»).
4. `docs/diseno/07-plan-madrid.md` (plan M01–M25), `09-cambios-decisiones.md` (D01–D14) y `08-comprobacion-primera-version.md` (listas de comprobación A–H).
5. `insumos/GUIA_DE_USO_PARA_CLAUDE.md` (insumos y fuentes oficiales). `INSTRUCCIONES.md` es solo historial.

## 3. Estado: qué está construido y publicado

Producción: **https://madrid.consulado.app**. La versión verificada en Oracle es `5073b61`. [Estado público](https://madrid.consulado.app/api/salud)

| Bloque | Estado |
|---|---|
| M01–M17 primera versión (accesos, importador Excel/CSV, fichas MJRV, credencial CR80 + A4 con QR de cédula, operadores con PIN y enlaces de estación, puerta, centro de mando, propuestas deterministas, documentos `/d` con fotos cifradas, parámetros de pago, finanzas con acta y confirmación atómica, panel financiero) | Publicado |
| M19–M23, M25 («Borrar datos de prueba y preparar para elección» con respaldo verificado, informe de cierre PDF/Excel, envío de credenciales, inicio admin, captura automática de cédula, matriz de permisos) | Publicado |
| M24 (reserva en finanzas) | Sustituido por D12 (aviso no bloqueante) |
| D01–D13 decisiones del 18-11 (importe fijo EUR, «Comprobante de pago», reingreso amarillo, baja = rojo, tres cargos por junta, incorporar votantes, traslados con cargo, línea WhatsApp propia de CNE, cola de envío real con interruptor, enlace `/d` en el mensaje, aviso en finanzas, borrar fotos) | Publicado |
| C1–C3 cuentas: la cuenta `admin` define su contraseña en el primer ingreso; roles `consul` / `coordinador` / `financiero`; las otras cuentas las crea la superadmin | Publicado |

### Cuentas

| Cuenta | Acceso | Permisos |
|---|---|---|
| superadmin | `/superadmin/acceso` | Todo, incluida la creación de las otras cuentas |
| `admin` | `/admin/acceso`; el primer ingreso pide definir la contraseña. No se toca esa cuenta ni ese flujo | Administración completa de Madrid (rol cónsul) |
| cónsul, coordinador, financiero | Los crea la superadmin en `/superadmin`. Ella escribe la contraseña inicial y elige el permiso; puede cambiarlo o desactivar la cuenta | Según el permiso: todo, solo centro de mando, o finanzas e informes |

No hay usuarios ni contraseñas de fábrica para esas cuentas. La puerta no es una cuenta: sigue siendo un enlace revocable.

### Rutas principales

`/admin` (inicio, mjrv, importar, credenciales, operadores, mando, documentos y cartel, finanzas, informes) · `/superadmin` (cuentas y roles, modo prueba, datos de demostración, preparar elección y respaldo, envíos y línea de WhatsApp, borrar fotos) · `/e/<token>` estaciones (puerta, documentación, centro de mando, finanzas) con nombre + PIN · `/d` formulario público de la cédula · `/api/salud`.

## 4. Infraestructura y despliegue

- **Servidor:** VM Oracle `ubuntu@51.170.51.109` (23 GB RAM), compartida con consulares (`citas-prod`), teinvito (`teinvito-prod`) y DEMP (`demp-whatsapp`). **Nunca tocar contenedores, redes ni volúmenes ajenos.**
- CNE vive en `/home/ubuntu/cne`, proyecto Compose `cne-prod`: `cne-postgres` (PostgreSQL 16 propio), `cne-migrate` (aplica `db/schema.sql` + `db/migrations/` + `db/grants.sql`), `cne-app` (Next.js 16, puerto 38473; une también la red `citas-prod_interna` con alias `cne-app` para el túnel y para llegar a `evolution-api:8080`), `cne-backup` (copia diaria, 14 días, en `/home/ubuntu/cne/backups`).
- **Secretos del servidor** en `/home/ubuntu/cne/.env.production` (600). `APP_MASTER_KEY` se generó allí: **no debe cambiar** porque cifra fotografías y documentos archivados. Las claves de Evolution/Brevo se copian en cada despliegue desde `/home/ubuntu/consulares/.env.production` (solo lectura).
- **Dominio:** `madrid.consulado.app`, regla añadida al túnel Cloudflare «recordatorio» (el de consulares), servicio `http://cne-app:38473`. No existe `consulares.app` en la cuenta de Cloudflare.
- **Secretos de GitHub** (pabloun2025/CNE): `ORACLE_SSH_KEY` (clave dedicada `cne_deploy`, autorizada en la VM) y `CLOUDFLARE_API_TOKEN`. Pasos para el usuario en `docs/secretos-paso-a-paso.md`.
- **Flujos de GitHub Actions** (lanzar con `workflow_dispatch`, ref `main`):
  - `oracle-deploy.yml` — entrada `accion` = `desplegar` (pasa CI y publica `main`; hace `pg_dump` previo y guarda `cne:anterior`) o `revertir` (vuelve a la imagen anterior).
  - `verificar-sitios.yml` — comprueba desde fuera `madrid.consulado.app` y que `recordatorio.consulado.app` sigue bien. **Ejecutarlo tras cada despliegue**.
  - `dominio.yml` — `comprobar` (solo lectura) / `crear` hostname en el túnel conservando las reglas existentes.
  - `oracle-inspect.yml` y `cloudflare-inspect.yml` — inspección de solo lectura.
  - `ci.yml` — tipos, lint, pruebas, compilación.
- **Procedimiento seguido en cada entrega:** trabajo en la rama → `npx tsc --noEmit -p .`, `npm run lint`, `npm test` (PostgreSQL 16 local: `pg_ctlcluster 16 main start`), `npm run build` → push de la rama → merge en `main` (se hizo con un worktree aislado) → `oracle-deploy.yml` → leer el registro (debe terminar con `{"ok":true,...}` y `cne-app (healthy)`) → `verificar-sitios.yml`.
- **Leer la contraseña inicial u otras variables:** solo Pablo, por SSH desde su Mac con `~/.ssh/cne_deploy`. Nunca imprimir secretos.
- **Render:** base `cne-madrid-db` (Frankfurt, gratuita) creada por error de enfoque y sin uso; la herramienta no permite borrarla. Pablo puede borrarla en el panel de Render; caduca sola el 17-12.

## 5. Modelo de trabajo con agentes

- `.claude/agents/cne-disenador.md` (Opus): diseña y escribe planes en `docs/diseno/`, no programa.
- `.claude/agents/cne-programador.md` (Sonnet): implementa tarea a tarea con pruebas, commit por tarea, **sin push ni despliegue** (lo hace el coordinador).
- Repositorios de referencia **solo lectura**: `pabloun2025/consulares`, `pabloun2025/teinvito`, `pabloun2025/DEMP`.

## 6. Decisiones de Pablo vigentes (18-11-2026)

- Acta = «Comprobante de pago», **modelo provisional** hasta que haya plantilla oficial. La entrega del 20-11 registra la referencia USD y el importe entregado en EUR por separado.
- Rótulo de credencial: **el que traiga el Excel** (si usa M/F: M = masculino, F = femenino, con aviso).
- WhatsApp: mismo despliegue de Evolution API de consulares, **línea propia `cne-madrid`** vinculada desde `/superadmin/envios`. Envío real **apagado** hasta que la superadmin lo encienda escribiendo `ENVIO REAL`; 20–45 s entre mensajes y pausa tras 5 fallos. La decisión del 21-11 quita el horario y el cupo diario de ambos canales.
- Puerta: segundo escaneo **amarillo**, decide el operador («Dejar pasar»); rojo = desconocida o **dada de baja**.
- Cada junta necesita **presidente, secretario y vocal**; verde solo con los tres. Orden para cubrir: suplente de la misma junta (automático, editable) → misma zona → zona más cercana (orden deducido del plano) → **votante incorporado** por el centro de mando, uno por uno.
- Traslado cuenta **al aceptarlo**. «No viable» saca a la persona de las propuestas hasta reactivarla. El sistema propone, **decide siempre el coordinador**.
- Finanzas: aviso no bloqueante si otro puesto tiene abierta la misma ficha. Imprimir **no** confirma el pago.
- Fotos de cédula: se guardan hasta que la superadmin las borre (`BORRAR FOTOS`).
- Producción directa, sin entorno de ensayo: se ensaya en **modo prueba** y luego «Borrar datos de prueba y preparar para elección».

## 7. Pendiente

### De Pablo (insumos y decisiones)
1. **Excel nominativo de MJRV.** La inspección más reciente del 21-11 encontró una ficha real activa. Contrastar el padrón con el Excel definitivo antes del lote. [Comprobación de solo lectura en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44942739405)
2. Decisión abierta **P-10**: ¿el traslado debe confirmarse cuando la persona llega físicamente? (hoy cuenta al aceptar).
3. Confirmar el **orden de cercanía de zonas** (hoy: deducido del plano) y la **distribución del QR de documentos** (hoy: cartel + enlace en el mensaje).

### Técnico (para la siguiente IA)
1. **Ensayo con dispositivos reales:** cámara y lector QR en el móvil del puesto, impresión a tamaño real de credenciales y recibo A4, y entrega de un mensaje controlado si se autoriza la prueba. Las verificaciones de esta entrega emplearon datos ficticios y cámara emulada.
2. **Dependencias.** El 21-11 `npm audit --omit=dev` señaló dos dependencias con avisos altos, `pdfjs-dist` y `xlsx`. Pendiente revisar actualizaciones y probar el visor de recibos y el importador.
3. **Respaldo de «Preparar elección»** queda en `/tmp` del contenedor (se pierde al reiniciar); la copia válida es la que se descarga. Valorar montarlo en `/home/ubuntu/cne/backups`.
4. Copias externas: las diarias quedan solo en la VM; valorar copia cifrada fuera (R2 ya se usa en teinvito).
5. Antes de preparar el padrón definitivo, identificar el recibo y el pago confirmado que consta en modo elección. Aplicar la limpieza correspondiente solo tras verificar qué datos son de ensayo. El reinicio integral es una acción explícita de Superadministración que borra ambos modos.

## 8. Documentos entregados a Pablo (no versionados, generados en la conversación)

- Memorando, ERS y descripción funcional del tablero DGSMH y portal consular (ya fuera de alcance).
- «Sistema operativo de Madrid» (4 páginas) e infografía **«Así funciona el sistema de Madrid»** (2 páginas, vigente): tres funciones principales, recorrido, tres cargos por junta, cómo se completa una junta, pago.

## 9. Traspaso a Codex (19-11-2026) — historial de la estética DEMP

Pablo pidió commit de este trabajo y que Codex se haga cargo de lo que sigue. La sección 3 está atrasada: el `main` publicado el 19-11-2026 a las 21:39 (Madrid) es `f63e6f5` (Action «Deploy to Oracle», run 14, éxito). Ese despliegue no incluye esta estética.

### Qué está hecho

Solo presentación, copiada de DEMP (repositorio de solo lectura; no se editó ningún archivo allí). Textos, rutas, permisos y reglas quedan como estaban. El protocolo unslop se aplicó a la interfaz, no al tono de los textos.

Archivos nuevos: `src/components/marca.tsx` (marca, tricolor, masthead) y `src/components/pestanas-finanzas.tsx`.

Pantallas tocadas:

- Acceso de admin y cambio de contraseña (`formulario-acceso.tsx`): hoja centrada, tricolor y marca.
- Cascarón del personal (`menu-admin.tsx`, layout del panel): barra en el móvil y menú lateral en escritorio, agrupado en Preparación, Jornada y Cierre. El rol sigue decidiendo qué enlaces se ven; el servidor sigue comprobando cada pantalla.
- Inicio `/admin`: orden del día en circuito y tarjetas de cifras.
- Finanzas, módulo de pago, escanear QR e impresión de actas: pestañas entre esas cuatro rutas.
- Panel financiero: las cifras van en tarjetas.
- Identificación de estación `/e/[token]` y cabecera del puesto.
- Formulario público `/d`: masthead. Sigue pidiendo solo el número de cédula.
- Superadmin: hoja, masthead y pestañas.
- `globals.css` y `layout.tsx`: tokens y fuentes de DEMP (Public Sans y Archivo). La banda de prueba sigue visible en modo prueba.

### Qué no se toca

- La cuenta `admin` y su primer ingreso.
- Reglas de pago, puerta y constitución de juntas.
- No añadir nombre, teléfono ni correo en `/d`.
- No imprimir secretos. No reiniciar contenedores ajenos en la VM.

### Comprobado el 19-11-2026

`npx tsc --noEmit -p .` y `npm run lint` terminaron sin errores. No se ejecutaron `npm test` ni `npm run build` en este cierre: los corre el CI del pull request. No está desplegado, así que madrid.consulado.app sigue con el aspecto anterior.

### Qué hace Codex

1. Revisar el diff: tiene que ser presentación. Si aparece un cambio de pago, puerta, constitución o de la cuenta admin, no lo una.
2. Esperar el CI en verde (`ci.yml`: tipos, lint, pruebas, compilación).
3. Unir el pull request a `main`.
4. Publicar desde `main` con la Action `oracle-deploy.yml`, entrada `accion` = `desplegar`. Después, `verificar-sitios.yml`.
5. El token de la app de GitHub que usa Cursor en el agente responde HTTP 403 en `workflow_dispatch` (le falta `actions:write`). Se probó el 19-11 y no cambió. No reintentar el disparo con ese token.
6. Pablo guardó un secreto de Cloud Agents con el nombre exacto `GH_TOKEN` (mayúsculas), token fino de GitHub para este repositorio. Esta sesión no lo ve: el secreto entra al arrancar el agente, y este ya estaba en marcha. En un agente nuevo, usarlo solo para lanzar la Action, sin imprimirlo y sin escribirlo en el repositorio. Si no está en el entorno, parar y decirle a Pablo que pulse **Run workflow** en https://github.com/pabloun2025/CNE/actions/workflows/oracle-deploy.yml con la rama `main`.


## 10. Entrega de credenciales y pagos (19-11-2026)

- **Integrado en GitHub.** `main` incorporó `4e5a60b`, con los envíos, la impresión y el circuito de pagos en EUR. Pasaron 1.033 pruebas locales en Node 22, la comprobación de tipos, la compilación y el [CI de main](https://github.com/pabloun2025/CNE/actions/runs/44629945951).
- **Producción.** El [despliegue en Oracle del 20-11-2026](https://github.com/pabloun2025/CNE/actions/runs/44678378168) terminó correctamente para `0081339`, que incluye la entrega y el traspaso. El flujo pasó el CI y la verificación de salud de CNE desde la red compartida.
- **Comprobación pública posterior.** El 20-11-2026 volvieron a funcionar el acceso a GitHub Actions y las consultas a los sitios publicados. La comprobación pública más reciente confirmó la versión posterior `1e4dba0`.
- **Comprobaciones operativas.** En Superadministración → Envíos, vincular el teléfono de CNE a la instancia `cne-madrid` de Evolution y verificar el remitente de Brevo. En Credenciales, se puede enviar desde una ficha o por junta, zona, todas las fichas activas o selección manual, por uno o ambos canales. Probar una hoja A4 con hasta 10 tarjetas de 54 × 85,6 mm a tamaño real (100 %) y comprobar el corte y el QR. Las pruebas de la entrega usaron datos sintéticos y envíos simulados.
- **Finanzas.** La configuración y el acta emplean el importe fijo en EUR. Los informes indican cuántos pagos confirmados históricos carecen de importe EUR. El total suma los importes registrados.


## 11. Búsqueda de recibos y enlaces de estación (20-11-2026)

- En **Finanzas → Recibos**, las cuentas de financiero y cónsul pueden buscar por nombre, cédula o número y descargar el PDF aunque ya exista un pago confirmado. El estado de pago corresponde al acta asociada a la confirmación. Se mantiene el modo vigente y se registra la descarga en auditoría.
- Los recibos nuevos guardan cifrada la primera página, sin las fotografías del anexo. Las firmas antiguas pueden encontrarse por nombre, cédula o referencia `FIRMA-…`. Las actas antiguas sin PDF se descargan como copias reconstruidas y advierten que usan datos de identidad de la ficha actual.
- En **Operadores → Enlaces de estación**, el cónsul puede copiar el enlace activo o preparar el mensaje en WhatsApp y elegir allí el destinatario. El mensaje contiene el enlace de estación y la indicación de usar el PIN asignado.
- **Emitir en contingencia** permite elegir una ficha o un lote de hasta 100 por nombre o junta, sin aportar fotos ni pasar por validación de cédula. Se requiere el importe en EUR y el firmante configurados para emitir un recibo nuevo. La emisión y la reimpresión dejan intactos la validación y la confirmación del pago.
- Cada ficha tiene un recibo principal por modo. Reimprimir conserva el número y el importe original. Los documentos históricos conservan su número y se pueden consultar. Si hay varios, el principal es el asociado al pago o el primero con importe EUR registrado. Un recibo histórico sin importe y sin pago se puede completar con el EUR configurado, conservando su número.
- La primera parte de la entrega es `74f3653`. Pasaron 1.056 pruebas en Node 22, tipos y compilación. Se comprobaron a 375 px la descarga, la emisión en lote, la copia al portapapeles y el texto de WhatsApp.
- El [despliegue de `1e4dba0`](https://github.com/pabloun2025/CNE/actions/runs/44687366846) aplicó el archivo de recibos y la regla de numeración única. Si se revierte a una imagen anterior tras las migraciones, sus intentos de insertar otro recibo para la misma ficha quedan bloqueados por el índice.

## 12. Operación y entrega del 20-11-2026

- **Oracle.** El despliegue de `6f18158` terminó correctamente y el endpoint público `/api/salud` devolvió esa versión y `base: ok`. [Despliegue en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44692116977)
- **Evolution.** La comprobación desde el contenedor de CNE confirmó que usa la API real y que la consulta de `cne-madrid` devuelve 404. La instancia se crea al pulsar «Vincular teléfono». La inspección registra solo los códigos HTTP y el estado, y comprobó que hay una cuenta de superadministración activa. [Inspección de Oracle](https://github.com/pabloun2025/CNE/actions/runs/44690016520)
- **Vinculación.** En la versión desplegada, abra [Superadministración → Envíos](https://madrid.consulado.app/superadmin/envios#whatsapp) en una pantalla distinta del teléfono. Pulse «Vincular teléfono» y escanee el QR desde WhatsApp → Dispositivos vinculados → Vincular un dispositivo. Tras confirmar «Vinculada», la superadministración puede habilitar el envío real con la frase `ENVIO REAL` cuando corresponda.

### Entrega publicada en Oracle

- **Commit de código:** `d6e2e96` en `main`.
- **Configuración → Envío de credenciales.** El cónsul puede consultar Evolution, vincular el móvil mediante QR y desvincularlo desde su propia sesión. Superadministración gestiona la activación de los envíos reales y el remitente de Brevo. Los estados de la API, del móvil y del envío aparecen por separado.
- **Puerta.** Ingreso manual por cédula con teclado numérico. Si la credencial capturada carece de QR, se busca primero la cédula y después los nombres y apellidos cuando es necesario. El operador confirma la coincidencia única. Un caso ambiguo requiere comprobar la identidad. El modelo de reconocimiento en español va incluido en la aplicación.
- **Credenciales.** Una lista con selección individual, múltiple o todas las coincidencias permite enviar por correo, WhatsApp o ambos y descargar un PDF, un ZIP de PDF individuales o las planchas A4. El cónsul ajusta las medidas en Configuración. Con 54 × 85,6 mm caben 11 piezas por A4 apaisado. Las planchas comparan orientaciones y filas y muestran líneas de corte. Imprima al 100 %.
- **Correo institucional de credenciales (`2083d1c`).** Los envíos individuales y en lote por Brevo usan el asunto «Su credencial de MJRV», adjuntan el PDF y destacan que puede guardarse en el móvil para mostrar el QR en puerta. La plantilla ofrece HTML y texto plano y conserva el enlace al formulario de la cédula si está configurado. Pasaron 1.121 pruebas, TypeScript y la compilación. Se revisó el HTML en Chromium a 375 y 1024 px y se comprobó el contenido de la petición a Brevo con un proveedor simulado.
- **Recibos.** Finanzas y cónsul pueden buscar y descargar uno o todos los comprobantes seleccionados en PDF o ZIP. Las copias conservan el número, los valores registrados y los importes históricos ausentes. Si un acta histórica sin pago sigue pendiente de completar en EUR, el flujo de emisión ofrece una acción explícita que conserva el número. Finanzas configura EUR entregados y la referencia USD como valores independientes. Hasta que se configure USD, su referencia queda pendiente. El total pagado se calcula en EUR.
- **Centro de mando e informes.** Pantalla completa para 95 juntas y acceso al detalle desde cada junta. Los enlaces de estación usan botones de icono con etiquetas accesibles. El informe de cierre exporta en PDF o Excel las columnas elegidas por Finanzas y excluye fotos de cédula.
- **Validación.** Pasaron 1.119 pruebas en Node 22, TypeScript y la compilación de producción. ESLint registró cero errores y una advertencia preexistente en el script de Unslop. En Chromium a 375 px se probaron puerta con vídeo sintético, el QR de vinculación, la selección y las descargas de credenciales y recibos, los informes y la copia de enlaces. El centro de mando también se comprobó en horizontal y en pantalla completa nativa de escritorio.
- **Despliegue.** Oracle publicó `232b97b`; `/api/salud` devolvió la versión y `base: ok`. La prueba de migración conservó el importe EUR anterior. Quedan pendientes el escaneo con el móvil de WhatsApp, una prueba con la cámara física de puerta y una impresión a tamaño real. [Despliegue en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44760633108)

### Estado de los canales y revisión de captura (20-11-2026)

- **Brevo.** Se configuró el nombre visible «Consulado General del Ecuador en Madrid» sobre el remitente ya verificado. La comprobación del proveedor quedó en verde. El envío real sigue apagado. [Configuración en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44763512229)
- **WhatsApp.** Evolution responde. `cne-madrid` necesita vincular el teléfono mediante QR desde Configuración → WhatsApp. Una vez vinculada, Superadministración puede encender el envío real. La inspección registró cero mensajes reales en cola en ambos canales. [Inspección en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44763260590)
- **Captura de cédula.** En Chromium con cámara emulada se reprodujo la pantalla negra al pulsar «Repetir». Se vuelve a crear el elemento de vídeo sin reasignarle el flujo. El paso directo de anverso a reverso en el formulario público sí se completó en esa prueba. Finanzas reutiliza el mismo componente al cambiar de cara. La simplificación del flujo está pendiente de las decisiones del usuario.

## 13. Circuito de los tres puestos de Madrid

- **Código.** `85d370b` en `main`.
- **Móvil.** Los enlaces activos de Puerta, Documentación y Escaneo de Finanzas abren directamente el puesto correspondiente. El escáner financiero envía la ficha a Revisión. Caja y los documentos financieros requieren una cuenta autorizada. Mando por enlace conserva su identificación.
- **Revisión y Caja.** En Finanzas → Revisar e imprimir se abre una ficha recibida desde el móvil o se busca por cédula. La captura manual conserva la señal después de «Repetir» y al pasar al reverso. El control de validación distingue prueba de elección y vuelve a pedir revisión si se sustituye una foto. En Caja se confirma cada desembolso después de la firma física y la entrega del efectivo. Los recibos de contingencia quedan pendientes hasta completar la documentación.
- **Recibo.** El formato FO-04 se imprime en una hoja A4 apaisada, con ambas caras de la cédula al pie. La primera emisión definitiva reserva un ordinal. Los números 1–190 llevan 58,82 EUR y los números 191–285 llevan 58,83 EUR, con referencia de 70,00 USD y cambio de 1,190. El total teórico es 16.764,65 EUR. Un impreso sin desembolso conserva el ordinal, el importe y el número. Las copias anteriores siguen consultables con sus referencias históricas.
- **Descargas.** Las listas de MJRV, credenciales y recibos permiten seleccionar una, varias o todas las coincidencias aptas. Las descargas individuales son PDF y las múltiples son ZIP con un PDF por persona. Las planchas permiten imprimir en conjunto. Los recibos nuevos pueden incluir las fotos vigentes al solicitar el anexo desde Finanzas.
- **Superadministración.** Gestiona cuentas, enlaces, firmante, medidas de credenciales, formulario de documentos y envíos. El cónsul puede distribuir enlaces existentes. Coordinación abre solo Mando.
- **Comprobaciones.** Pasaron 1.033 pruebas, TypeScript y la compilación. Chromium a 375 px comprobó el escaneo, la impresión A4, los ordinales 190 y 191, Caja con dos cuentas y la transición de la cámara al reverso. La migración sobre el esquema desplegado conservó los recibos históricos y la serie nueva empezó en cero.
- **Canales reales.** Oracle confirmó que WhatsApp ya está vinculado y activo y que Brevo ya está verificado y activo. La comprobación consultó los proveedores y el estado de los interruptores. [Verificación de canales](https://github.com/pabloun2025/CNE/actions/runs/44840955032)
- **Producción `4e73cb9`.** El despliegue pasó CI y aplicó las tres migraciones. El servicio publicó la versión esperada con base sana. El firmante estaba configurado y ambos canales siguieron activos después de migrar. El sitio compartido de Recordatorio respondió. [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44841286550) · [Comprobación pública](https://github.com/pabloun2025/CNE/actions/runs/44841704468) · [Comprobación de Oracle](https://github.com/pabloun2025/CNE/actions/runs/44841710769)
- **Puestos.** Se confirmaron los enlaces existentes de Puerta y Escaneo de Finanzas. Se creó y verificó el enlace de Documentación. El cónsul puede compartir los tres desde Operadores y enlaces. Las dos pantallas de escritorio están en Revisar e imprimir y Caja. [Verificación de Documentación](https://github.com/pabloun2025/CNE/actions/runs/44841835248)

## 14. Gestión de MJRV y acceso de superadministración (21-11-2026)

- **Selección y borrado.** La lista MJRV abre en «Todos los estados». Marque una ficha, varias o todas las coincidencias de los filtros. Para borrar el padrón cargado, quite los filtros, marque todas y confirme en «Borrar selección». Se detallan las fichas que conservan pagos, recibos emitidos, cargos en juntas constituidas u otra actividad que impide el borrado. El borrado conserva las revocaciones y el cómputo de la cola sin identificar a los destinatarios de los envíos eliminados.
- **Descarga y reenvío.** Una ficha activa con rótulo genera un PDF. Varias generan un ZIP con un PDF por ficha. Los nombres usan la junta de origen y la cédula con ceros iniciales, por ejemplo `H1-0000000901.pdf`. Seleccione WhatsApp, correo o ambos. Marque «Reenviar también las ya enviadas» para repetir el envío. La cola conserva el historial y evita encolar dos intentos por ficha y canal.
- **Impresión.** En «Imprimir planchas A4», seleccione las credenciales y abra las planchas. Imprima a tamaño real (100 %) y recorte por las guías punteadas. Las medidas se administran desde Superadministración. [Pantalla de impresión](https://madrid.consulado.app/admin/credenciales/imprimir)
- **Verificación.** Pasaron 1.048 pruebas, TypeScript y la compilación. ESLint registró cero errores y una advertencia preexistente en Unslop. En Chromium a 375 px se probaron la selección, el PDF, el ZIP, el reenvío simulado, el A4 y el borrado con fichas ficticias. El despliegue aplicó una migración y publicó `7251e36` con base sana. Las pruebas de borrado y envío se ejecutaron en local. [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44881590468) · [Comprobación pública](https://github.com/pabloun2025/CNE/actions/runs/44881833613)
- **Superadministración.** Se creó una segunda cuenta activa con cambio de contraseña obligatorio y se comprobó su estado tras el despliegue. Las acciones antiguas de recuperación y renombrado exigen una sola cuenta activa. Para intervenir a partir de ahora, identifique la cuenta concreta. [Diagnóstico posterior al despliegue](https://github.com/pabloun2025/CNE/actions/runs/44881833733)

## 15. Seguimiento de envíos, cadencia y lector de puerta (21-11-2026)

- **Estado por ficha.** En Credenciales → Seguimiento de envíos, el cónsul puede filtrar las fichas reales activas por canal, estado, nombre, cédula o junta. Se muestra el último intento real de cada canal. WhatsApp informa la aceptación de Evolution. Brevo informa aceptación, entrega, diferido, rebote o bloqueo. [Seguimiento de envíos](https://madrid.consulado.app/admin/credenciales/envios)
- **Brevo.** Está registrado el webhook transaccional de CNE con autenticación. El endpoint público responde 401 sin su credencial. Se recuperó el historial por el identificador de mensaje porque Brevo omitió los resultados al filtrar por etiqueta. La revisión de las 09:19 de Madrid encontró un correo entregado y un WhatsApp aceptado entre las fichas reales activas. En la instalación se consultó el historial existente y se comprobó el endpoint autenticado con una petición sin mensaje. La primera notificación automática de un envío posterior queda por verificar. [Registro y conciliación](https://github.com/pabloun2025/CNE/actions/runs/44884345350)
- **Cola.** Ambos canales pueden procesar envíos todo el día y sin cupo diario en CNE. La aplicación programa una espera aleatoria de 20 a 45 segundos para WhatsApp. El correo procesa su cola sin esa espera.
- **Puerta.** El lector se pausa al mostrar el resultado. Un QR que sigue visible se ignora hasta que salga del recuadro o aparezca otro. En Chromium a 375 px, con vídeo sintético, se confirmó una credencial sin QR por cédula, se mantuvo un QR fijo sin volver a registrar y se leyó el siguiente. La comprobación en el teléfono físico de puerta sigue pendiente.
- **Producción.** `d56246e` en Oracle. Pasaron 1.059 pruebas, TypeScript y compilación. ESLint registró cero errores y una advertencia previa de Unslop. [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44883891048) · [Comprobación pública](https://github.com/pabloun2025/CNE/actions/runs/44884174544)

## 16. Indicaciones de llegada en el correo de credenciales (21-11-2026)

- El correo individual y en lote usa el asunto «Su credencial de MJRV – 29 de noviembre de 2026». Muestra la junta de origen y el nombre y acento de su zona de color. Incluye la Caja Mágica, el nivel −2, Camino de Perales 23 y un enlace de indicaciones en Google Maps. Lleva el PDF adjunto y las instrucciones para presentar el QR y llevar la cédula.
- La hora límite de ingreso es **08:00, hora de Madrid**, confirmada por Pablo el 21-11. La instalación empieza a las 08:30, la votación se realiza de 09:00 a 19:00 y después comienza el escrutinio. El mapa indica cómo llegar al recinto por su dirección. [Horario y mapa de juntas](../ESPECIFICACION_FUNCIONAL.md)
- El correo consulta el estado del formulario público de documentación y avisa si está cerrado. Una incoherencia entre la junta y su zona se registra como fallo para revisión de la ficha.
- Pasaron 1.067 pruebas, TypeScript y compilación. ESLint registró cero errores y una advertencia previa de Unslop. Se verificaron las seis zonas, la personalización de un lote, el PDF adjunto y la vista en Chromium a 375 y 1024 px. Las pruebas de envío usaron proveedores simulados.
- **Oracle.** La versión publicada y comprobada es `e0d32a8`. Al verificarla, el formulario público mostraba «Formulario cerrado». [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44886821013) · [Comprobación pública](https://github.com/pabloun2025/CNE/actions/runs/44887072663)

## 17. Decisiones de Pablo del 21-11-2026 (interrogatorio)

- **Lista de 283 fichas:** no era la real. Se borró desde la pantalla el 21-11 a las 11:06 (Madrid); la inspección de Oracle confirma 0 fichas MJRV. El sistema está en **modo elección**.
- **Excel real:** llega hoy o mañana. Al cargarlo, revisar errores y **enviar primero a 3–5 personas** (o teléfonos de Pablo); si llega bien, al resto.
- **Traslado:** cuenta al aceptarlo (confirmado). **Orden de zonas** celeste – rojo – azul – amarillo – verde – rosado: confirmado.
- **Formulario `/d`:** queda abierto mediante el enlace fijo de la [sección 20](#20-formulario-fijo-y-guía-a4).
- **Rama `cursor/arreglos-finales-08cc`** (respaldo en disco y cambio de librería de Excel): no se integra; Pablo la borra en GitHub (la sesión no puede borrar ramas ajenas).
- **Google Wallet:** sí, terminarlo, **solo Android** (iPhone sigue con PDF y QR). Base: rama `ops/preparar-emisor-wallet-cne`; las variables `GOOGLE_WALLET_*` existen en teinvito.
- **Ensayo:** con datos reales, en modo elección; lo que quede del ensayo se revisa después.
- **Copia externa:** no hace falta.
- **Noche del 28-11:** la IA revisa con Pablo desde el servidor qué quedó del ensayo (ingresos, pagos, recibos) y Pablo confirma qué borrar.

## 18. Reinicio integral y recibos de Madrid

- **Superadministración → Borrar todo y reiniciar operativo.** Muestra el recuento por categoría y exige escribir `BORRAR TODO`. Si cambian las cifras, las vuelve a mostrar y pide confirmación. Si hay actividad que impida adquirir los bloqueos, el reinicio se cancela. La acción borra en una sola transacción la actividad y las fichas Excel, manuales y de demostración en ambos modos. Los ordinales de recibos vuelven a empezar en uno. Quedan las cuentas, los operadores, los enlaces, las 95 juntas, la configuración del formulario público, el firmante y la auditoría. El modo final es elección y los envíos reales quedan apagados. La acción no crea respaldos.
- **Recibo FO-04.** La plantilla oficial fija circunscripción «Europa, Asia y Oceanía», país «España», oficina «Consulado General del Ecuador en Madrid», zona «Madrid» y dirección domiciliaria «Madrid». Las pruebas verifican emisión, reimpresión, contingencia y reconstrucción. La inspección visual comprobó un A4 apaisado con ambas fotos dentro de sus recuadros. Los PDF históricos ya archivados se conservan como originales.
- **Impresión.** Revisión y el archivo de recibos muestran la vista previa y permiten imprimir, abrir o descargar el PDF. El navegador intenta abrir su cuadro de impresión al quedar lista la vista. El botón manual reutiliza el mismo documento. Caja confirma el pago después de la firma física y de la entrega del efectivo. Se abrió el cuadro de impresión en Chrome, Edge y Firefox de escritorio para Linux, con el FO-04 apaisado en una página. Queda pendiente la prueba con la impresora física del puesto en Windows o macOS.
- **Comprobaciones locales.** Pasaron 1.110 pruebas, TypeScript y la compilación. ESLint registró cero errores y una advertencia previa en Unslop. PostgreSQL aislado permitió importar Excel ficticios, registrar actividad en ambos modos, simular un fallo de auditoría y verificar la concurrencia, la configuración preservada y la nueva emisión desde el ordinal uno. Se probó también con un propietario sujeto a RLS. Superadministración se comprobó a 375 y 1440 px. En Finanzas, contra la compilación de producción local, la emisión y la reimpresión generaron una sola acta y cero pagos.
- **Oracle.** Producción confirmó `3b399fd` con la base sana. El formulario público permaneció abierto. La comprobación posterior confirmó una ficha real activa antes y después del despliegue, la línea CNE vinculada y TeInvito, Evolution y Recordatorio en servicio. Los borrados y pagos ficticios se probaron exclusivamente en la base aislada. [CI](https://github.com/pabloun2025/CNE/actions/runs/44907006468) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44907184190) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44907572677) · [Inspección de Oracle](https://github.com/pabloun2025/CNE/actions/runs/44907575646)

## 19. Credenciales por zona y alta manual

- En MJRV → Nueva ficha se elige el cargo oficial, la serie H o M y un número correspondiente a esa serie. El recinto determina la zona. El alta no pide rótulo. La edición de una ficha importada conserva su rótulo y conserva el cargo original cuando se guardan otros cambios.
- Los PDF individuales, los ZIP y las planchas A4 muestran el nombre de la zona debajo del rótulo grande y aplican el color de la zona al rótulo y a la silueta. El QR conserva la cédula y las planchas conservan las guías de corte. Si falta el rótulo, se usa la junta también al enviar y al abrir Google Wallet. Las fichas incorporadas desde votantes no generan credenciales.
- Pasaron 1.124 pruebas, TypeScript y la compilación. ESLint registró cero errores y la advertencia previa de Unslop. Se verificó el alta a 375 px y se leyeron los seis QR de una plancha A4 renderizada con fichas ficticias. Las pruebas de envío y Wallet usaron proveedores simulados.
- Oracle publicó `483db2f`. Madrid respondió con la versión esperada y la base sana. Recordatorio respondió después del despliegue. [CI](https://github.com/pabloun2025/CNE/actions/runs/44909373213) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44909373432) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44909702876)

## 20. Formulario fijo y guía A4

- El formulario público de cédula abre en `/d` en ambos modos. El antiguo interruptor se retiró de Superadministración. El correo y WhatsApp enlazan directamente al formulario. La consulta pública sigue mostrando iniciales y junta y conserva el límite de peticiones por IP. Las fotos se cifran al guardarlas. [Formulario público](https://madrid.consulado.app/d)
- Cónsul y Superadministración pueden abrir la guía A4 desde Documentos de identidad o Configuración. La guía explica cómo fotografiar las dos caras y cómo firmar el recibo impreso y cobrar en Caja. Incluye el QR, el enlace en texto y los importes según la emisión de los recibos. [Guía A4 en CNE](https://madrid.consulado.app/admin/documentos/cartel)
- Pasaron 1.116 pruebas, TypeScript y la compilación. En Chromium a 375 px se completó la carga de las dos caras con una ficha ficticia y el ajuste antiguo desactivado. Se verificaron la página A4 y la lectura del QR desde la guía en blanco y negro.
- Oracle publicó `4da3625`. La base respondió correctamente y `/d` abrió sin iniciar sesión. Recordatorio respondió tras el despliegue. [CI](https://github.com/pabloun2025/CNE/actions/runs/44911307858) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44911308043) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44911574121)

## 21. Cédula o pasaporte para el pago

El criterio de identificación de esta primera entrega fue corregido en la [sección 22](#22-cédula-como-identificador-y-foto-de-pasaporte).

- En `/d`, la persona busca su ficha por el número registrado en el padrón, confirma sus iniciales y junta y elige el documento antes de abrir la cámara. La cédula requiere anverso y reverso. El pasaporte requiere su número y una sola foto de la página con los datos y el retrato. Si el número del pasaporte difiere del número de la ficha, se registra aparte para el recibo. [Formulario público](https://madrid.consulado.app/d)
- Documentación y Finanzas ofrecen la misma elección. Las fotos se cifran y las vistas previas requieren una cuenta autorizada. Cambiar de documento sustituye las fotos del otro tipo en el modo activo y obliga a revisar la identidad otra vez. El FO-04 sigue en una sola hoja A4 horizontal y lleva el anexo del documento elegido.
- Si cambia el documento de un recibo pendiente, Caja espera a que Revisión valide la identidad y reimprima. La reimpresión conserva el número, el importe y la fecha. Si el recibo ya está firmado o pagado, se conserva el PDF archivado.
- El PDF de la guía, el correo institucional y WhatsApp explican las dos opciones. La guía conserva el QR de acceso. La sección 23 recoge el importe que se comunica a los MJRV. [Guía A4 en CNE](https://madrid.consulado.app/admin/documentos/cartel)
- En Chromium a 375 px se completaron ambas opciones del formulario público y el envío desde Documentación con fichas ficticias. En escritorio se verificaron la vista previa privada, la validación y descarga del FO-04. Tras sustituir el pasaporte, Caja pidió reimprimir y habilitó el siguiente paso con el mismo número de recibo.
- Pasaron 1.122 pruebas, TypeScript y la compilación de producción. ESLint informó cero errores y la advertencia previa de Unslop. Se revisaron visualmente la guía y el recibo ficticio y se leyó el QR desde la guía renderizada.
- Oracle publicó `938a77f`. Madrid respondió con la versión esperada y la base sana. El formulario mostró la nueva búsqueda sin iniciar sesión y Recordatorio respondió después del despliegue. Las pruebas emplearon fichas ficticias y proveedores simulados. [CI](https://github.com/pabloun2025/CNE/actions/runs/44917132780) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44917144489) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44917523163)

## 22. Cédula como identificador y foto de pasaporte

- La cédula del padrón identifica al MJRV en el formulario, el QR y el recibo. En la ausencia de la cédula física, la opción «Pasaporte» abre directamente la captura de una sola foto de la página de datos. El correo, WhatsApp y la guía A4 explican el mismo recorrido. [Formulario público](https://madrid.consulado.app/d) · [Guía A4 en CNE](https://madrid.consulado.app/admin/documentos/cartel)
- La migración conserva las fotos y los números que ya se guardaron. Las cargas nuevas solo guardan la foto del pasaporte. Si un recibo pendiente se emitió con el número de pasaporte, Revisión lo reimprime con la cédula y el mismo número, importe y fecha antes de que Caja confirme. Las copias archivadas de recibos firmados o pagados conservan su contenido.
- Pasaron 1.123 pruebas en PostgreSQL aislado, TypeScript y la compilación. ESLint registró cero errores y la advertencia previa de Unslop. En Chromium a 375 px se completaron ambas capturas y la estación de Documentación. En escritorio se descargó un recibo A4 con la cédula en el campo de identificación y la foto del pasaporte al pie. Se revisaron visualmente la guía y un recibo ficticio y se verificó el QR impreso.
- Oracle publicó `616bbbf`. La base respondió correctamente, `/d` mostró «Número de cédula» y Recordatorio respondió. Las pruebas funcionales emplearon datos ficticios y proveedores simulados. [CI](https://github.com/pabloun2025/CNE/actions/runs/44919837854) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44919838546) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44920186260)

## 23. Importe comunicado a los MJRV

- La guía A4 comunica una compensación de 58,82 €. Los tramos se aplican en la emisión de recibos y Caja, con el importe efectivo de cada desembolso. El formulario y las plantillas de correo y WhatsApp dan las instrucciones de documentación. [Guía A4 en CNE](https://madrid.consulado.app/admin/documentos/cartel)
- Pasaron 1.123 pruebas, TypeScript y la compilación. ESLint registró cero errores y la advertencia previa de Unslop. Se comprobó que la ruta autorizada genera una sola página A4 con 58,82 € como único importe y que el QR impreso abre el formulario fijo.
- Oracle publicó `ba7a089`. Madrid respondió con la versión esperada y la base sana. La verificación pública también confirmó que Recordatorio responde. [CI](https://github.com/pabloun2025/CNE/actions/runs/44920751049) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44920751599) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44921112204)

## 24. Cédula o pasaporte en el correo

- El correo pide llevar «su cédula o pasaporte». Las instrucciones de correo y WhatsApp indican qué fotos corresponden a cada documento. El acceso al formulario sigue usando el número de cédula. Pasaron las 20 pruebas de envíos, TypeScript y ESLint en los archivos modificados.
- Oracle publicó `98550d8` y Madrid respondió con la versión esperada. Brevo aceptó la muestra corregida solicitada por Pablo, con una credencial ficticia. [CI](https://github.com/pabloun2025/CNE/actions/runs/44937072801) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44937072690) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44937433111)

## 25. Alta visible y encuadre de puerta

- En MJRV, «Crear nueva ficha» aparece como acción principal sobre las opciones de importar e imprimir. A 375 px ocupa el ancho disponible. Se comprobó que abre el formulario a 375 y 1440 px. Oracle publicó `1d47fa1`. [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44937618622) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44937910864)
- En Puerta, el visor más bajo deja a la vista los botones de ingreso manual. El recuadro amarillo toma la proporción configurada de la credencial (54 × 85,6 mm por defecto). El recorte coincide con el área que ve el operador y OCR procesa los bloques de texto por separado. Si falta cédula legible, se compara el nombre completo. Una coincidencia requiere confirmación.
- Pasaron 1.123 pruebas, TypeScript y la compilación. ESLint informó cero errores y la advertencia previa de Unslop. En Chromium a 375 × 667 px se usaron fotogramas de una credencial ficticia para comprobar cédula, nombres y apellidos, botones visibles y confirmación. Tras mantener un QR 5,5 segundos se leyó un segundo QR distinto sin duplicar el primero. La comprobación con un teléfono físico en Puerta sigue pendiente.
- Oracle publicó `1fd7f39`. Madrid respondió con la versión esperada y la base sana. La verificación pública confirmó también que Recordatorio responde. [CI](https://github.com/pabloun2025/CNE/actions/runs/44938569944) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44938570287) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44938947457)

## 26. Mapa numérico del Centro de mando

- Las juntas empiezan en H1 de Amarillo · Hombres y siguen en orden numérico por las filas. El vial este agrupa amarillo, azul, rojo y celeste. El vial norte agrupa verde y rosado con la entrada señalada entre ambos. Los filtros conservan las posiciones del mapa y la vista completa muestra las 95 juntas.
- Pasaron 1.124 pruebas, TypeScript y la compilación. ESLint informó cero errores y la advertencia previa de Unslop. En Chromium se verificaron las 95 tarjetas y los indicadores sin desplazamiento a 1366 × 768, 1024 × 600, 375 × 667, 320 × 568, 667 × 375 y 568 × 320. También se abrió el detalle de H1 desde pantalla completa y se comprobó la salida con Escape y la conservación del filtro.
- Oracle publicó `f0d4d9a`. Madrid respondió con la versión esperada y la base sana. La verificación pública confirmó también que Recordatorio responde. [CI](https://github.com/pabloun2025/CNE/actions/runs/44939538285) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44939538351) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44939831398)

## 27. Preparación de Madrid y acciones principales

- El recuento del 21-11 en Oracle mostró 95 juntas, una ficha real activa, un recibo y un pago confirmado en modo elección. El firmante está configurado y el remitente de Brevo está verificado. La línea de WhatsApp aparece vinculada. Los dos interruptores de envío real están apagados. [Recuento y Brevo](https://github.com/pabloun2025/CNE/actions/runs/44942739405) · [Línea de WhatsApp](https://github.com/pabloun2025/CNE/actions/runs/44942530937)
- Se aplicaron las pautas de diseño frontend y Unslop a los botones operativos. Buscar en Revisión, Imprimir en el visor y Descargar recibos usan el estilo principal. Revisión y Caja dan mayor superficie al paso principal en móvil. En Credenciales, Enviar tiene el estilo principal y la descarga usa un botón con borde.
- El Centro de mando se organiza por color y conserva el orden numérico desde H1. Las tarjetas resaltan el número de junta y muestran el estado con una franja estrecha. En pantalla completa el selector permite ampliar una zona y volver a ver las 95 juntas.
- Se verificaron el orden numérico, la ampliación de zona y las 95 juntas sin desplazamiento en los seis tamaños de la sección anterior. Los botones de trabajo se comprobaron a 375 y 1440 px con fichas ficticias. Pasaron 1.124 pruebas, TypeScript y la compilación.
- Para preparar la jornada falta cuadrar el padrón definitivo y resolver el pago que figura en elección. La prueba presencial pendiente incluye el móvil de Puerta, fotos con el móvil de Documentación y una impresión a tamaño real de la credencial y del recibo. Activar los canales elegidos cuando el padrón esté confirmado.
- Oracle publicó `6cc6558`. Madrid respondió con la versión esperada y Recordatorio respondió tras la publicación. [CI](https://github.com/pabloun2025/CNE/actions/runs/44943306558) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44943306712) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44943610756)

## 28. Vista de trabajo por zona en el Centro de mando

- La pantalla de trabajo abre en Amarillo · Hombres. Los seis botones permiten cambiar de zona y el filtro acota las juntas visibles por estado. Las tarjetas tienen el mismo tamaño dentro de la vista, muestran el número de junta en grande y etiquetan los recuentos de presentes y faltantes.
- «Vista general de las 95 juntas» abre el tablero completo. Los seis grupos mantienen el orden numérico y todas las fichas se pueden abrir desde ambas vistas. En Chromium a 1366 × 768 caben las 95 juntas sin desplazamiento. A 1024 × 600, 375 × 667 y 320 × 568 se admite desplazamiento vertical. En los cuatro tamaños se comprobaron el tamaño uniforme de las fichas, los filtros, la apertura del detalle y el regreso a la zona seleccionada.
- Pasaron 1.124 pruebas automatizadas, TypeScript y la compilación de producción. ESLint informó cero errores y la advertencia previa de Unslop.
- Firefox también pasó el recorrido a 1366 × 768 y 375 × 667. Madrid respondió con la versión `4fe809c` y la base sana. Recordatorio respondió tras la publicación. [CI](https://github.com/pabloun2025/CNE/actions/runs/44944802986) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44944803381) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44945155809)

## 29. Guía de fotos y actas de contingencia del 29 de noviembre

- El correo electoral reúne la junta, la zona, la entrada a las 08:00, Google Maps y el QR de la credencial. El botón abre el formulario fijo y el enlace secundario abre una guía A4 ilustrada. El número de cédula sirve para buscar la ficha con cualquiera de los dos documentos. El aviso «Listo» aparece al guardar ambas caras de la cédula o la única foto de la página del pasaporte donde sale el retrato. Antes de ir al punto de pago, la persona debe ver ese aviso. [Guía A4 pública](https://madrid.consulado.app/d/guia)
- Finanzas → Recibos ofrece «Descargar PDF de contingencia» en «Actas para completar a mano». Genera un FO-04 A4 apaisado por ficha activa del padrón, con datos del MJRV, sin fotos, fechado el 29 de noviembre de 2026. El número y el importe en euros quedan en blanco. La descarga queda en auditoría y no crea recibos ni pagos ni consume números. La emisión numerada conserva sus controles. Los recibos nuevos y las copias archivadas servidas muestran fecha sin hora. El original archivado se conserva.
- Pasaron 1.151 pruebas, TypeScript y la compilación. ESLint registró la advertencia previa de Unslop y cero errores. En Chromium a 375 px se probaron el correo y ambas rutas de captura con fotos ficticias. Se descargó la contingencia desde Recibos a 375 y 1366 px, se revisaron ambas plantillas de recibo y se generaron 285 hojas ficticias en un archivo.
- Oracle publicó `21f24c7`. Madrid respondió con la versión esperada y la base sana. La guía pública devolvió un PDF A4 de una página. Recordatorio respondió tras la publicación. [CI](https://github.com/pabloun2025/CNE/actions/runs/44950842107) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44950842153) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/44951203318)

## 30. Dos líneas de WhatsApp y dirección de respuesta

- Superadministración → Envíos permite vincular por QR las dos líneas del Evolution ya instalado. La primera conserva la instancia `cne-madrid` y sus ajustes. La segunda usa `cne-madrid-2` y nace apagada. Hace falta escanear su QR con el segundo WhatsApp y encender su envío real.
- Credenciales permite filtrar por Hombres o Mujeres, marcar las fichas y escoger manualmente el número que envía. La cola y el historial conservan la línea elegida. Cada línea aplica su propia cadencia, interruptor y pausa. Los envíos existentes quedan en la línea 1. La protección contra duplicados sigue operando por ficha y canal.
- El campo «Dirección para recibir respuestas» de Correo · Brevo queda con `consuladoecmad@gmail.com`. Se puede editar sin cambiar el remitente verificado.
- Pasaron 1.156 pruebas, TypeScript y la compilación. ESLint mostró la advertencia previa de Unslop. En Chromium a 375 px se marcó cada serie y se seleccionaron líneas distintas con dos fichas de prueba. Se comprobó que el servidor persistió las líneas elegidas y que el campo de correo muestra la dirección de respuesta. No hubo envíos de prueba reales.
- Oracle publicó `e7f6dff`. Madrid respondió con esa versión y la base sana. Recordatorio también respondió. [CI](https://github.com/pabloun2025/CNE/actions/runs/45154112157) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45154111461) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/45154941413)

## 31. Panel operativo de WhatsApp

- Credenciales → Envíos de WhatsApp reúne las dos líneas, sus recuentos de cola, aceptados y fallidos, el próximo intento y el seguimiento por persona. Los recuentos se actualizan cada 10 segundos mientras una cola activa tiene trabajo. La selección por serie, junta, zona o ficha queda junto a los números remitentes.
- El cónsul puede pausar y reanudar una línea desde el panel. Un intento en curso puede terminar. La pausa conserva los mensajes pendientes y no cambia el interruptor de envío real. Superadministración conserva la vinculación, los interruptores y la gestión de las pausas por fallos.
- Se comprobó en Chromium a 375 y 1366 px la navegación, la selección, la pausa, la reanudación y el envío con fichas ficticias. No hubo envíos de prueba reales.
- Pasaron 1.166 pruebas, TypeScript y la compilación de producción. ESLint informó cero errores y la advertencia previa de Unslop.
- Oracle publicó `3d24070`. Madrid respondió con esa versión y la base sana. El panel dirige al acceso si no hay sesión. Recordatorio siguió respondiendo. [CI](https://github.com/pabloun2025/CNE/actions/runs/45162065372) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45162066079) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/45162657042)

## 32. Excel de entregas y bandeja de WhatsApp

- Credenciales → Seguimiento de envíos descarga un Excel del último intento real por ficha y canal. Tiene hojas de resumen, entregados, rechazos y fallos, y sin confirmar. Incluye destino, línea de WhatsApp y motivo cuando se conoce.
- Credenciales → Bandeja de WhatsApp muestra respuestas nuevas de texto de las dos líneas. Se guardan cifradas y se asocian a una ficha activa cuando el teléfono identifica a una sola persona. Superadministración puede activar la recepción en cada línea con un webhook propio, sin reemplazar el webhook de otro servicio.
- Los acuses de WhatsApp se cruzan por línea e identificador del proveedor. No alteran el estado de la cola. Un acuse de entrega o lectura se refleja en Seguimiento y el Excel. El historial anterior de los chats se consulta en los teléfonos porque Evolution no lo guarda en el servidor.
- La inspección de Oracle del 23-11 mostró 156 envíos pendientes. Se mantuvo la versión de producción y se dejó la publicación pendiente para preservar la cola. Tampoco se activaron los webhooks de producción. [Inspección de solo lectura](https://github.com/pabloun2025/CNE/actions/runs/45168686158)
- Pasaron 1.202 pruebas en base ficticia, TypeScript, ESLint con la advertencia previa de Unslop y la compilación de producción. Chromium a 375 px confirmó la descarga autenticada, la recepción de una respuesta ficticia y el acuse de una línea, con rechazo de un token de otra línea.

## 33. Reimpresión A4 con las letras F y M

- Credenciales → Imprimir planchas A4 muestra F para las juntas femeninas y M para las masculinas, a partir de la junta asignada. Conserva número, zona, tamaño, guías de corte y QR. El cambio se aplica a la salida en planchas A4.
- Brevo aceptó una única muestra de corrección para Pablo con una credencial F1 ficticia. La prueba usó el remitente institucional anterior al resultar inactivo el remitente configurado en la consulta de Brevo. El ajuste de producción se conservó. [Envío de muestra](https://github.com/pabloun2025/CNE/actions/runs/45209550112)
- Antes de preparar la publicación, Oracle mostró 64 envíos pendientes en la línea 1 y 34 en la línea 2. Ambas estaban desconectadas y en pausa, sin envíos en curso. [Inspección de solo lectura](https://github.com/pabloun2025/CNE/actions/runs/45209614677)
- Pasaron las 23 pruebas específicas de credenciales. En Chromium se abrió una plancha con dos fichas ficticias. El PDF A4 mostró M1 en amarillo y F1 en rojo, con guías punteadas.
- Oracle publicó `94ad233`. Madrid sirvió esa versión y la verificación pública pasó. Tras el despliegue quedaron los mismos 64 y 34 WhatsApp pendientes y ambas líneas en pausa. La versión también incluye el Excel de seguimiento y la bandeja descritos arriba. La recepción por webhook sigue pendiente de activación por línea. [CI](https://github.com/pabloun2025/CNE/actions/runs/45210059821) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45210060615) · [Colas tras el despliegue](https://github.com/pabloun2025/CNE/actions/runs/45210789693)
- Brevo aceptó el envío individual de corrección a las 280 fichas activas con correo válido, usando el remitente verificado `avisos@consulado.app`. La ficha restante carecía de correo válido. El webhook confirmó 247 entregas y 33 rechazos o fallos de entrega a las 17:16 (Madrid). Cada envío quedó en Seguimiento. El lote no realizó envíos de WhatsApp. [Campaña](https://github.com/pabloun2025/CNE/actions/runs/45214336603) · [Recuento de Brevo](https://github.com/pabloun2025/CNE/actions/runs/45214645850)
- Se generó la plancha corregida del padrón real con 281 credenciales, 47 páginas A4 y tamaño configurado de 74 × 100 mm por credencial.

## 34. Rectificación de WhatsApp del 23 de noviembre

- Los envíos pendientes conservan su posición y línea. La cola genera la credencial corregida al enviar: F para femenino y M para masculino. Google Wallet toma la misma letra de la junta asignada. El historial, Seguimiento y el Excel identifican los avisos de rectificación.
- Cada turno adjunta el PDF corregido. Si Evolution aceptó el envío anterior, el texto indica la junta correcta y aclara que se conserva la asignación. Los demás reciben el mensaje normal. Se distingue la aceptación de la entrega confirmada.
- El recuento previo dio 182 avisos y 98 PDF pendientes, con un número sin WhatsApp. El comando de operación `scripts/ops/preparar-rectificacion-whatsapp.ts` distingue los modos `comprobar` y `preparar`. Valida la pausa de ambas líneas, usa el candado de la cola y guarda el lote en una transacción auditada. Una segunda ejecución devuelve el recuento aplicado.
- La preparación coloca ambas líneas en pausa manual. Cuando los teléfonos ya estén vinculados y corresponda enviar, el cónsul puede pulsar «Reanudar» por cada línea en Credenciales → Envíos de WhatsApp. La cola usa su cadencia normal.
- Oracle publicó `b38c5f3`. Pasaron 1.204 pruebas, TypeScript, ESLint sin errores con la advertencia previa de Unslop y la compilación. [CI](https://github.com/pabloun2025/CNE/actions/runs/45222135695) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45222132946) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/45222924762)
- Se encolaron los 182 avisos y se conservaron los 98 pendientes para enviar el PDF corregido. A las 18:01 (Madrid), la línea 1 tenía 158 pendientes y la línea 2 tenía 122. Ambas seguían desvinculadas y en pausa manual, con cero intentos. Se excluyó un número sin WhatsApp. [Aplicación](https://github.com/pabloun2025/CNE/actions/runs/45222918488) · [Recuento de Oracle](https://github.com/pabloun2025/CNE/actions/runs/45222977629)
- Pablo confirmó que los 280 turnos deben adjuntar el PDF corregido. Los 182 marcados para rectificación llevan ese texto en el mismo mensaje que el PDF. Los 98 restantes llevan el texto normal. Se conservó la cola existente. Brevo confirmó la entrega del PDF corregido a la ficha cuyo número no tiene WhatsApp. [Verificación de cobertura](https://github.com/pabloun2025/CNE/actions/runs/45227996921)
- Oracle publicó `2e4873f`. Pasaron 1.203 pruebas, TypeScript y la compilación. ESLint mostró solo la advertencia previa de Unslop. A las 18:32 se verificaron los mismos 280 turnos (158 y 122), ambas pausas manuales y cero intentos. [CI](https://github.com/pabloun2025/CNE/actions/runs/45228094896) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45228095203) · [Cola](https://github.com/pabloun2025/CNE/actions/runs/45228740597) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/45228746250)

## 35. Cotejo del padrón de Madrid del 23 de noviembre

- Se actualizaron en producción la cédula de una ficha y el nombre de otra, conservando sus identificadores internos. Dos direcciones coincidían con el padrón después de normalizar espacios junto al punto del dominio. La hoja indicaba «No tiene correo» para la quinta ficha. Se verificaron los cinco resultados contra la hoja.
- Brevo confirmó la entrega de ambos PDF actualizados, enviados individualmente con la copia oculta solicitada. Los cinco turnos existentes de WhatsApp se conservaron y toman los datos vigentes al generar el PDF. Ambas líneas quedaron en pausa manual con 280 turnos y cero intentos. [Envíos y cotejo](https://github.com/pabloun2025/CNE/actions/runs/45242594583) · [Cola](https://github.com/pabloun2025/CNE/actions/runs/45242599818)

## 36. Cadencia y pausa de WhatsApp

- Cada línea espera de 90 a 150 segundos al azar entre intentos reales. El próximo intento se guarda en la base. Se mantiene la lista de destinatarios y cada turno conserva su línea. Con las dos líneas activas y sin interrupciones, los 280 turnos actuales tardarían aproximadamente 5 horas y 15 minutos.
- Ante el primer HTTP 429, 401 o 403 de Evolution, CNE conserva el intento fallido en el historial y pausa la línea para revisión en Superadministración. Los demás turnos de esa línea quedan en espera. La cadencia disminuye el ritmo de envíos y el proveedor puede seguir aplicando restricciones.
- Oracle publicó `980a78f` tras 1.205 pruebas, TypeScript, ESLint (advertencia previa de Unslop) y la compilación. A las 21:52, hora de Madrid, las líneas seguían desvinculadas y en pausa manual, con 158 y 122 turnos respectivamente y cero intentos de envío. [CI](https://github.com/pabloun2025/CNE/actions/runs/45263240567) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45263241378) · [Cola](https://github.com/pabloun2025/CNE/actions/runs/45263885518) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/45263889662)

## 37. Documentos e impresión por selección en Finanzas

- En Finanzas → Documentos se separan los expedientes pendientes y completos. Los filtros de nombre, cédula y junta ayudan a localizar fichas. Al abrir una ficha se muestran las fotos del modo actual y se pueden capturar las faltantes con el mismo selector de cédula o pasaporte. La vista previa y la carga requieren cuenta de Finanzas o de cónsul. Los cambios de modo invalidan una captura abierta.
- En Finanzas → Recibos → Imprimir por selección se marcan uno, varios o todos los resultados. El FO-04 sin anexo aprovecha el espacio para las firmas. La numeración automática conserva el número y el importe al reimprimir. La opción en blanco usa el 29 de noviembre de 2026 y deja libres el número y el importe en euros. Esta última opción no reserva números ni registra cobros.
- Un recibo abre la vista previa y el diálogo de impresión cuando el navegador lo permite. Un lote descarga un único PDF, con una página A4 horizontal por ficha. Caja sigue exigiendo documentación completa y validada.
- Oracle publicó `974c614`. Pasaron 1.208 pruebas, TypeScript, la compilación y ESLint con la advertencia previa de Unslop. En Chromium a 375 y 1366 px se comprobaron el acceso con cuenta financiera, la carga de un pasaporte y el reverso de una cédula con fotos ficticias, el visor individual y los PDF de lote en los dos modos de numeración. Al publicar, la cola de WhatsApp mantenía 158 y 122 turnos en pausa. [CI](https://github.com/pabloun2025/CNE/actions/runs/45359239461) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45359237655) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/45359852823)

## 38. Encuadre y confirmación del ingreso en Puerta

- El visor de Puerta se adapta al alto del dispositivo. El recuadro conserva las proporciones de la credencial configurada y coincide con el recorte del lector de texto. «Ingreso manual por cédula» e «Ingreso por nombre» quedan encima del visor.
- Durante 2,5 segundos, un ingreso válido muestra «OK», el número de junta con las letras impresas en la credencial y el nombre y el color de la zona vigente. El fondo verde indica que el ingreso se registró. El color de zona aparece en un punto sobre blanco, incluso en la zona roja. La baja y la revocación se muestran con «Ingreso no autorizado».
- El formulario público de documentos conserva el enlace fijo y muestra la junta con F para femenino y M para masculino después de buscar por cédula. Puerta usa los mismos rótulos, tanto al verificar una ficha por texto como al confirmar un ingreso.
- Oracle publicó `962ac57`. Pasaron 1.208 pruebas, TypeScript, la compilación y ESLint con la advertencia previa de Unslop. En Chromium se vieron los botones manuales a 320, 375 y 390 px en vertical, 667 × 375 en horizontal y 1366 × 768 en escritorio. Se verificaron el aviso de junta roja y amarilla, el rechazo, OCR real sobre fotogramas ficticios, la permanencia de un QR durante 5,5 segundos sin duplicado y el siguiente QR. Con fichas ficticias se comprobó F/M en el formulario antes de elegir documento. [CI](https://github.com/pabloun2025/CNE/actions/runs/45369583375) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45369583594) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/45370249544)

## 39. Letras F y M en todas las pantallas (Claude, 24-11)

- Regla: la letra que ve y escribe el usuario es M (masculino) o F (femenino). La base conserva `serie` H (hombres) y M (mujeres); no cambió el esquema ni los datos. La conversión se hace al mostrar (`juntaEnCredencial`, `formatoPublicoJunta`, `juntaPublicaSql` en SQL) y al leer lo que escribe el usuario (`leerJuntaPublica`: M y H son masculino, F es femenino).
- Primero lo que llega al ciudadano: recibo FO-04 (también el de contingencia), texto y nombre del PDF del correo y de WhatsApp, y el rótulo de la credencial. El rótulo sale siempre de la junta asignada (`rotuloPublico`). Un rótulo guardado con forma de junta («H12», «M5», «F05») ya no se usa; solo se respeta un texto libre. En producción las 281 fichas tienen el rótulo con la letra antigua: no hace falta tocarlo.
- Pantallas internas: Centro de mando (tarjetas, lectura de pantalla, «Amarillo · Masculino», ficha de junta, propuestas y traslados), lista y ficha MJRV, formulario de ficha (M · Masculino / F · Femenino), filtros por junta en MJRV, Credenciales, Recibos y traslado manual, Finanzas (resumen, escaneados, documentos, recibos pendientes), Revocar, Seguimiento de envíos y los Excel e informes que salen de ellos. Un filtro «M5» es masculino 5 y «F5» femenino 5.
- Importador del Excel: la letra del archivo es siempre pública. Un archivo con solo «M1…» crea la serie H. «H» se acepta como masculino. Se quitó el aviso de «nomenclatura M/F» y las pruebas se ajustaron.
- Cola de envíos: no guarda texto ni PDF; el PDF y el mensaje se generan al enviar con el código nuevo. Los 280 turnos pendientes (línea 1: 158; línea 2: 122) salen con F/M sin tocar datos.
- Solo los recibos ya emitidos con anexo guardado pueden conservar su PDF cifrado original; si lleva la letra antigua hay que reimprimirlo con la ficha. No se tocó ninguno.
- Opcional, sin ejecutar: `scripts/ops/normalizar-rotulos.ts` (`comprobar` / `aplicar`) reescribe `rotulo_credencial` con la letra pública y deja auditoría. No lo aplique antes de enviar la rectificación de WhatsApp, porque esa preparación compara el rótulo guardado con el correcto.
- Comprobaciones: tsc sin errores, ESLint 0 errores (advertencia previa de Unslop), 1.213 pruebas, compilación. Nuevas: recibo F/M, mando M/F, filtro «M5» y «F5», importador con solo «M1», rótulos guardados «H12»/«M5», script de rótulos.
- **Nota para Codex:** su trabajo local sin subir sobre F/M queda sustituido por este. Antes de continuar haga `git fetch && git reset` a origin/main (o descarte sus cambios locales de F/M).

## 40. Comprobación de la cola, barrido F/M y guías rápidas con QR (Claude, 24-11)

- **Comprobación de la cola sin enviar.** `prepararContenidoEnvio` (`src/server/envios/contenido.ts`) arma el texto, el rótulo y el PDF de la credencial; la cola lo usa al enviar y la comprobación lo usa igual, sin cambiar el comportamiento. `scripts/ops/comprobar-cola-fm.ts` recorre todos los envíos `en_cola` reales (no simulados, fichas no de prueba) sin llamar a Evolution ni a Brevo y sin escribir en la base. Imprime solo recuentos por línea y tipo (normal o rectificación): total, letra M con serie interna H, letra F con serie M, texto libre, incoherentes y texto con la serie interna. Sale con código 1 si hay incoherencias. En WhatsApp el rótulo siempre sale de la junta asignada, así que el «texto libre» solo puede aparecer en el correo.
- **Workflow `comprobar-cola-fm.yml`** (manual, solo lectura). Copia el script a la VM, lo pasa al contenedor y lo ejecuta con `tsx`. Necesita que el código desplegado ya incluya `src/server/envios/comprobar-cola.ts`: ejecútelo después de publicar.
- **Barrido F/M.** No se encontró otra salida visible con la serie interna. Los archivos que aún arman `serie || numero` o `${x.serie}${...}` (`finanzas.ts`, `recibos.ts`, `documentos.ts`, `puerta.ts`, `movimientos.ts`, importador y datos de prueba) los convierten con `formatoPublicoJunta` antes de la pantalla o no llegan a ella. `tests/barrido-serie-interna.test.ts` falla si aparece ese patrón fuera de una lista explícita, si se usa `etiquetaJunta(` fuera de la comparación del rótulo guardado o si una pantalla rotula una serie con Hombres o Mujeres.
- **Guías rápidas con QR.** `src/server/pdf/guias.ts` genera las 7 guías A4 (pdf-lib) con el texto de las guías de Codex. La guía 1 ya no lleva el recuadro «Serie del padrón» ni la frase de las letras anteriores; deja «Junta: M = masculino · F = femenino». Cada guía lleva QR de al menos 36 mm. Los QR de puesto usan el enlace de estación activo más reciente de cada función (`enlaces_estacion`, token descifrado como «Ver QR») y la nota «Acceso directo al puesto. Requiere nombre y PIN…». Sin enlace activo sale un recuadro «Sin enlace activo: créelo en Operadores». Guías 1, 2 y 7 llevan además QR a las pantallas de administración; la 4, el QR a `/d`.
- **Descarga.** `/admin/operadores/guias` (solo cónsul) lista las guías; `/admin/operadores/guias/[n]` descarga una (1 a 7) o `todas` (un PDF de 7 páginas). Botón «Guías rápidas con QR» en Enlaces de estación. Registrada en la matriz de permisos (cónsul y superadmin en la ruta; solo cónsul en la página). Cada descarga queda en auditoría (`guia_descargada`) con el número de guía y cuántas funciones tenían enlace, nunca el token. Si se crea o se revoca un enlace, hay que volver a descargar las guías.
- Los textos de origen están en `.tmp-guias/` (ignorada por Git, no se versiona).
- Comprobaciones: tsc sin errores, ESLint 0 errores (advertencia previa de Unslop), 1.235 pruebas, compilación. Nada publicado ni ejecutado en producción.

## 41. Entrega de guías con QR y comprobación del archivo de recibos (24-11)

- Se conservó el borrador de las guías en la rama local `codex/guias-rapidas` (`6240105`). La entrega parte de `ef368e1`, versión ya publicada al retomar el trabajo. Se revisaron las salidas M/F y se actualizó la especificación que todavía mostraba letras anteriores. Los rótulos guardados se conservan para la rectificación de WhatsApp.
- En **Cónsul → Enlaces de estación → Guías rápidas con QR** se puede descargar cada hoja, un ZIP con los siete PDF o un PDF de siete páginas. La generación exige la cuenta de cónsul incluso por URL directa. Cada QR del puesto toma el enlace activo más reciente de su función. Todos miden 36 mm. Centro de mando identifica al operador por nombre y PIN. El PDF pide volver a descargar la guía si se revoca un enlace, y la pantalla indica cuándo pedir uno a Superadministración. Los PDF y el ZIP se sirven sin caché. El registro de auditoría guarda el formato y el número de puestos con enlace.
- La consulta de solo lectura encontró **0 actas, 0 archivos cifrados y 0 firmas PDF** anteriores al fin del despliegue F/M (24-11 a las 12:16:55, Madrid), en ambos modos. El ZIP de guías y la consulta se comprobaron con datos ficticios. [Recuento de producción](https://github.com/pabloun2025/CNE/actions/runs/45488971178)
- Si aparece posteriormente un caso histórico, usar **Finanzas → Recibos → Reimprimir** con las fotos disponibles del documento original. CNE reconstruye con la plantilla vigente y emplea el ordinal, la fecha y los importes del recibo ya emitido. Si faltan las fotos, **Imprimir por selección → Automática** permite generar la copia sin anexo de una ficha con recibo definitivo existente. Conservar cualquier PDF firmado original. La copia no exige repetir el desembolso.
- En Chromium a 375 y 1366 px se comprobó el acceso desde Enlaces de estación, la descarga privada y el rechazo de solicitudes anónimas. Se revisaron visualmente las siete hojas y se decodificaron sus 15 QR desde el PDF renderizado a 150 ppp con destinos ficticios.
- La revisión adicional corrigió los avisos y errores del importador que aún podían mostrar letras antiguas. Se usa la junta asignada en todas las credenciales aunque el Excel traiga texto libre. El comprobador de la cola marca como incoherente el turno sin credencial o con una junta distinta de la asignada.
- Oracle publicó `5073b61`. Pasaron 1.237 pruebas, TypeScript y la compilación de producción. ESLint terminó sin errores, con la advertencia anterior de Unslop. El verificador confirmó Madrid y Recordatorio. Los tres formatos de descarga rechazaron el acceso anónimo en producción. [CI](https://github.com/pabloun2025/CNE/actions/runs/45490390846) · [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/45490389710) · [Verificación pública](https://github.com/pabloun2025/CNE/actions/runs/45491053438)
- A las 22:26 (Madrid), Puerta, Documentación, Escáner de Finanzas y Centro de mando tenían un enlace activo cada uno. Se reconstruyeron el mensaje y el PDF de los 280 turnos en cola solo para comprobar su contenido. La línea 1 tenía 158 turnos F (64 normales y 94 de rectificación) y la línea 2 tenía 122 turnos M (34 normales y 88 de rectificación), con cero incoherencias y cero intentos en esos turnos. Ambas líneas seguían desvinculadas, con el envío real apagado y en pausa manual. La vinculación y la reanudación quedan a cargo de Pablo. [Enlaces y recuentos](https://github.com/pabloun2025/CNE/actions/runs/45490397614) · [Contenido de la cola](https://github.com/pabloun2025/CNE/actions/runs/45491059080) · [Estado de las líneas](https://github.com/pabloun2025/CNE/actions/runs/45491064782)
