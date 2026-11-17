# Guía de insumos para Claude — Proyecto CNE (29 de noviembre de 2026)

**Actualizada:** 17 de noviembre de 2026. **Rama:** `main`. **Carácter:** guía de localización y uso de fuentes; no es autorización para programar o desplegar.

## 1. Lee primero y respeta la jerarquía

1. `/ESPECIFICACION_FUNCIONAL.md` — **documento canónico** con el diseño de los tres portales, roles, estados, flujos, validaciones, modo prueba, informes y reglas aprobadas. Debe prevalecer sobre propuestas antiguas.
2. `/INSTRUCCIONES.md` — **historial** de decisiones; contiene preguntas abiertas antiguas que pudieron quedar resueltas después. No tomar como vigente una pregunta antigua sin cotejar la especificación.
3. `/insumos/originales/MODELO_DE_CREDENCIALES_DE_MJRV.pdf` — **PDF visual original aportado** con dos ejemplos de credenciales, uno masculino y otro femenino. Es referencia de apariencia, no un Excel nominativo ni prueba del tamaño de impresión o del QR final.
4. `/insumos/2026/zonas_creadas_confirmadas_2026.csv` — **únicamente dos zonas creadas en 2026 con respaldo oficial**: Zaragoza (España) y Abu Dabi (Emiratos Árabes Unidos). No identifica edificios, número de JRV ni padrón.
5. `/insumos/2026/zonas_cerradas_y_suspendidas_2026.csv` — **cinco cierres oficiales de zona y tres suspensiones de votación en 2026**, diferenciados por condición. No incorporarlos como recintos operativos.

**NO existe todavía en este repositorio un distributivo completo y validado de los 93 recintos del exterior con todas sus direcciones, JRV y electores.** Tampoco se ha aportado el Excel nominativo definitivo de MJRV de Madrid ni el modelo oficial definitivo del acta o recibo de pago. No inventes esos datos.

## 2. Qué datos 2026 están confirmados y qué no

- El CNE publicó el **7 de agosto de 2026** que existirían **93 recintos electorales del exterior** para los comicios del 29 de noviembre. Fuente: https://www.cne.gob.ec/cne-habilitara-4-492-recintos-electorales-para-las-elecciones-2027/
- El CNE aprobó el **11 de febrero de 2026** crear las zonas de **Zaragoza** y **Abu Dabi**. Fuente: https://www.cne.gob.ec/cne-crea-nuevas-zonas-electorales-en-zaragoza-y-abu-dabi/
- El Pleno del CNE resolvió el **2 de marzo de 2026** cerrar **Belarús, Yakarta, Santa Clara, Monterrey y Pretoria**. Fuente: https://www.cne.gob.ec/wp-content/uploads/2026/03/R-2-MARZO-2026-SV-FINAL-signed.pdf
- El CNE informó el **21 de octubre de 2026** de la **suspensión de la votación en Caracas y Valencia (Venezuela), y La Habana (Cuba)**. Fuente: https://www.cne.gob.ec/486-414-ecuatorianos-en-el-exterior-podran-votar-en-las-elecciones-2027/
- El CNE informó el **15 de octubre de 2026** del envío de kits a **77 zonas electorales**. Esta cifra **no es necesariamente el mismo concepto** que los 93 recintos anunciados en agosto; no convertirla en otro total de recintos. Fuente: https://www.cne.gob.ec/cne-envia-kits-tecnicos-electorales-al-exterior-para-las-elecciones-2027/

**Regla obligatoria:** en las importaciones, marcar los datos con fuente/fecha y condición de verificación. No extrapolar 93 recintos a una lista artificial; no utilizar automáticamente nombres de 2023 o modalidades de voto telemático de 2023. Una **zona electoral** no es sin más una **dirección de recinto de votación**; tampoco es equivalente a una JRV.

El archivo histórico `insumos/2023/zonas_2023_referencia_segura.csv` fue **retirado del repositorio a petición expresa del usuario**. No volver a cargarlo como catálogo provisional ni tomarlo de versiones antiguas de Git.

## 3. Cómo interpretar el modelo de credencial

El PDF original presenta dos diseños verticales con identidad gráfica del CNE, rótulo «MIEMBRO DE JUNTA RECEPTORA DEL VOTO», número de junta grande, función «PRESIDENTE», icono de figura masculina/femenina y campos para APELLIDOS, NOMBRES y CÉDULA DE IDENTIDAD. Deberá completarse por registro del Excel nominativo **cuando sea aportado**, con QR individual cuyo contenido sea el número de cédula, conforme al diseño funcional aprobado, y composición imprimible CR80/A4.

**ATENCIÓN: diferencia de nomenclatura que no debe resolverse por suposición.** El modelo visual usa **M01** para la muestra masculina y **F01** para la femenina, mientras que la especificación anterior del tablero Madrid describe series **H1–H41** para hombres y **M1–M54** para mujeres. Es una **inconsistencia de etiqueta entre dos referencias**. No transformar `M01` de la credencial en «mujeres», ni cambiar todos los rótulos del tablero sin confirmar la nomenclatura del Excel definitivo. Separar en el modelo de datos: género/serie, número de junta y texto imprimible que defina el modelo operativo vigente.

El PDF aportado es **modelo de credencial**, no registro de identidades. No utilizar los textos genéricos «APELLIDOS», «NOMBRES» o «CÉDULA DE IDENTIDAD» como datos de MJRV reales.

## 4. Informes DGSMH de 2023 aportados como inspiración, NO como datos actuales

El usuario aportó tres archivos PowerPoint históricos: `Informe electoral 1 4feb 20hs final.pptx`, `Informe electoral 4 - 5feb 19hs.pptx` e `Informe electoral 5.pptx`. **No están cargados todavía como archivos binarios en este repositorio**. Su contenido se resume para orientar los formatos de 2026:

- **Informe #1, 4-2-2023, 20:00:** portada institucional; mapa con zonas activas; tabla separada de zonas activas, electores, consulados y países; indicadores por estado, incidencias y sistema; presentación de participación telemática.
- **Informe #4, 5-2-2023, 19:00:** mapa y resúmenes con corte temporal; países finalizados/en escrutinio; comentarios narrativos del progreso y la existencia o ausencia de interrupciones.
- **Informe #5 de cierre, 5-2-2023, 22:30:** tabla final con padrón, votantes y porcentaje por modalidad; resumen de cierre y gráficos de participación por grandes circunscripciones.

**Para 2026:** aprovechar solo la estructura de **informes con fecha/hora de corte, mapa, indicadores y observaciones**, generados con los datos reales del sistema consular. No copiar cifras, gráficos, modalidades, centros telemáticos ni conclusiones de 2023. El sistema 2026 ya tiene informe PDF y Excel aprobado en `ESPECIFICACION_FUNCIONAL.md`.

## 5. Insumos operativos 2026 ya analizados

El usuario ha proporcionado el instructivo **«Para los miembros de las Juntas Receptoras del Voto — Más de 850 electores (por género)»**, relativo al 29-11-2026, además de un resumen en Word preparado en esta conversación. No están todavía agregados como binarios a esta rama. De ese instructivo interesa conservar:

- **Instalación:** 08:30–09:00, hora local; se precisan **tres integrantes** de junta; el cónsul o delegado designa suplente cuando falta alguien; se revisa el paquete y firma el listado de materiales.
- **Votación:** 09:00–19:00, hora local; el recinto y las JRV se reportan mediante el portal consular; registrar votantes de firmas/huellas o una estimación distinguiendo la fuente.
- **Escrutinio:** desde las 19:00 hasta concluir; la documentación distingue papeletas de mujeres, hombres y la representación de pueblos/nacionalidades y ecuatorianos del exterior. El programa no contabiliza resultados de candidatos ni sustituye las actas oficiales.
- **Documentación y cierre:** diferenciar acta de instalación, documentos de escrutinio, transmisión/escaneo, sobres amarillos y embalaje. No declarar «proceso terminado» porque haya finalizado el sufragio o se haya generado una sola acta.
- **Cuidado con validaciones:** las papeletas pluripersonales permiten múltiples selecciones por elector; no crear por defecto un incidente cuando la suma de votos a candidaturas supera los sufragantes.

Las fuentes históricas de otras elecciones pueden aclarar procesos, pero los requisitos de 2026 y el instructivo 2026 prevalecen para el catálogo de incidencias.

## 6. Recibos/actas de pago de Madrid: requisito y situación real

**Aún no hay un modelo de recibo de pago oficial aprobado ni PDF definitivo subido al repositorio.** El usuario solicitó preparar el documento tomando como referencia modelos de recibos disponibles en internet, **sin inventar su naturaleza de formulario oficial**. Se debe producir una plantilla de **recibo/acta de pago provisional**, sujeta a la aceptación del usuario y a la plantilla institucional que aporte posteriormente.

La plantilla deberá rellenarse **automáticamente a partir de la MISMA ficha del MJRV importada desde el Excel que genera su credencial**: apellidos, nombres, número de cédula, junta/serie, cargo de MJRV, y los datos del desembolso configurados por administración (importe USD aprobado, tasa del día, monto EUR, fecha y datos de pagador, con la precisión/forma de conversión que se decida). Evitar que finanzas vuelva a teclear nombres o cédulas que ya figuran en el registro. La segunda página incorpora **anverso y reverso de la cédula fotografiados**. El documento debe permitir firmas del pagador y receptor conforme a la plantilla que finalmente se acepte.

**Regla crítica:** generar/imprimir el recibo **no marca al MJRV como pagado**. Después de las firmas y de la entrega física de efectivo, el operador de finanzas registra «Confirmar pago». El control central previene pagos duplicados entre dos o tres estaciones. La elegibilidad por cumplimiento de funciones la verifica **finanzas directamente**, sin autorización previa del centro de mando.

No inventar el valor de la compensación, la tasa, el tipo de redondeo, la firma de autoridades adicionales ni un número de artículo legal.

## 7. Qué leer y qué no dar por listo

**Orden de lectura para Claude:** `ESPECIFICACION_FUNCIONAL.md` → esta guía → PDF de credenciales → dos CSV oficiales de 2026 → `INSTRUCCIONES.md` solo como historial. Si aparecen nuevos Excel definitivos, cotejarlos primero y sustituir las referencias incompletas, sin borrar la trazabilidad de fuentes.

**No dar por disponible**: catálogo nominativo completo 2026, recintos exactos/direcciones, totales de JRV/electores por recinto, Excel de MJRV Madrid, acta/recibo definitivo, importes o tipo de cambio. No afirmar que esos elementos estén cargados ni comenzar a generar pagos reales con datos ficticios.

**Autorización para desarrollar:** la instrucción anterior del proyecto era no escribir código sin orden expresa. La petición del usuario de ahora es preparar **insumos y guía**; no se debe interpretar como autorización nueva para programar y desplegar los tres sistemas.
