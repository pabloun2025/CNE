# Instrucciones de continuidad — prioridad de fuentes

**VIGENTE (17-11-2026):** El documento canónico del proyecto es [ESPECIFICACION_FUNCIONAL.md](ESPECIFICACION_FUNCIONAL.md), consolidado con todas las decisiones y correcciones del 17 de noviembre. **Léelo completo antes de trabajar.** Este archivo INSTRUCCIONES.md conserva un **historial cronológico** de decisiones, preguntas pasadas y opciones descartadas; algunos encabezados «ABIERTO» y «pregunta siguiente» de este historial han sido superados por elecciones posteriores. **Si hay contradicción, prevalece la especificación consolidada y, después, la última decisión explícita del usuario.** No programar hasta autorización expresa.

**Corrección central:** Madrid no es una extensión administrativa del login consular. Cuenta con administrador propio (una cuenta con contraseña), enlaces de operadores por nombre y PIN de cuatro dígitos y módulo financiero para 2–3 puestos. Los coordinadores de mesa no tienen acceso. El centro de mando observa llegadas, recibe propuestas de redistribución y decide; la IA nunca traslada sola. La entrada y el cobro se identifican con el QR individual de cédula; el QR genérico sirve para subir fotografías de ambas caras. Imprimir un acta no equivale a confirmar un pago. El sistema Madrid **no alimenta automáticamente** el tablero de Quito.

**Arquitectura:** repositorio CNE independiente; una aplicación con tres portales web separados por subdominios bajo consulares.app; misma VM Oracle Cloud ya usada por consulares; reutilizar infraestructura sin duplicarla, con datos y permisos separados. El código todavía no está autorizado. Los nombres exactos de subdominio están propuestos, sin configurar.

---

# CNE: instrucciones para continuar

Fuente para que otra IA siga. Sin código hasta que Pablo lo pida.

## Incidentes (propuesto, sin cerrar)

Solo lo que para o daña la fase. Siempre “otro” con texto.

- Instalación: la junta no abre, falta el paquete, acta sin firmas.
- Sufragio: proselitismo en el recinto, el voto deja de ser secreto, la firma se toma antes de depositar.
- Cierre: a la hora, quien sigue en fila no vota.
- Escrutinio: el conteo se corta, no cuadra papeletas con firmas, faltan firmas.
- Escaneo: el acta no entra a resultados, el sobre amarillo no sale, el centro del exterior no procesa.

## Fases

Consulado: instalación 08:30, voto 09:00–19:00, escrutinio, embalaje. País: instalación 06:30, voto 07:00–17:00.

## Tablero, login, Madrid

Mapa por hora local. Votantes: firmas o estimación. Grandes: varios móviles, mismo usuario. Login por correo, Excel del superadmin, primer cambio obligatorio. Madrid es la gestión interna, ya descrita.

## Pregunta abierta

¿Esta lista? A) Sí. B) Otro.

## Decisiones de seguimiento DGSMH (17-11-2026)

- **DECIDIDO.** La DGSMH no solo visualiza el mapa en tiempo real: debe poder **monitorear, dar seguimiento y coordinar soluciones** de incidentes reportados por los consulados. Es el objetivo operativo aprobado por Pablo (opción C de la entrevista).
- **DECIDIDO.** El sistema debe permitir identificar qué incidencia ocurrió, dónde, cuándo, qué recinto/JRV afecta, si sigue activa o resuelta y mantener trazabilidad de solicitudes y actuaciones para su seguimiento; sin imponer una revisión junta por junta ni reportes repetitivos en ausencia de novedades. Esta es la orientación funcional acordada, no una definición de pantallas o esquema.
- **CRITERIO DE DISEÑO.** La DGSMH puede coordinar apoyo consular y solicitar información, pero la herramienta no debe atribuirle decisiones electorales propias del CNE.
- **ABIERTO.** Medio de interacción entre Quito y los consulados (mensajes dentro del sistema, canales externos con registro, o modelo mixto). Se pregunta a continuación; no se asumirá la respuesta.
- **ABIERTO.** Quién inicia sesión en el tablero DGSMH, sus permisos concretos, reglas de correcciones y cierres. La opción C no crea por sí sola un tercer rol de cuenta.
- **ABIERTO.** Los ítems definitivos del desplegable de incidentes. Las opciones de este documento siguen siendo propuestas de trabajo, no un catálogo ratificado. Cada incidente puede afectar a todo un recinto o a una o varias JRV; las juntas se seleccionan solo cuando exista incidencia, sin exigir reportar junta por junta.


## Coordinación de incidentes Quito–consulados (decisión 17-11-2026)

- **DECIDIDO.** Se adopta el modelo mixto (opción C) para atender incidencias: la DGSMH registra dentro del sistema solicitudes de seguimiento; las situaciones urgentes se coordinan por teléfono o WhatsApp; el consulado confirma en la plataforma las actuaciones y la resolución.
- **ALCANCE.** No se está aprobando un chat interno ni la integración con servicios de telefonía/WhatsApp. Se requiere conservar el registro operativo mínimo de solicitud, seguimiento y resultado, sin duplicar la conversación externa.
- **ABIERTO.** Cuáles incidentes deben llegar a Quito como asuntos que precisan intervención y cuáles serán solo informativos. Pregunta estratégica siguiente: distinguir selección por consulado, elevación por Quito o ambos.
- **ABIERTO.** Quién puede cambiar estados y resolver un incidente; permisos del tablero, notificaciones, destinatarios y reglas de escalamiento siguen pendientes.


## Alertas y contacto operativo (decisiones 17-11-2026)

- **DECIDIDO.** Todos los incidentes de los consulados son visibles en el mapa y seguimiento de la DGSMH. Se adopta el modelo combinado (opción C): el consulado puede solicitar apoyo explícito de Quito y, de manera independiente, la DGSMH puede marcar para seguimiento un incidente que considere relevante. Registrar quién solicitó o marcó el seguimiento y su evolución, sin dar por aprobadas reglas de prioridad automática, notificaciones o cierre.
- **DECIDIDO.** Cada consulado debe introducir un **teléfono de contacto operativo** para la jornada, disponible para consulta de la DGSMH desde Quito. Es un contacto del consulado o de la operación, no de cada junta. No se confunde con los teléfonos de electores ni de miembros de juntas. Su modalidad de captura, confirmación y actualización será objeto de la siguiente pregunta.
- **CONSECUENCIA FUNCIONAL.** El contacto operativo facilita llamadas ante incidencias urgentes y evita añadir un chat interno; la trazabilidad de solicitudes y resoluciones permanece en el sistema. No se ha aprobado uso público del teléfono ni integración telefónica.
- **ABIERTO.** Cuándo debe ingresar/confirmar el consulado su teléfono operativo: al configurar, al iniciar la jornada o configuración previa y confirmación el día electoral. Esta es la siguiente decisión.

## Confirmación del teléfono operativo (decisión 17-11-2026)

- **DECIDIDO.** Opción C: cada consulado registra previamente un teléfono de contacto operativo y, al iniciar la jornada electoral, confirma que sigue siendo válido o lo actualiza. El teléfono está disponible para la DGSMH en el tablero, como dato de contacto de la operación consular; no se solicita por cada JRV.
- **ABIERTO.** Política para identificar y gestionar consulados que no reportan un hito esperado: visualización simple, aviso por falta de reporte, u otro mecanismo. Ninguna ausencia de reporte equivale automáticamente a un incidente electoral.

## Control de reportes ausentes (decisión 17-11-2026)

- **DECIDIDO.** Opción C: el tablero DGSMH mostrará permanentemente el último hito/reportado de cada consulado y su hora. Cuando no se registre un hito esperado dentro de un margen razonable, aparecerá una **alerta de seguimiento por falta de reporte**, diferenciada expresamente de los incidentes electorales. Esta alerta no presume que haya una interrupción real del sufragio.
- **DECIDIDO.** La evaluación de hitos esperados se hará respecto de la hora **local** del lugar. No se han definido minutos de tolerancia ni la fuente concreta del huso horario.
- **ABIERTO.** Plazos de tolerancia exactos, escalamiento y notificaciones; no inventarlos.
- **ABIERTO.** ¿Qué forma de visualización de avances debe priorizar el tablero DGSMH para consulados de muy distinto tamaño: porcentaje de JRV por hito, número absoluto de JRV y total, o ambos? La respuesta no debe contradecir el reporte junta por junta para consulados pequeños y el reporte concurrente por sección para consulados grandes ya decididos.

## Indicadores de avance por consulado (decisión 17-11-2026)

- **DECIDIDO.** Se adopta la opción C de visualización para DGSMH: por hito, mostrar simultáneamente el número de juntas reportadas respecto del total y su porcentaje (ej.: 76 de 95 — 80 %). Cuando la información disponible lo permita, podrá consultarse qué juntas siguen pendientes. El total real por recinto provendrá del catálogo que Pablo entregará; no se debe inventar.
- **PRECISIÓN FUNCIONAL.** El porcentaje se calcula sobre juntas, no sobre personas votantes. Un porcentaje de avance no implica que haya concluido toda la elección ni equivale al porcentaje de participación.
- **ABIERTO.** Cómo producir un conteo por JRV fiable y con mínima carga en consulados grandes: actualizaciones individuales, marcado masivo por zona/grupo con excepciones, o modelo híbrido. No asumir alimentación automática desde el módulo interno de Madrid ni imponer revisión junta por junta.

## Avance por grupos y excepciones (decisión 17-11-2026)

- **DECIDIDO.** Pablo aprobó la opción B para consulados grandes: reportar avance por **grupos de juntas**, con operación «Todas completadas» o señalando únicamente las JRV excepcionales/pendientes. Debe evitarse la obligación de editar 95 JRV una por una. El avance del tablero se calculará sobre juntas efectivamente confirmadas, con número absoluto y porcentaje.
- **CRITERIO DE DISEÑO.** La operación de confirmación de grupo y sus excepciones deberá preservar la identidad de las juntas y del hito reportado. La agrupación deberá conciliarse con el catálogo/Excel de recintos y JRV que Pablo proporcionará; no dar por definitivos los grupos de color de Madrid para todos los consulados.
- **RIESGO.** Si varios dispositivos del consulado reportan simultáneamente, deben prevenirse sobrescrituras accidentales y discrepancias sobre JRV pendientes/completadas; el mecanismo exacto sigue ABIERTO.
- **ABIERTO; PREGUNTA SIGUIENTE.** Distinguir en el tablero y en el formulario el estado de una JRV «confirmada completada», «pendiente o impedida expresamente informada» y «sin información», en lugar de considerar automáticamente como pendiente toda junta que no figure como completada. No se debe asumir decisión hasta que Pablo elija.

## Estados de avance por JRV y fase (decisión 17-11-2026)

- **DECIDIDO.** Pablo aprobó la opción C: cada JRV, para cada fase, tendrá tres estados distinguibles en el tablero DGSMH: **completada**, **pendiente expresamente reportada** y **sin información**. No se debe interpretar la falta de datos como retraso confirmado ni como incidente electoral.
- **REGLA FUNCIONAL.** Al confirmar un grupo de JRV, las juntas completadas se marcan como tales y las excepciones expresamente señaladas como pendientes. Las juntas aún no cubiertas por ningún reporte permanecen «sin información». El porcentaje de avance confirmado se calcula solo sobre las JRV «completadas» respecto del total de JRV del recinto, y se muestra también el conteo absoluto; las no informadas no pasan a pendientes automáticamente.
- **DISTINCIÓN.** El estado «pendiente» significa que una fase no se ha completado según reporte, pero no implica automáticamente un incidente; los incidentes y sus estados de seguimiento se registran por separado.
- **ABIERTO.** Cómo resolver entradas simultáneas o contradictorias sobre la misma JRV/fase desde varios dispositivos con el mismo usuario de consulado. Plantear una elección entre sobrescritura, bloqueo o aviso de conflicto con confirmación e historial. Mantener la decisión independiente de la política posterior de corrección de hitos cerrados.

## Conflictos de reportes simultáneos (decisión 17-11-2026)

- **DECIDIDO.** Pablo eligió la **opción A**, incluso después de plantearse el riesgo de sobrescritura: ante dos reportes contradictorios sobre la **misma junta y fase**, **prevalece el último reporte guardado correctamente por el servidor**. No se exige confirmación de conflicto ni se bloquea la modificación por defecto. Los reportes sobre distintas juntas no deben interferirse. Las actualizaciones por JRV/fase no deben reemplazar indiscriminadamente el estado completo de una zona o recinto.
- **IMPLICACIÓN.** El dato visible de esa JRV/fase pasa a ser el del último reporte recibido, que puede corregir un error o reemplazar accidentalmente un dato válido. No presumir que el último reporte corresponde necesariamente al hecho más reciente en el terreno. Se distingue la hora de recepción de la eventual hora declarada del evento, sin alterar la regla aprobada.
- **ABIERTO.** Atribución de cada reporte al funcionario o dispositivo, pues el consulado comparte una misma cuenta. No se ha elegido identificación por reporte, identificación al iniciar una sesión de operación o falta de identificación individual.

## Operador por sesión en cuenta consular compartida (decisión 17-11-2026)

- **DECIDIDO.** Opción C: cuando un funcionario inicia trabajo en un dispositivo utilizando la cuenta compartida del consulado, registra **una vez su nombre como operador de esa sesión de trabajo**. Las actuaciones posteriores del dispositivo quedan atribuidas automáticamente a ese nombre sin crear cuentas personales ni repetir la identificación por cada reporte. Otros dispositivos pueden identificar un operador diferente usando las mismas credenciales consulares.
- **IMPLICACIONES.** Separar explícitamente la **autenticación** institucional del consulado de la **identificación declarada** del operador. No confundir nombre introducido con identidad legalmente verificada. Conservar en cada actuación el consulado, operador declarado, fecha/hora y los datos reportados; el último reporte sigue prevaleciendo como ya se decidió. Si cambia el operador del mismo dispositivo, deberá poder cambiarse la identificación antes de seguir reportando; el mecanismo detallado continúa abierto.
- **ABIERTO / SIGUIENTE PREGUNTA.** Unidad geográfica-operativa del reporte consular: ¿separar recintos bajo un mismo consulado desde el principio, o permitir un resumen global con desglose opcional? No presuponer que cada consulado tiene exactamente un recinto.

## Varios recintos por consulado (decisión de entrevista)

- **DECIDIDO.** Pablo aprueba la opción B: si un consulado tiene más de un recinto electoral, **cada recinto se gestiona y reporta por separado** con sus propias juntas, hitos, estados e incidencias. El mismo usuario institucional del consulado accede a todos sus recintos. El tablero DGSMH ofrece detalle por recinto y total consolidado por consulado; el consolidado debe distinguir datos reportados y no reportados y no sumar porcentajes directamente.
- **FUENTE DE DATOS.** La asignación consulado–recintos–juntas y sus totales provendrá del archivo que Pablo aportará; no presumir que cada consulado tiene un solo recinto ni inventar catálogo.
- **NO DECIDIDO.** La modalidad concreta para cargar reportes de múltiples recintos desde el mismo consulado: funcionarios que reportan directamente desde cada recinto, un responsable central que recopila y registra, o ambos. Esta es la siguiente pregunta estratégica. No crear cuentas nuevas por recinto sin decisión expresa.

## Reporte flexible desde recintos o consulado central (decisión de entrevista)

- **DECIDIDO.** Pablo elige la opción C: en un consulado con varios recintos, los funcionarios autorizados pueden registrar informes de cada recinto directamente desde ese recinto o desde el consulado central. No se impone modalidad centralizada o descentralizada; el **recinto al que se refiere el reporte debe identificarse explícitamente** con independencia de la ubicación física del operador. Se mantiene una misma cuenta institucional por consulado y la declaración de nombre del operador una vez por sesión.
- **IMPLICACIONES DE DISEÑO.** No inferir automáticamente el recinto a partir de la ubicación del dispositivo, del funcionario o del consulado. El registro debe asociar consulado, recinto, junta o grupo (cuando corresponda), fase, nombre declarado del operador y momento de envío. El reporte remoto y presencial deben producir el mismo dato y el mismo tablero DGSMH consolidado. Se admiten actualizaciones concurrentes sobre recintos distintos, sin conflicto.
- **ABIERTO.** Cómo seleccionar en la interfaz el recinto de trabajo sin confundir reportes de distintos lugares: selección por cada reporte, recinto activo por sesión con cambio visible o navegación a la ficha del recinto. Siguiente pregunta estratégica.

## Recinto activo por sesión (decisión de entrevista)

- **DECIDIDO.** Pablo elige opción B: el operador selecciona **un recinto activo al comenzar la sesión de trabajo** con la cuenta institucional del consulado; el nombre del recinto permanece claramente visible en la interfaz y puede cambiarse en cualquier momento sin cerrar sesión ni volver a autenticarse. Los reportes se asignan al recinto activo en el momento en que se realizan. El sistema debe evitar confundir recintos cuando hay varios asignados a un consulado.
- **COHERENCIA.** Convive con el nombre del operador declarado una vez por sesión, el modelo de reportes directos desde recintos o desde el consulado y el último reporte prevalente por junta/fase. Los detalles de navegación y de validación de cambios se definirán durante diseño.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Comportamiento de los reportes en caso de pérdida de conexión en recintos: solo envío online; borradores locales con reenvío manual; o cola con sincronización automática. No asumir autorización para envío de información no confirmada. Considerar riesgo de sobrescribir un reporte más reciente si se envía uno antiguo tras recuperar la conexión.

## Borradores sin conexión y envío manual (decisión de entrevista)

- **DECIDIDO.** Para pérdida de internet en el módulo de reportes consulares se aprueba la **opción B**: el trabajo introducido sin conexión queda como **borrador en el dispositivo** y, una vez restablecida la conectividad, el operador **revisa y envía manualmente** los reportes pendientes. No hay sincronización automática.
- **CONSECUENCIAS.** Distinguir claramente borradores locales de reportes recibidos por el servidor; Quito solo puede considerar confirmados los segundos. La interfaz debe mostrar qué borradores faltan por transmitir y si el envío fue aceptado. El dispositivo y el navegador que contienen el borrador son relevantes; no presumir que queda disponible en otros equipos. Evitar que el borrador se pierda al cambiar temporalmente de pantalla, en la medida técnicamente viable.
- **COHERENCIA CON DECISIÓN PREVIA.** Para reportes contradictorios de misma JRV/fase se mantiene la regla de que **prevalece el último recibido por el servidor**. El control manual reduce pero no elimina la posible sobrescritura de información nueva al enviar un borrador antiguo. No añadir confirmaciones obligatorias de conflicto sin aprobarlas.
- **ABIERTO.** Política concreta para la recuperación de borradores ante cierre de pestaña, caducidad de sesión o cambio de recinto, y eventual tratamiento de datos personales en almacenamiento local.
- **PREGUNTA ESTRATÉGICA SIGUIENTE.** Diferenciar cuándo un consulado confirma que una fase se desarrolla sin novedades de cuándo simplemente no ha enviado información; minimizar carga de reportes y falsas alertas. Evaluar confirmación «sin novedades» opcional, por hito, o en respuesta a solicitudes de Quito sin imponer verificaciones por JRV.

## Confirmación de normalidad por fase (decisión de entrevista)

- **DECIDIDO.** Pablo seleccionó opción B: el operador del consulado podrá marcar **«Sin novedades»** al actualizar cada fase del **recinto**. Es una **confirmación sencilla por fase/recinto**; no se solicita confirmación de normalidad JRV por JRV, ni se exige un reporte periódico de normalidad. Cuando haya incidencias, se registran en el módulo correspondiente.
- **CRITERIO FUNCIONAL.** La confirmación «Sin novedades» es distinta de que todas las juntas hayan completado la fase. No aumenta el numerador de JRV completadas, no modifica los tres estados de cada JRV y no sustituye el registro de hitos ni las incidencias.
- **ABIERTO.** Significado preciso cuando existen incidencias ya abiertas: «sin nuevos incidentes» frente a «no hay incidentes activos» y cómo reflejarlo. No interpretar que la confirmación por sí sola resuelve o cierra incidentes.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Qué debe ocurrir cuando un consulado solicita apoyo urgente a Quito: solo indicador dentro del tablero, aviso destacado/sonoro en tablero, o notificaciones también fuera del sistema. No asumir integración externa de notificaciones.

## Avisos urgentes visuales y sonoros a la DGSMH (decisión de entrevista)

- **DECIDIDO.** Pablo eligió la **opción B** para solicitudes **urgentes** de apoyo a Quito: aviso visual destacado en el tablero DGSMH (mapa y lista de asuntos pendientes) y **alerta sonora** mientras el tablero esté abierto, con posibilidad de silenciar el sonido. No se ha aprobado envío por correo, WhatsApp, SMS ni notificaciones externas. No aplicar aviso sonoro a todas las actualizaciones rutinarias ni a todas las incidencias por defecto.
- **LÍMITE TÉCNICO.** Los navegadores pueden impedir reproducir sonidos hasta que el usuario interactúe con la página y no garantizan avisos si el tablero está cerrado o silenciado. Por tanto, el aviso visual deberá permanecer accesible aunque el audio no suene; no prometer avisos fuera de la sesión abierta.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Ciclo de atención de alertas: ¿desaparece al abrir, queda visible con acuse y silencio hasta la resolución o requiere asignación explícita a un responsable en Quito? No confundir **acuse de recibo** de la solicitud urgente con **resolución** del incidente reportado. No asumir roles individuales de DGSMH aún.

## Recepción de alertas urgentes DGSMH (decisión de entrevista)

- **DECIDIDO.** Pablo eligió la **opción B** para la atención de solicitudes urgentes de apoyo: desde el tablero de Quito, la DGSMH confirma recepción pulsando **«Recibido»**. Esa acción **silencia el aviso sonoro de esa solicitud**, pero **no equivale a resolver la incidencia**. La solicitud permanece identificada como **pendiente de resolución** hasta registrar el resultado correspondiente.
- **IMPLICACIONES FUNCIONALES.** Distinguir los estados **urgente sin acusar recepción**, **recibido/en seguimiento** y **resuelto**; mantener constancia de la hora de emisión y del acuse de recepción, y del resultado final. La recepción por Quito no modifica automáticamente los estados por JRV ni presume solución. No se ha aprobado asignación individual obligatoria de responsables ni envío de notificaciones fuera del tablero.
- **ABIERTO / PREGUNTA SIGUIENTE.** ¿Quién está autorizado a declarar resuelta una incidencia? Alternativas: consulado de origen; Quito; o ambos con constancia de quién realizó el cierre. El mecanismo de cierre no debe confundirse con el acuse de recibo de Quito. Todavía sin decisión.

## Cierre de incidencias por consulado o DGSMH (decisión de entrevista)

- **DECIDIDO.** Pablo elige la opción C: tanto el **consulado** como la **DGSMH** pueden marcar una incidencia como **resuelta**, sin necesidad de segunda aprobación. El sistema conservará cuál de las dos instancias registró la resolución, la identidad operativa disponible del autor y la fecha/hora. Cuando Quito dé por resuelta una incidencia, su registro deberá sustentarse en la información recibida del consulado, sin que el cierre administrativo sustituya la constatación de los hechos en el recinto.
- **DISTINCIÓN.** El acuse «Recibido» de una alerta urgente por parte de Quito sigue siendo distinto del cierre de la incidencia que originó la solicitud. La resolución no altera automáticamente los estados de avance por junta/fase ni supone cerrar el proceso electoral.
- **ABIERTO / PREGUNTA SIGUIENTE.** ¿Qué información mínima debe exigirse al resolver una incidencia: un clic de resolución, una breve descripción obligatoria de la solución o descripción más adjuntos opcionales? Evitar fricción innecesaria y no exigir fotos donde no aportan valor. No asumir todavía ninguna de las opciones.

## Cierre de incidencias con explicación obligatoria (decisión de entrevista)

- **DECIDIDO.** Pablo eligió **opción B** para documentación de resolución: al cerrar una incidencia, sea por consulado o por DGSMH, se exige **una explicación breve obligatoria** de cómo se solucionó. Se guardan descripción, autor/instancia, fecha y hora. No se exige adjuntar fotografías ni documentos para poder cerrar.
- **IMPLICACIONES.** Diferenciar «Recibido» por Quito de «Resuelto» con explicación. La resolución es dato de seguimiento de la incidencia y no altera por sí sola el estado de la fase ni el avance de JRV. La redacción debe ser concisa y apta para el informe final sin pedir narraciones extensas.
- **ABIERTO / SIGUIENTE PREGUNTA.** Tratamiento de una incidencia cerrada por error o que reaparece: reabrir la misma con historial, crear incidencia nueva enlazada, o elección según la causa. Requiere conservar trazabilidad sin confundir incidentes diferentes.

## Reapertura de incidencias cerradas (decisión de entrevista)

- **DECIDIDO.** Pablo eligió la **opción A**: si una incidencia cerrada se considera cerrada por error o el mismo problema vuelve a presentarse, **siempre se reabre la incidencia original**, en lugar de crear un registro nuevo. Conserva un identificador único por incidencia y la secuencia de aperturas, cierres y reaperturas. No imponer enlaces entre incidentes nuevos por recurrencia.
- **IMPLICACIONES.** Cada reapertura debe quedar registrada con su momento y autor, preservando sin borrados los ciclos de cierre previos y sus explicaciones. Para que un incidente recurrente no parezca resuelto permanentemente ni se pierdan episodios posteriores, mantener el estado actual visible como abierto y conservar historial de reapariciones; los indicadores de incidentes únicos y de reaperturas no deberían confundirse. La reapertura no cambia automáticamente el estado de las JRV ni de un hito electoral.
- **ABIERTO.** Cómo elegir el alcance territorial al registrar una incidencia: seleccionar recinto completo o juntas afectadas manualmente, inferir el alcance según el tipo y permitir corregir, o admitir una combinación dinámica sin pasos innecesarios. No obligar a repasar todas las JRV.

## Alcance sugerido para incidencias (decisión de entrevista)

- **DECIDIDO.** Pablo eligió opción B: al registrar una incidencia, el sistema **sugiere el alcance habitual** en función del tipo de problema (p. ej. una o varias juntas para falta de integrantes, recinto entero para una suspensión general), pero el operador **puede modificarlo** según el caso. El alcance no se impone por la categoría. Para incidentes específicos el operador selecciona las JRV afectadas a partir del catálogo del recinto. No se exige revisar una por una todas las juntas; en incidentes generales se permite seleccionar el recinto completo.
- **REGLA FUNCIONAL.** El catálogo definitivo de incidencias y sus alcances sugeridos sigue **ABIERTO** y debe apoyarse en el material operativo de 2026 y los manuales proporcionados. Evitar formularios extensos, no sustituir reporte de incidente por verificación rutinaria de 95 JRV. Mantener compatible con los tres estados por junta/fase, que no equivalen automáticamente al estado de incidencia.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Cuando una incidencia afecte varias juntas, si se normaliza solo una parte, definir si el registro debe cerrarse únicamente al resolverse todas, permitir resolución parcial por juntas dentro del mismo registro, o dividir incidencias. No asumir comportamiento automático sin decisión.

## Resolución parcial por JRV en una incidencia (decisión de entrevista)

- **DECIDIDO.** Pablo aprueba la opción B para incidencias que afecten a varias JRV: dentro de una **única incidencia**, se podrá registrar la **resolución parcial** seleccionando las juntas en las que se solucionó el problema. Las demás continúan afectadas y la incidencia permanece **abierta** hasta que todas las juntas afectadas estén resueltas. El tablero de DGSMH deberá distinguir cantidad inicialmente afectada y cantidad actualmente pendiente.
- **COHERENCIA.** La explicación breve obligatoria al registrar una resolución sigue vigente: para una actuación que resuelve varias juntas, admitir **una sola explicación por operación de resolución parcial**, con hora y operador/instancia, sin exigir una explicación separada por cada junta. Las sucesivas operaciones conservan historial. La resolución parcial no equivale a confirmar el hito/fase de cada junta y no debe cambiar automáticamente su estado «completada/pendiente/sin información».
- **TRAZABILIDAD.** Si el problema reaparece en alguna de las juntas, se reabre en la incidencia original con registro histórico (reapertura original ya aprobada), sin duplicar incidencias automáticamente. No borrar las resoluciones previas.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Definir si el catálogo de incidentes debe dar por defecto prioridad de atención según el tipo de problema, dejar la prioridad a criterio del consulado o combinar prioridad sugerida y modificable. Esto afecta el orden del tablero y las alertas; no equivale a emisión sonora automática de todas las incidencias ni revoca que se solicite ayuda urgente de manera explícita.

## Prioridad de incidencias sugerida y modificable (decisión de entrevista)

- **DECIDIDO.** Pablo seleccionó la **opción C**: el sistema sugiere una prioridad de cada incidencia en función de su tipo, pero **el consulado puede modificarla** considerando las circunstancias reales (gravedad y juntas afectadas). La prioridad orienta el orden de atención de Quito y la presentación del tablero. Los niveles planteados en la entrevista fueron **normal, alta y crítica**, sin cerrar aún los criterios de clasificación por incidente.
- **COHERENCIA.** Prioridad de una incidencia no equivale a solicitud urgente de apoyo. Según decisiones previas, **solo las solicitudes urgentes de apoyo** originan alertas visuales y sonoras específicas en Quito; una incidencia crítica no debe producir por sí sola un sonido. Continúa el modelo combinado donde el consulado puede pedir apoyo y Quito puede marcar incidencias para seguimiento.
- **ABIERTO.** Catálogo definitivo de tipos de incidente, reglas que sugerirán su prioridad, cuándo se recalcula si cambia el alcance y autorizaciones para reclasificar desde Quito. No dar por aprobadas esas reglas.
- **PREGUNTA ESTRATÉGICA SIGUIENTE.** Si la DGSMH estima que un incidente tiene prioridad distinta de la consignada por el consulado, ¿debe editar la misma prioridad, limitarse a marcar seguimiento o manejar un nivel separado de prioridad de atención de Quito? Evitar modificar sin trazabilidad el reporte de origen.

## Cambio de enfoque de la entrevista: decisiones estratégicas primero

- **INDICACIÓN DE PABLO.** Evitar seguir entrevistando sobre detalles pequeños de incidencias y estados. **Priorizar decisiones de alto nivel del proyecto**: alcance y primera entrega operativa, arquitectura separada de tres componentes, flujos principales y usuarios, datos que intercambian, prioridades y despliegue. No reabrir decisiones cerradas; los detalles ya decididos quedan preservados para la fase de diseño fino.
- **ABIERTO / PREGUNTA ESTRATÉGICA SIGUIENTE.** Alcance mínimo que debe funcionar para la jornada de 29 de noviembre de 2026: (A) consular + tablero Quito; (B) ambos y control operativo Madrid esencial; (C) los tres componentes con toda la funcionalidad Madrid prevista. Priorizar no implica eliminar componentes del proyecto completo.

## Primera versión: alcance completo (decisión estratégica 1)

- **DECIDIDO.** Pablo aprobó la opción **C** de la decisión estratégica 1: la **primera versión, para el 29 de noviembre de 2026**, debe comprender los **tres sistemas completos** según el alcance funcional previsto: (1) reporte consular de la jornada y sus incidencias; (2) tablero de monitoreo y seguimiento de la DGSMH; (3) sistema interno operativo de Madrid, incluidos credenciales, acceso, conformación y movimientos de MJRV, pagos y demás funciones previstas. No convertir esta elección en despliegue gradual que elimine funciones de la primera versión.
- **RIESGO DE EJECUCIÓN.** El horizonte temporal es muy exigente; requiere abordar pronto dependencias, catálogos reales, modelos de datos, plantillas, permisos y validación operativa. No prometer viabilidad o fecha de entrega sin planificación técnica, pruebas e insumos pendientes. La decisión de alcance no implica autorizar código: sigue vigente «sin código hasta que Pablo lo pida».
- **PRÓXIMA PREGUNTA ESTRATÉGICA, ABIERTA.** Arquitectura de integración de los tres sistemas, conservando interfaces claramente diferenciadas y aislamiento de la información personal/operativa de Madrid respecto del tablero DGSMH: (A) tres aplicaciones y datos independientes, sin integración automática; (B) una plataforma con servicios/datos centrales compartidos y módulos separados por permisos; (C) plataforma consular-DGSMH integrada y módulo Madrid aislado que comparte solamente hitos agregados autorizados por una API. No inventar compatibilidad de hitos y separar constitución de junta de instalación electoral formal.

## Arquitectura general integrada con tres interfaces independientes (decisión estratégica 2)

- **DECIDIDO.** Pablo aprueba la **opción B**: **una plataforma integrada con infraestructura y servicios/datos comunes necesarios, pero tres interfaces y ámbitos funcionales independientes**: (1) reporte consular, (2) tablero DGSMH, y (3) operaciones internas de Madrid. No se pretende una pantalla única ni un único modelo operativo indiferenciado.
- **REQUISITOS DE ARQUITECTURA.** Datos maestros consistentes para consulado/recinto/JRV y avance consular, sin duplicar catálogos; control de acceso por ámbito y principio de mínima información necesaria; la DGSMH recibe solo los datos autorizados para seguimiento electoral, **no** datos personales de credenciales, escaneos de cédulas, control de puerta, movimientos ni pagos de Madrid. La integración facilita reutilizar autenticación, componentes e infraestructura sin dar acceso cruzado.
- **CRITERIO DE DISEÑO, NO DECISIÓN NUEVA.** Debe evitarse equiparar automáticamente «junta conformada» en el sistema Madrid con «junta oficialmente instalada» en el reporte electoral; son hechos operativos distintos. Tampoco se deduce todavía del acuerdo que Madrid alimentará automáticamente el tablero DGSMH.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Cuál será la fuente autorizada de los datos de avance nacional de Madrid: (A) solo el reporte consular explícito, sin automatización desde Madrid; (B) sincronización automática de eventos operativos de Madrid, previa definición de equivalencias; (C) eventos internos de Madrid como sugerencias/datos preliminares que requieren confirmación del consulado antes de incorporarse al avance oficial. Esta decisión define el flujo entre módulos, no un detalle de pantalla.

## Madrid informa mediante reporte consular independiente (decisión estratégica 3)

- **DECIDIDO.** Pablo elige la **opción A**: los datos del sistema operativo interno de Madrid **NO alimentan automáticamente** el tablero nacional DGSMH ni se ofrecen como hitos preliminares a confirmar. Madrid reporta avance de instalación, votación, escrutinio, escaneo e incidencias mediante la **interfaz consular**, como los demás consulados. Se mantiene la separación funcional entre el sistema interno de Madrid y los reportes oficiales a Quito, pese a compartir plataforma técnica e infraestructura.
- **CONSECUENCIA.** La información interna de conformación de JRV, credenciales, acceso, movimientos y pagos de MJRV no se comunica automáticamente al tablero nacional. Debe evitarse equiparar «JRV conformada» con «JRV instalada»; la información enviada explícitamente por el módulo consular es fuente del seguimiento DGSMH. En Madrid pueden existir procesos paralelos y carga adicional de reportes, aceptada a cambio de la distinción funcional y la consistencia con el resto de consulados.
- **COHERENCIA.** Mantener el catálogo común consulado–recinto–JRV, las interfaces separadas y las restricciones de acceso a datos personales de Madrid. No interpretar la decisión A como autorización para duplicar las bases maestras ni crear sistemas físicamente aislados.
- **ABIERTO / SIGUIENTE DECISIÓN ESTRATÉGICA.** Modelo de acceso de usuarios de la DGSMH al tablero, considerando que en especificación original solo están aprobados consulado y superadmin como roles autenticados. Alternativas: usar solo superadmin, crear rol DGSMH con acceso al tablero y seguimiento pero sin administración, o crear dos niveles de permisos DGSMH (consulta frente a seguimiento). No dar por aprobado ningún rol nuevo antes de decisión.

## Acceso DGSMH con cuentas individuales sin administración (decisión estratégica 4)

- **DECIDIDO.** Pablo eligió la **opción B**: los funcionarios autorizados de la DGSMH accederán al tablero con **cuentas individuales propias** y permisos para consultar el mapa, atender solicitudes urgentes, registrar actuaciones de seguimiento y gestionar/resolver incidencias, pero **sin administración general** de la plataforma. Se añade el rol funcional DGSMH al esquema de autenticación, que previamente solo consideraba consulado y superadmin.
- **CONSECUENCIAS.** Cada actuación desde Quito debe atribuirse al usuario individual autenticado, con fecha/hora; no compartir credenciales superadmin con personal de seguimiento. El superadmin mantiene configuración, importación de cuentas/catálogos y administración de accesos. Los usuarios DGSMH no pueden consultar fotos de cédulas, credenciales, movimientos ni pagos internos de Madrid. **No** se aprueba un segundo nivel de DGSMH de solo lectura (opción C no elegida).
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Forma de entrega y uso de los tres componentes: una aplicación web adaptable a móvil y escritorio, una solución web con componente instalable tipo PWA para operaciones móviles, o aplicaciones móviles nativas además de tablero web. Considerar alcance completo para el 29-11-2026, escaneo QR por cámara, toma de fotos y borradores offline con envío manual. Decidir primero experiencia general; no programar sin autorización.

## Plataforma web adaptable para los tres sistemas (decisión estratégica 5)

- **DECIDIDO.** Pablo eligió **opción A**: los tres sistemas del Proyecto CNE se entregarán como **plataforma 100 % web y adaptable** a equipos de escritorio, tabletas y teléfonos móviles mediante navegador, sin instalación obligatoria y sin desarrollo de apps nativas ni PWA instalable en esta primera versión. Interfaces propias para consulado, DGSMH y operaciones internas de Madrid, según el dispositivo y sus tareas.
- **IMPLICACIONES TÉCNICAS.** La web móvil debe permitir usar cámara del dispositivo para lectura de QR y fotografías de cédulas, sujeto a permisos del navegador y contexto seguro HTTPS; los lectores dedicados pueden requerir adaptaciones. Conservar el comportamiento aprobado de **borradores locales fuera de línea con revisión y envío manual**, sin afirmar que una web sin red puede necesariamente cargar todos los recursos si no se han preparado para ello. La disponibilidad offline de la interfaz y la gestión segura del almacenamiento local deben validarse; la opción A no implica sincronización automática, PWA o aplicación nativa.
- **COHERENCIA.** No se altera la decisión de primera versión completa para el 29-11-2026 ni la separación de módulos y permisos. La elección tecnológica aún no implica una tecnología frontend concreta, proveedor de alojamiento ni una solución de despliegue.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Vida útil de la plataforma y capacidad de configurar distintas elecciones: proyecto acotado a la elección del 29-11-2026, sistema nacional reutilizable para sucesivas elecciones con el módulo de Madrid reutilizable, o reportes nacionales reutilizables y operación de Madrid específica de esta jornada. Considerar que el tipo de elección, papeletas, padrón, JRV, recintos, calendarios y plantillas pueden cambiar.

## Alcance temporal único: jornada de 29-11-2026 (decisión estratégica 6)

- **DECIDIDO.** Pablo seleccionó la **opción A**: el Proyecto CNE se diseña específicamente para la jornada electoral del **29 de noviembre de 2026**, **sin** crear mecanismos para configurar, administrar o reutilizar la plataforma en futuras elecciones. Los tres componentes completos definidos para la primera versión se mantienen en alcance; la decisión simplifica la configuración, flujos y modelo de datos. No autoriza por sí misma desarrollo de código.
- **IMPLICACIONES.** Usar los parámetros, recintos, JRV, documentos y fases de este proceso, conforme a los archivos oficiales y operativos que se aporten. No construir selector de elecciones, histórico multielección, administrador de nuevas convocatorias ni generador general de procesos electorales. Sí conviene conservar trazabilidad, documentación y capacidad de cierre/exportación de **esta** jornada; el formato final y destino del archivo de resultados siguen abiertos. Evitar borrado automático no solicitado.
- **ABIERTO / SIGUIENTE DECISIÓN ESTRATÉGICA.** Gobierno del catálogo maestro electoral (consulados, recintos, JRV y número de electores) que Pablo entregará: (A) importación y corrección solo por superadministrador; (B) importación central con posibilidad de editar datos propios por cada consulado; (C) importación central con solicitudes de corrección consulares y validación por superadministrador. No confundir la edición del catálogo con los reportes operativos ni los cambios de integrantes de JRV en Madrid.

## Alcance temporal: solo elección 29-11-2026 (decisión estratégica 6)

- **DECIDIDO.** Pablo eligió opción **A**: el Proyecto CNE se construye **exclusivamente para la jornada electoral del 29 de noviembre de 2026**, no como un producto multi-elección reutilizable. Esto abarca los tres sistemas completos definidos para la primera versión.
- **CONSECUENCIAS.** No diseñar paneles para crear elecciones sucesivas, calendarios multianuales, catálogos configurables por comicio ni migraciones funcionales futuras. Usar los datos reales de consulado–recinto–JRV para esta elección, sus plantillas y fases operativas vigentes; mantener separación de acceso, integridad, auditoría y protección de datos aunque sea una herramienta temporal. No confundir alcance temporal con destrucción inmediata de datos ni falta de respaldo: los criterios de conservación y retirada del sistema siguen abiertos.
- **ADVERTENCIA.** El alcance completo y la fecha límite de doce días implican riesgo elevado de entrega. La elección de uso único prioriza simplicidad de configuración y despliegue, sin prometer viabilidad todavía ni iniciar programación sin autorización.
- **ABIERTO / PRÓXIMA PREGUNTA ESTRATÉGICA.** Modelo de despliegue y propiedad operativa de la plataforma antes de la elección: alojamiento administrado en un proveedor de nube; infraestructura gestionada por el usuario/equipo de proyecto; o infraestructura institucional del MREMH previa coordinación técnica y autorizaciones. No asumir que existe aval institucional o recursos asignados. Esta decisión puede afectar plazos, seguridad y disponibilidad internacional.
