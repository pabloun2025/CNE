# 02 · Pantallas y flujos

Rutas **visibles** (lo que escribe el usuario en su host). Internamente viven bajo `src/app/p/<portal>/`. Todas las pantallas: diseño a 375 px primero; en escritorio se ensanchan (tablas, mapa). Banda «MODO PRUEBA» cuando corresponda. Cada acción de escritura se valida en el servidor; la tabla «Servidor valida» lista lo que debe comprobar además de la sesión y el portal (comprobados siempre por `requirePortal`).

Elementos comunes: `<Cabecera>` (portal, contexto, operador, «Cambiar…», «Salir»), `<EstadoConexion>` (último envío confirmado / sin conexión / borradores), `<Aviso tono="ok|error|info">`, `<BotonConfirmar>` (desactiva doble clic), `<EstadoVacio titulo texto accion>`.

---

## A. Portal consular — `HOST_CONSULAR` (§5, §11)

| Ruta | Pantalla | Acciones | Servidor valida | Estado vacío / errores |
| --- | --- | --- | --- | --- |
| `/acceso` | Correo + contraseña | Entrar | límites de intentos; usuario tipo `consulado` activo; mensaje genérico | «Correo o contraseña incorrectos.» |
| `/cambiar-contrasena` | Contraseña actual + nueva ×2 | Guardar | ≥ 8 caracteres; distinta de la temporal; obligatoria si `debe_cambiar` (C-01) | — |
| `/operador` | «¿Quién opera desde este dispositivo?» campo nombre | Continuar | 2–80 caracteres; se guarda en la sesión | Se muestra tras el acceso y con «Cambiar operador» |
| `/telefono` | Teléfono operativo del consulado precargado | «Es correcto» / «Actualizar» | formato libre 6–30 caracteres; actualiza `consulados.telefono_operativo` y `telefono_confirmado_en`; auditoría | Solo aparece si no se confirmó hoy (fecha de Quito) — no a cada operador (§11.1) |
| `/recinto` | Lista de recintos del consulado con nº de JRV | Elegir | el recinto pertenece al consulado (C-03, C-04) | Un solo recinto: se elige solo y se muestra en cabecera. Sin recintos: «Su consulado no tiene recintos cargados. Avise a la superadministración.» |
| `/` | **Jornada** (panel combinado §11.2) | ver abajo | — | Sin JRV: «Este recinto no tiene juntas cargadas.» |
| `/avance/[hito]` | Actualizar JRV de un hito | individual o grupo con excepciones | ver abajo | — |
| `/votantes` | Cifra vigente + formulario | Guardar | entero ≥ 0; método `firmas`/`estimacion` obligatorio; recinto activo | «Todavía no se ha informado ninguna cifra.» |
| `/incidencias` | Lista del recinto (abiertas primero) + «Reportar incidencia» | abrir ficha | — | «No hay incidencias registradas en este recinto.» |
| `/incidencias/nueva` | Formulario breve | Registrar / Registrar y pedir apoyo / Pedir apoyo urgente | ver abajo | Catálogo vacío: solo «Otro» con texto (P-15) |
| `/incidencias/[id]` | Ficha compartida con Quito | Resolver JRV, Cerrar, Reabrir, Pedir apoyo, Nota | ver abajo | — |
| `/historial` | Vigente por hito y JRV, con quién y cuándo | Corregir (abre `/avance/[hito]?jrv=`) | corrección libre sin motivo (§5) | — |
| `/borradores` | Lista local (no del servidor) | Enviar / Descartar / Enviar todos | idempotencia por `client_id` | «No hay borradores pendientes en este dispositivo.» |

### A.1 Jornada `/` (cuatro áreas, §11.2)
1. **Situación:** consulado · recinto activo · hora local del recinto (calculada por el servidor y avanzada en cliente) · fase vigente · nº JRV · mini-resumen «Inicio 12/12 · Cierre 3/12 …».
2. **Acción principal:** un botón grande con el primer hito de la secuencia que no está completo en todas las JRV y que está habilitado para al menos una JRV. Ej.: «Registrar cierre de votación (9 de 12 pendientes)». Si ninguno está habilitado: texto del motivo («El escrutinio se habilita a las 19:00, hora local»).
3. **Siempre útiles:** «Reportar incidencia», «Actualizar votantes» (desde el inicio), «Sin novedades en esta fase», «Ver / corregir reportes». «Solicitar apoyo a Quito» está dentro de la incidencia.
4. **Conexión:** «Último envío confirmado hh:mm» y, si hay, «N borradores sin enviar →».
Secuencia visible: Instalación → Sufragio → Cierre de votación → Escrutinio → Escaneo → Cierre del proceso; futuras atenuadas con candado y motivo.

**Fase vigente (solo etiqueta, §4 Horas):** antes de 09:00 local «Instalación»; 09:00–19:00 «Sufragio»; desde 19:00 la del primer hito incompleto. En modo prueba la etiqueta se calcula igual pero nada se bloquea.

### A.2 Actualizar hito `/avance/[hito]`
- Recintos con ≤ 10 JRV: lista con tres botones por JRV (Completada / Pendiente / Sin información) y su estado actual.
- Recintos con > 10 JRV: casillas para elegir JRV + «Marcar completadas»; luego paso «Excepciones: ¿alguna sigue pendiente?» para marcar pendientes expresas. Botón «Seleccionar todas las habilitadas».
- **Resumen antes de guardar (§11.3):** «Recinto X · Hito Y · 8 pasarán a completadas · 2 pendientes · 2 no se tocan».
- JRV no habilitadas aparecen desactivadas con su motivo (C-11).
- **Servidor valida:** cada JRV pertenece al recinto activo y al consulado; hito válido; en modo elección: secuencia (el hito anterior está `completada` para esa JRV) y regla de escrutinio (19:00 local + cierre de esa JRV); las JRV que no cumplen se devuelven como `rechazadas` con motivo y las demás se guardan (operación por JRV, respuesta con listas `guardadas` / `rechazadas`, §16.5). Corrección a `pendiente`/`sin_informacion` siempre permitida (§5). `client_id` repetido → mismo resultado.

### A.3 Incidencia nueva
Campos: fase (preseleccionada la vigente), tipo (catálogo de la fase + «Otro»), alcance (recinto entero / elegir JRV; propuesto por el tipo), prioridad (sugerida por el tipo, editable), descripción (obligatoria con «Otro», opcional si no). Tres botones: «Registrar», «Registrar y pedir apoyo», «Registrar y pedir apoyo URGENTE» (este último con confirmación «Quito recibirá un aviso sonoro»).
**Servidor valida:** JRV del recinto; descripción ≤ 1.000; con «Otro», descripción ≥ 3; crea incidencia + actuación `apertura` + (opcional) `solicitudes_apoyo` + actuación `apoyo_solicitado`; `client_id` único. Respuesta: «Incidencia INC-0042 registrada. Apoyo urgente: emitido.»

### A.4 Ficha de incidencia (compartida, §12.5)
Cabecera: INC-id, estado, prioridad, fase, tipo, alcance, solicitud de apoyo (emitida / recibida por <nombre> a las hh:mm), seguimiento DGSMH. Historial de actuaciones en orden. Acciones del consulado: «Marcar JRV resueltas» (elige subconjunto + explicación obligatoria → `resolucion_parcial`; si no quedan JRV abiertas → `cerrada`), «Cerrar» (explicación obligatoria), «Reabrir» (mismo id, explicación opcional), «Pedir apoyo» (normal/urgente; no si hay una solicitud abierta), «Añadir nota», «Cambiar prioridad».
**Servidor valida:** incidencia del consulado; explicación ≥ 3 caracteres al resolver o cerrar (§6); reabrir solo si `cerrada`; ninguna acción toca `reportes_hito` (§11.6).

### A.5 Borradores (§11.7)
Cada envío pasa por `enviarOperacion(op)`: `fetch` con 15 s de límite → si falla, guarda `{client_id, ruta, cuerpo, recinto, fase, resumen, creado_en}` en `localStorage` y avisa. `/borradores` muestra fecha original (para que se vea que un borrador antiguo puede pisar un dato posterior) y envía uno a uno. Estados visibles: «Guardado en este dispositivo», «Enviando…», «Confirmado por el servidor hh:mm», «Error: <mensaje>».

---

## B. Tablero DGSMH — `HOST_DGSMH` (§6, §12)

| Ruta | Pantalla | Acciones | Servidor valida |
| --- | --- | --- | --- |
| `/acceso`, `/cambiar-contrasena` | Como consular, tipo `dgsmh` | — | — |
| `/` | **Tablero**: mapa dominante + panel lateral | ver abajo | lectura global |
| `/consulado/[id]` | Ficha consulado: teléfono operativo, recintos con avance por hito (suma real), votantes (método), incidencias | ir a recinto | — |
| `/recinto/[id]` | Ficha recinto: hora local, JRV × hitos (cuadrícula con estado y texto), última actividad, «sin novedades» recientes, incidencias | — | — |
| `/incidencias` | Filtros: Urgente sin acuse · Recibido/en seguimiento · Incidencias abiertas · Cerradas | abrir | — |
| `/incidencias/[id]` | Ficha compartida | Recibido, Marcar seguimiento, Nota/actuación, Resolver JRV, Cerrar, Reabrir | explicación obligatoria al resolver/cerrar; `Recibido` solo si solicitud `emitida`; registra usuario DGSMH |
| `/informes` | Ámbito (mundo / consulado / recinto) + «Descargar PDF» / «Descargar Excel» | generar | excluye toda tabla de Madrid (Q-14) |

### B.1 Tablero `/` (§12.1)
- **Cabecera:** «Jornada 29-11-2026» · hora de Quito y UTC · «Actualizado hace 6 s» · enlace Informes.
- **Mapa (≈ 70 % del ancho en escritorio):** proyección Natural Earth, países en gris claro, **capa noche** (hemisferio opuesto al sol, opacidad 0,25) y crepúsculo (dos franjas de 6°, opacidad 0,1); marcadores por consulado con color de estado + icono + número; a escala mundial se agrupan los que se solapan (< 18 px) en un círculo con el nº de consulados y el peor estado. Zoom con rueda/pellizco y botones + / − / «Mundo». Clic en grupo → acerca; clic en consulado → panel con sus recintos (y sus JRV al elegir recinto) sin salir del mapa. Deslizador «Ver luz solar a otra hora» (−12 h … +12 h) que **solo** mueve la capa solar (Q-04); botón «Ahora».
- **Estados del marcador (texto + color + icono):** «Sin información» (gris, círculo vacío) · «En progreso» (azul) · «Con incidencias abiertas» (ámbar, triángulo) · «Apoyo urgente» (rojo, campana) · «Proceso cerrado» (verde, visto). Prioridad del peor: urgente > incidencias > sin información > progreso > cerrado.
- **Panel lateral (≈ 30 %):** (1) **Urgentes sin acuse** — tarjeta por solicitud: consulado, recinto, tipo, hace cuánto, teléfono operativo (enlace `tel:`), botón **«Recibido»**; sonido repetido cada 20 s mientras haya alguna sin acuse; botón «Silenciar sonido» (solo este dispositivo); si el navegador bloquea el audio, aviso visual «Pulse para activar el sonido» (Q-10). (2) **Faltan actualizaciones esperadas** (solo si hay margen configurado, P-16): «Falta actualización esperada: Inicio — Recinto X (hora local 09:47)». (3) **Indicadores:** por hito «completadas/total (porcentaje)», recintos sin información, incidencias abiertas por prioridad, votantes informados (suma, indicando cuántos recintos son estimación).
- **A 375 px:** pestañas «Alertas» (por defecto si hay urgentes) · «Mapa» · «Indicadores».
- Ubicaciones aproximadas se dibujan con borde discontinuo; consulados sin coordenadas aparecen en la lista «Sin ubicación en el mapa» del panel (§12.2).

### B.2 Informes (§6, §12.6)
PDF (pdf-lib, A4 vertical): portada con «Informe de seguimiento de la jornada — corte hh:mm (Quito) / UTC», ámbito, aviso «No es acta electoral ni resultado oficial del CNE»; resumen mundial por hito (completadas/total, %); votantes (cifra y método); recintos sin información; incidencias por estado/prioridad; urgencias y acuses; tabla por consulado y por recinto con horas del primer y último reporte de cada hito. Excel: hojas `resumen`, `recintos`, `jrv_hitos`, `incidencias`, `actuaciones`, `votantes`. Estados escritos: «confirmado», «pendiente expreso», «sin información», «estimación».

---

## C. Madrid — `HOST_MADRID` (§7, §13)

### C.1 Administración (cuenta `madrid_admin`)
| Ruta | Pantalla | Acciones | Servidor valida | Vacío |
| --- | --- | --- | --- | --- |
| `/acceso`, `/cambiar-contrasena` | — | — | tipo `madrid_admin` | — |
| `/` | **Inicio**: credenciales preparadas/pendientes, ingresados, JRV con 3+, incompletas, documentos completos, pagos confirmados, total EUR (§13.1). Dos bloques: «Apertura de juntas» y «Pagos» | enlaces | — | «Cargue el Excel de MJRV para empezar.» |
| `/mjrv` | Tabla filtrable (junta, rol, estado credencial/llegada/documentos/pago); búsqueda por apellidos o cédula | Nueva ficha, Importar, abrir | — | ídem |
| `/mjrv/importar` | Subir Excel → vista previa con errores/advertencias por fila → Aplicar | Aplicar | ver 01 §8 | — |
| `/mjrv/[id]` | Ficha: identidad, cargo original y rol, junta de origen y vigente, contacto, credencial, llegada, movimientos, documentos (miniaturas solo admin), acta y pago | Editar, Dar de baja / reactivar, Descargar credencial, Enviar por WhatsApp/correo | cédula única; junta existe; baja no borra historial (§13.2) | — |
| `/credenciales` | Selección (todas / por junta / por zona / sin generar / sin enviar) | «PDF individual» (1), «Hoja A4» (n, 10 por hoja), «Enviar por WhatsApp», «Enviar por correo» | fichas activas con `rotulo_credencial` resuelto; envío solo con teléfono/correo; no encola dos veces la misma persona y canal si hay uno `en_cola` | Juntas sin rótulo: aviso «Falta el rótulo de credencial de N juntas» (P-5) |
| `/envios` | Estado por persona y canal: en cola / enviada al servicio / falló (motivo) / entregada (solo si el proveedor la confirma) + modo real/simulado | Reintentar fallidos | — | — |
| `/operadores` | Lista de operadores (nombre, funciones, activo) y de enlaces (función, etiqueta, activo) | Alta operador (nombre, funciones, PIN 4 dígitos ×2), Restablecer PIN, Desactivar; Crear enlace (muestra URL + QR una vez y desde «Ver QR»), Revocar enlace | PIN `^\d{4}$`; nombre único entre activos; revocar invalida sesiones de estación del enlace | «Cree al menos un enlace de puerta y un operador.» |
| `/documentos-qr` | QR genérico de documentación: «Descargar cartel A4» (QR grande + instrucciones) | Crear/rotar enlace `documentos_publico` | — | — |
| `/mando` | Centro de mando (igual que estación, C.3) | — | — | — |
| `/finanzas` | Panel financiero (C.5) y **Parámetros de pago** | Guardar parámetros | importes > 0; si falta uno, el acta solo sale como «BORRADOR — importe pendiente» y no se confirma pago (F-09) | «Parámetros de pago pendientes de aprobación.» |
| `/informes` | Informe de cierre Madrid PDF/Excel (§13.9) | Descargar | — | — |

### C.2 Estación: entrada común `/e/[token]`
1. El servidor busca el enlace por hash: inexistente/revocado → «Este enlace ya no está activo. Pida uno nuevo a la administración.» (+ auditoría).
2. Pantalla de identificación: función («Puerta 1»), lista de nombres de operadores activos con esa función, teclado numérico grande para el PIN.
3. Correcto → cookie `cne_estacion` y redirección a `/e/[token]/trabajo`. Fallo → «PIN incorrecto. Le quedan N intentos.»; bloqueo tras 5.
Cabecera de estación: función · operador · conexión · «Cambiar operador». Sin menú hacia otras funciones (§13.10).

### C.3 Puerta (§7.2, §13.4)
Pantalla única: vídeo de cámara a pantalla casi completa (botón «Activar cámara» = toque que desbloquea audio), resultado superpuesto 1,5 s y vuelta automática a lectura, contador «Ingresos de hoy: N (este puesto: M)», campo «Escribir cédula» (entrada manual controlada).
- Válida: fondo verde, «Válida», apellidos + nombres + junta vigente («H12 · Amarillo»), pitido agudo (copiado de `door-feedback.ts`).
- Rojo + dos pitidos graves + motivo: «Ya registró su ingreso a las hh:mm» / «QR no reconocido» / «Credencial dada de baja».
- Error de operación (sin cámara, sin red): fondo gris «No se pudo comprobar. Repita la lectura.» — nunca rojo de rechazo (§13.4).
- Antirrebote: la misma lectura en < 3 s se ignora en cliente; el servidor es idempotente (01 §5).
- No muestra fotos, pagos ni listas (§16.2).

### C.4 Centro de mando (§7.3, §13.5–13.6) — admin o estación `mando`
- **Indicadores:** ingresados / total MJRV · JRV con 3+ disponibles · JRV incompletas · JRV sin nadie · suplentes transferibles.
- **Fichas (95):** cuadrícula de tarjetas «H12» con franja del **color de zona**, estado con color **y** texto («3 presentes» verde / «Faltan 2» ámbar / «Nadie» rojo), icono ⇄ si hubo movimiento. Filtros: «Faltan miembros» (por defecto, orden: faltan 1 → faltan 2 → nadie), «Con suplentes transferibles», «Completas», «Todas»; agrupar por zona o por serie.
- **Propuesta (un movimiento a la vez):** tarjeta fija arriba: «Trasladar a APELLIDO, Nombre (suplente, H07 Amarillo) → H15 Amarillo. Motivo: H15 tiene 2 presentes; H07 quedaría con 4.» Botones grandes: **Aceptar** · **Siguiente propuesta** · **No viable** (motivo: no responde / se niega / no está / otro). Sin propuestas: «No hay suplentes transferibles para las juntas incompletas.»
- **Ficha de junta (clic):** miembros asignados de origen (llegó / no llegó / trasladado a…), recibidos por traslado, suplentes; acciones «Mover manualmente a…» (elige persona disponible y destino; mismo registro con `manual = true`) y «Marcar no disponible» / «Quitar excepción» (excepciones).
- **Servidor valida al aceptar:** la persona está ingresada, sin excepción, sigue en la junta de origen indicada, el origen conserva ≥ 3 disponibles tras el traslado (§13.6) salvo movimiento manual con confirmación explícita «El origen quedará con N», destino distinto. Si algo cambió: «La situación cambió. Se calculó una nueva propuesta.»
- Nunca escribe en tablas consulares (§13.5).

### C.5 Documentos: QR genérico `/d/[token]` (público) y estación `documentacion` (§7.4, §13.7)
1. «Escriba su número de cédula» → servidor (`mjrv_para_documentos`): coincidencia → «Encontramos la ficha de J. P., junta H12. ¿Es usted?»; si no → «No encontramos esa cédula. Pida ayuda al personal.». Límite: 10 consultas por IP cada 15 min y 5 cédulas distintas por dispositivo (§16.2).
2. **Anverso:** cámara trasera con recuadro de proporción ID-1 (85,6 : 54); captura automática cuando la imagen está quieta y nítida ~1 s (ver T38); botón «Tomar foto» siempre visible; vista previa «Usar esta foto / Repetir».
3. **Reverso:** igual; el servidor rechaza si su hash coincide con el anverso.
4. «Listo. Sus dos fotos se guardaron.» Sin mostrar después las imágenes en el formulario público.
Recorte al recuadro y JPEG ≤ 1.600 px en el cliente; el servidor re-codifica con `sharp` (quita EXIF), cifra y guarda. La estación de documentación hace lo mismo sin enmascarar el nombre y puede sustituir fotos.

### C.6 Finanzas (estación `finanzas`, §7.5, §13.8)
Pantalla de lectura (QR o cédula escrita) → **Ficha de pago** con semáforo de requisitos:
- Identidad: ficha activa ✔ · Documentos: anverso ✔ reverso ✘ («Capturar ahora» abre la captura en el mismo puesto) · Pago previo: no ✔ · Parámetros de pago: completos ✔/✘.
- Si otro puesto la tiene abierta: aviso no bloqueante «Lo está atendiendo <operador> desde hh:mm» (P-8).
- Casilla obligatoria: «He verificado que cumplió sus funciones» (§7.5, F-04).
- Botón **«Generar e imprimir acta»** (azul) → PDF en pestaña nueva (2 páginas); registra `actas_pago`; segunda vez → «REIMPRESIÓN 2».
- Tras imprimir, aparece separado y de otro color el botón **«Confirmar pago entregado»** con diálogo: «Confirme que el acta está firmada y el dinero entregado: 000,00 EUR a APELLIDO, Nombre». Resultado: «Pago confirmado hh:mm por <operador>».
- Ya pagado: banda roja «YA PAGADO el hh:mm por <operador>, 000,00 EUR. No vuelva a pagar.» (F-07).
- **Servidor valida:** función del enlace `finanzas`; documentos completos para generar acta definitiva; parámetros completos (si no, acta «BORRADOR» y confirmación rechazada); confirmación atómica (01 §5); el acta indicada pertenece a la persona.

### C.7 Panel financiero (admin `/finanzas`, §13.9)
Tarjetas: pagados · pendientes · documentación incompleta · total entregado EUR (solo confirmados). Tabla: persona, junta vigente, estado (documentación incompleta / lista / acta preparada / pagada), EUR, hora, operador. Sondeo 5 s. Informe de cierre PDF/Excel: mismas columnas + totales + hora de corte; sin fotos (§13.9).

### C.8 Acta de pago provisional (documento, §7.5, guía §6)
**Página 1**
- Banda superior gris: «MODELO PROVISIONAL — PENDIENTE DE APROBACIÓN». En modo prueba, marca de agua diagonal «PRUEBA — SIN VALIDEZ».
- Título: «RECIBO DE PAGO A MIEMBRO DE JUNTA RECEPTORA DEL VOTO». Subtítulo: «Elecciones Seccionales y CPCCS 2027 · Jornada del 29 de noviembre de 2026 · Madrid». Sin logotipos ni referencias legales (no aportados).
- 1 · Datos del recibo: nº interno (`MAD-000123`; en prueba `PRUEBA-000123`), lugar (parámetro), fecha y hora de emisión (Madrid), «Original» o «REIMPRESIÓN n».
- 2 · Persona receptora (de la ficha MJRV importada, sin reteclear): apellidos, nombres, cédula, cargo según registro, junta asignada y junta de trabajo vigente si difiere.
- 3 · Importe: importe de referencia USD · tipo de cambio aplicado y sentido («1 USD = x EUR» o «1 EUR = x USD») · **importe entregado EUR** · regla de redondeo aplicada. Si faltan parámetros: «IMPORTE PENDIENTE DE APROBACIÓN — BORRADOR» y no hay cifras.
- 4 · Declaración (texto provisional): «La persona receptora declara recibir en efectivo el importe indicado en euros.»
- 5 · Firmas: dos recuadros — «Pagador» (nombre y cargo de parámetros; firma) y «Receptor» (nombre y cédula impresos; firma).
- Pie: «Generado por el sistema operativo de Madrid el dd/mm/aaaa hh:mm por <operador>. La impresión de este documento no registra el pago.»
**Página 2 — Anexo: documento de identidad**: cabecera con nombre, cédula y nº de recibo; anverso y reverso (cada uno ≈ 120 × 76 mm) con rótulo. Mismas marcas provisional/prueba.

### C.9 Credencial CR80 (documento, §7.1, §13.3) — maqueta pendiente de visto bueno (P-6)
Vertical 54 × 85,6 mm, recreada en código según el PDF modelo (de arriba abajo, medidas en mm desde el borde superior, margen lateral 3):
- 3–21: logotipo «CNE · ELECCIONES SECCIONALES Y CPCCS 2027 · Tu voto, tu decisión» (imagen extraída del modelo, ancho 46).
- 22–35: banda azul `#1F5FA8` con «MIEMBRO / DE JUNTA / RECEPTORA / DEL VOTO» en blanco, Helvetica Bold 8,5 pt, centrado.
- 36–54: rótulo grande (`rotulo_credencial`) Helvetica Bold hasta 40 pt (se reduce para caber en 34 mm de ancho); **negro** si la junta es de hombres, **rojo `#E00000`** si es de mujeres (como el modelo); a la derecha pictograma vectorial masculino/femenino 9 × 17 mm (según la serie de la junta, P-5).
- 55–60: cargo en mayúsculas (`cargo_original` normalizado, p. ej. «PRESIDENTE»), Helvetica Bold 9 pt.
- 61–83: a la izquierda (32 mm de ancho) tres recuadros de borde `#F4B183` con APELLIDOS, NOMBRES y CÉDULA (valores reales, Helvetica Bold 7 pt, reducción automática hasta 5 pt y dos líneas como máximo); a la derecha **QR 17 × 17 mm** con la cédula (nivel de corrección M, margen 1 módulo).
- Hoja A4: credenciales **giradas 90°** en 2 columnas × 5 filas = **10 por hoja** (85,6 × 54 mm cada hueco; márgenes 19,4 / 13,5 mm), líneas de corte grises de 0,2 pt en los bordes de cada hueco. (Sin girar caben 9.)
- En modo prueba: franja diagonal «PRUEBA» sobre la credencial.

---

## D. Superadministración — `HOST_ADMIN` (§14)

| Ruta | Pantalla | Acciones | Servidor valida |
| --- | --- | --- | --- |
| `/acceso` → `/verificacion` | Contraseña y luego código TOTP (o código de recuperación) | — | 2FA verificada en la sesión para todo lo demás |
| `/alta-2fa` | Primer acceso: QR `otpauth://` + códigos de recuperación (una vez) | Confirmar con un código | — |
| `/` | Estado: modo (prueba/elección) con interruptor, recuentos de catálogo, cuentas, últimos errores, envío real WhatsApp/correo (solo lectura de variables), versión desplegada | — | — |
| `/modo` | Interruptor «Modo prueba» con confirmación escrita (`MODO PRUEBA` / `MODO ELECCIÓN`) | Cambiar | auditoría |
| `/preparar-eleccion` | Resumen de lo que se borra y se conserva → escribir `PREPARAR ELECCIÓN` → resultado | Ejecutar | ver 00 §8 (S-03…S-06) |
| `/catalogo` | Consulados → recintos → JRV con avisos (sin zona horaria, sin coordenadas, sin JRV, zona cerrada/suspendida) | Importar catálogo, Exportar | — |
| `/catalogo/importar` | Vista previa + aplicar | — | 01 §8 |
| `/cuentas` | Consulados (cuenta, último acceso), DGSMH, Admin Madrid | Importar cuentas consulares, Crear DGSMH / Madrid admin, Restablecer contraseña temporal (se muestra una vez), Desactivar | tipo coherente; contraseña ≥ 8 |
| `/incidencias-tipos` | Lista por fase | Importar CSV | — |
| `/parametros` | Margen de alertas por ausencia (vacío = desactivado) | Guardar | 1–600 min |
| `/auditoria` | Últimos 500 eventos con filtros | — | sin datos personales de Madrid |

La superadmin **no** ve fichas MJRV, fotos ni pagos (§14.1); ve solo recuentos de Madrid en `/`.

---

## E. Flujos clave de extremo a extremo

1. **Puesta en marcha (antes del 29):** superadmin importa catálogo y cuentas → envía contraseñas temporales a los consulados (fuera del sistema) → admin Madrid importa MJRV → genera hojas A4 y las imprime → encola envíos WhatsApp/correo → crea operadores y enlaces → imprime cartel del QR de documentos → todos prueban en **modo prueba** → la noche del 28 la superadmin ejecuta «Preparar elección».
2. **Consulado el 29:** acceso → operador → teléfono → recinto → «Inicio» de JRV → votantes durante el día → incidencias si las hay → desde 19:00 cierre/escrutinio/escaneo por JRV → cierre del proceso.
3. **Quito el 29:** tablero abierto todo el día; urgente → «Recibido» + llamada → actuaciones → cierre con explicación; informes a horas de corte.
4. **Madrid el 29:** puerta escanea → mando completa juntas con propuestas → MJRV fotografía su cédula con el QR del cartel → al terminar, finanzas: QR → verificación → acta → firmas y efectivo → confirmar pago → informe de cierre.
