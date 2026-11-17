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
