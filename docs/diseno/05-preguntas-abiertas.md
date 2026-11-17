# 05 · Preguntas abiertas para Pablo

Solo lo que bloquea o condiciona la construcción. Una pregunta por bloque, con opciones, recomendación y qué se hace mientras tanto (la construcción **no se detiene** por ninguna).

| # | Bloque | Necesaria antes de | Bloquea |
| --- | --- | --- | --- |
| P-1 | Dominio y subdominios | T04 (18-11) | Primer despliegue visible |
| P-2 | Base de datos en la VM | T04 (18-11) | — (hay opción por defecto) |
| P-3 | Número de WhatsApp para credenciales | T20 real (23-11) | Envío real por WhatsApp |
| P-4 | Remitente de correo | T20 real (23-11) | Envío real por correo |
| P-5 | Rótulo grande de la credencial (M01/F01 frente a H/M) | Impresión real (22-11) | Credenciales reales |
| P-6 | Maqueta de la credencial | Impresión real (22-11) | Credenciales reales |
| P-7 | Importe, tipo de cambio, redondeo y acta | 27-11 | Confirmar pagos reales |
| P-8 | Dos puestos de finanzas con la misma persona | T42 (25-11) | — |
| P-9 | Segundo escaneo y credencial bloqueada en puerta | T18 (21-11) | — |
| P-10 | Confirmación física del traslado | T38 (25-11) | — |
| P-11 | Motor de propuestas e IA; cercanía de zonas | T38 (25-11) | — |
| P-12 | Distribución del QR de documentos | T39 (25-11) | Cartel |
| P-13 | Catálogo consular real | T50 (cuanto antes) | Portal consular y tablero reales |
| P-14 | Excel nominativo de MJRV | T50 (cuanto antes) | Todo Madrid real |
| P-15 | Catálogo de incidencias | 26-11 | Desplegable de incidencias |
| P-16 | Alertas por actualización ausente | 26-11 | Alertas de ausencia |
| P-17 | Bloqueos horarios adicionales | T22 (21-11) | — |

---

**P-1 · Dominio y subdominios** (§2, §18.2)
La especificación propone `consulares.app`, pero el túnel que hay en la VM sirve `recordatorio.consulado.app` (sin «es»). Para añadir hostnames al túnel con el flujo `dominio.yml`, la zona debe estar en la misma cuenta de Cloudflare y el token debe poder editarla.
- **A.** `consulares.app` en la misma cuenta de Cloudflare: `cne.`, `control.`, `madrid.` y `admin.consulares.app`.
- **B.** Usar `consulado.app` (ya operativo): `cne.consulado.app`, `control.consulado.app`, `madrid.consulado.app`, `admin-cne.consulado.app`.
- **C.** Otro dominio o nombres que indique Pablo.
**Recomendación:** A si `consulares.app` ya está en esa cuenta; si no, B para no perder días con el DNS. **Mientras tanto:** los hosts son variables; se desarrolla con `*.localhost`. Para T04 basta un host.

**P-2 · Base de datos en la VM** (§4 ABIERTO)
- **A.** Contenedor PostgreSQL propio y pequeño en el proyecto `cne-prod` (≈ 100 MB de RAM).
- **B.** Base `cne` separada dentro del PostgreSQL de consulares, con roles propios (exige modificar un contenedor ajeno y mezcla copias y reinicios).
- **C.** Esquema `cne` dentro de la base de consulares.
**Recomendación:** A (aislamiento, copias y restauración independientes, no se toca consulares; teinvito ya lo hace así). Pasar a B solo si la inspección muestra < 1 GB de memoria libre. **Mientras tanto:** se construye con A.

**P-3 · Número de WhatsApp para credenciales** (§4, §13.3)
Evolution API ya funciona en la VM (proyecto consulares) y teinvito lo reutiliza con su propia instancia. Hay que decidir desde qué número salen las credenciales.
- **A.** Instancia nueva `cne` en el mismo Evolution, con un teléfono dedicado vinculado por QR.
- **B.** Reutilizar la instancia `invitaciones` de teinvito (número de la Embajada).
- **C.** Solo correo; WhatsApp no se usa para credenciales.
**Recomendación:** A si hay un teléfono disponible antes del 21-11 (aísla el riesgo de bloqueo de los números en servicio, y el remitente se identifica con la elección); si no, B con el ritmo prudente (60–150 s entre mensajes). **Mientras tanto:** envío simulado; la instancia es una variable (`EVOLUTION_INSTANCE`).

**P-4 · Remitente de correo** (§13.3)
- **A.** Brevo con un remitente del dominio ya autenticado en Brevo (p. ej. `avisos@consulado.app`) y nombre «CNE 2026 — Consulado en Madrid».
- **B.** Autenticar en Brevo el dominio elegido en P-1 y usar un remitente de ese dominio.
- **C.** Otro remitente que indique Pablo.
**Recomendación:** A (funciona hoy). **Mientras tanto:** envío simulado.

**P-5 · Rótulo grande de la credencial** (§7.1 ALERTA, guía §3)
El modelo muestra «M01» (figura masculina, negro) y «F01» (figura femenina, rojo); el tablero de la especificación usa H1–H41 (hombres) y M1–M54 (mujeres). En el modelo de datos ya están separados: serie del tablero (H/M), número, sexo de la junta y `rotulo_credencial`.
- **A.** El rótulo sale **tal cual** de una columna del Excel definitivo de MJRV/juntas.
- **B.** Formato del modelo: M = juntas de hombres, F = juntas de mujeres, dos cifras (M01…M41, F01…F54).
- **C.** Formato del tablero: H1…H41, M1…M54.
Y: la figura y el color (negro/rojo) ¿indican el **tipo de junta** (hombres/mujeres) o el sexo de la persona?
**Recomendación:** A, y figura/color según el tipo de junta. **Mientras tanto:** sin rótulo no se generan credenciales reales (aviso «Falta el rótulo de credencial»); la demo usa «H1…/M1…» marcada PRUEBA.

**P-6 · Maqueta de la credencial** (§7.1, §13.3)
Se recrea el modelo en vectores (02 §C.9) con el logotipo extraído del PDF. El modelo no tiene sitio para el QR: se propone QR de 17 mm abajo a la derecha, con apellidos/nombres/cédula a su izquierda, y valores sin las etiquetas «APELLIDOS/NOMBRES».
- **A.** Aprobar la maqueta propuesta tras ver el primer PDF (20–21-11).
- **B.** Pablo aporta el archivo fuente (Word/PDF editable) y se calca.
- **C.** QR en el reverso (requiere impresión a doble cara).
**Recomendación:** A, validando el QR impreso con el lector de puerta. **Mientras tanto:** se genera con la maqueta propuesta.

**P-7 · Importe, tipo de cambio, redondeo y acta de pago** (§7.5, §13.8, §15.6)
El sistema guarda: importe USD, tipo de cambio, sentido («1 USD = x EUR» o «1 EUR = x USD»), decimales (0 o 2) y redondeo (mitad hacia arriba o truncar), y datos del pagador.
- **A.** Pablo introduce esos valores en el panel de Madrid el 27–28-11 y aprueba el acta provisional de 02 §C.8 tal cual.
- **B.** Importe fijo en EUR decidido por la institución (se introduce el tipo de cambio que resulte en ese importe; el acta muestra ambos).
- **C.** Pablo aporta un modelo oficial de acta antes del 25-11 y se sustituye la maqueta.
**Recomendación:** A con 2 decimales y redondeo «mitad hacia arriba» **si la institución no dice otra cosa** (decisión de Pablo, no del sistema). **Mientras tanto:** el acta sale como «BORRADOR — importe pendiente» y no se puede confirmar ningún pago real.

**P-8 · Dos puestos de finanzas con la misma persona** (§7.5 PROPUESTA NO APROBADA)
- **A.** Aviso no bloqueante «Lo está atendiendo X desde hh:mm» (caduca a los 10 min); el doble pago lo impide igualmente la confirmación atómica.
- **B.** Reserva bloqueante de 5 minutos con botón «Liberar».
- **C.** Sin aviso.
**Recomendación:** A (no puede bloquear a nadie por un fallo de impresora). **Mientras tanto:** se construye A.

**P-9 · Segundo escaneo y credencial bloqueada en puerta** (§7.2, §13.4 ABIERTO)
- **A.** Segundo escaneo siempre rojo «Ya registró su ingreso a las hh:mm» (sin reingresos); «bloqueada» = ficha dada de baja por el admin.
- **B.** Como A, y el admin puede anular un ingreso erróneo desde la ficha.
- **C.** Permitir reingreso en verde como «Reingreso».
**Recomendación:** A (es lo que exige la especificación mientras no haya norma distinta). **Mientras tanto:** A.

**P-10 · Confirmación física del traslado** (§13.6 PENDIENTE)
- **A.** Aceptar el movimiento cuenta de inmediato (la junta pasa a verde con marca de movimiento).
- **B.** Dos pasos: «Aceptado» (ámbar con flecha) y «Llegó a la junta» (verde), ambos desde el centro de mando.
- **C.** Confirmación por el suplente con su QR en la mesa (requiere estación en cada zona).
**Recomendación:** A (la especificación dice que aceptar deja la junta en verde); el coordinador puede deshacer con un movimiento manual de vuelta. **Mientras tanto:** A.

**P-11 · Motor de propuestas e IA; cercanía de zonas** (§7.3, §13.6)
La especificación toma como referencia la IA local de teinvito. Se propone un algoritmo determinista (04 T38): misma zona primero, después la zona más cercana según la cadena física deducida de «Orden de los bloques»: **celeste – rojo – azul – amarillo – verde – rosado** (la esquina noreste une amarillo con verde).
- **A.** Solo algoritmo determinista (explicable, comprobable, sin depender de Ollama).
- **B.** Determinista + la IA local redacta la explicación de cada propuesta (no decide).
- **C.** IA local propone (requiere conectar con el contenedor Ollama de teinvito, en otra red).
Y confirmar la cadena de cercanía.
**Recomendación:** A. **Mientras tanto:** A con esa cadena (un número por zona en `juntas_madrid.orden_cercania`, fácil de cambiar).

**P-12 · Distribución del QR de documentos** (§7.4 ABIERTO)
- **A.** Cartel A4 impreso en la zona de finanzas/espera.
- **B.** Enlace en el mismo mensaje de WhatsApp/correo de la credencial.
- **C.** Ambos.
**Recomendación:** A (B expone el enlace fuera del recinto y aumenta intentos de consulta de cédulas). **Mientras tanto:** se construye el cartel; añadir B es una línea de texto.

**P-13 · Catálogo consular real** (§3, §18.1)
Faltan consulados, recintos, JRV, electores, zonas horarias, coordenadas y cuentas con contraseñas temporales.
- **A.** Pablo envía el Excel cuando lo tenga y el agente lo adapta (T50).
- **B.** Pablo rellena la plantilla `public/plantillas/catalogo.xlsx` (T10).
- **C.** Cargar primero solo consulados y cuentas y después recintos/JRV.
**Recomendación:** A o B **antes del 23-11**; si no hay coordenadas ni zona horaria, ¿se pueden tomar de la ciudad del recinto (marcadas «aproximada» y con fuente)? **Mientras tanto:** demo.

**P-14 · Excel nominativo de MJRV de Madrid** (§7.1, §18.1)
- **A.** Pablo envía el Excel definitivo antes del 21-11 (credenciales impresas el 22 y enviadas desde el 23).
- **B.** Envía una versión provisional y luego la definitiva (la reimportación actualiza por cédula).
- **C.** Llega después del 24-11: se imprime sin envío previo.
**Recomendación:** B si el definitivo se retrasa. **Mientras tanto:** demo.

**P-15 · Catálogo de incidencias** (§6, §18.2)
- **A.** Pablo aporta la lista por fase (nombre, prioridad sugerida, alcance) antes del 26-11.
- **B.** Solo «Otro» con texto libre el día 29.
- **C.** El agente propone una lista a partir del instructivo 2026 y Pablo la aprueba.
**Recomendación:** C con aprobación expresa, o A. **Mientras tanto:** B (el sistema funciona sin catálogo).

**P-16 · Alertas por actualización ausente** (§6, §12.4, §18.2)
Horas esperadas ya decididas: inicio a las 09:00 y cierre de votación a las 19:00, hora local. Falta el margen.
- **A.** Sin alertas automáticas (solo «sin información» en el tablero).
- **B.** Un margen único en minutos que fija Pablo.
- **C.** Un margen distinto por hito.
**Recomendación:** B. **Mientras tanto:** A (campo vacío en la superadmin).

**P-17 · Bloqueos horarios adicionales** (§5, §11.4)
Decidido: escrutinio solo desde las 19:00 locales y con cierre de esa junta. Diseñado además: cada hito exige el anterior en esa junta.
- **A.** Solo eso.
- **B.** Además, «cierre de votación» no antes de las 19:00 locales.
- **C.** B y, además, nada se puede reportar antes del 29-11 en hora local.
**Recomendación:** C (evita marcas accidentales en modo elección; el modo prueba lo omite). **Mientras tanto:** A.

---

**No son preguntas pero las necesita el despliegue (acciones de Pablo):** cargar en `pabloun2025/CNE` los secretos de `06` §1; ejecutar `oracle-inspect.yml`; generar la `APP_MASTER_KEY` en su equipo y guardarla en su gestor de contraseñas además de en GitHub (sin ella no se pueden leer las fotos ni la 2FA de una copia restaurada). Pendiente institucional sin efecto en la construcción: plazo de conservación y destrucción de las fotos de cédulas (§16.2); el sistema no las borra solo.
