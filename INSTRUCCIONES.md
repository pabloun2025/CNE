# CNE: instrucciones para continuar

Este archivo es la fuente para que otra IA siga el trabajo si esta conversación se corta. Actualizarlo cada vez que Pablo cierre una decisión. No escribir código de la aplicación hasta que él lo pida. Cuando lo pida, el primer entregable es un handover completo para que Claude o Codex construyan.

Cómo preguntar: una decisión por mensaje, opciones A, B, C y “otro”. Este chat no tiene botones; Pablo responde con la letra.

Repo: https://github.com/pabloun2025/CNE (privado, cuenta pabloun2025).

## Qué es

Sistema de monitoreo del proceso electoral de Ecuador del 29 de noviembre de 2026.

Usuarios: consulados ecuatorianos en el exterior (cargan información) y la Dirección de Gestión de Servicios de Movilidad Humana (DGSMH), que monitorea con un tablero en tiempo real (alertas y avances).

## Orden de trabajo

1. Primero el consulado en Madrid (lo más complejo). En curso.
2. Después, el login de todos los consulados (copiar estructura, reglas y control de bots de DEMP) y el tablero de la DGSMH.

## Madrid: credenciales MJRV (decidido)

Se crean en parametrización, antes del proceso electoral.

- Carga por Excel: nombre, apellido, número de cédula, rol (presidente, secretario, vocal, etc.), junta (1 Masculina, xx Femenina, etc.), email y teléfono con WhatsApp.
- Alta, edición y baja individual.
- Plantilla PDF ya diseñada, con un espacio en blanco al centro donde van los datos y el QR.
- Salidas: PDF individual, collage en A4 para imprimir y recortar, o envío uno a uno por WhatsApp.
- WhatsApp: Evolution API, reutilizando el método de teinvito (preferido frente a DEMP).
- Tamaño de la credencial: 85,6 × 54 mm.
- El QR es solo el número de cédula.

## Cuentas (decidido)

Solo el consulado y el superadmin tienen cuenta y contraseña. Los funcionarios de puerta no.

## Puerta (decidido)

Igual que teinvito: enlace `{APP}/puerta/{token}`, activo hasta revocarlo, se copia o se manda por WhatsApp. El funcionario abre sin login. Escaneo válido: verde y un pitido. Negativo: rojo y dos pitidos.

El administrador de Madrid carga nombre, apellido y PIN de cada funcionario autorizado. El PIN lo identifica donde el sistema pide su intervención, sin cuenta.

## Foto de la cédula y pago (decidido)

La foto se toma durante el proceso, por el MJRV o por un funcionario. Recuadro para encajar la cédula; lo ideal es disparo automático al encajar. Recorte automático. Anverso y reverso van como anexo en la página siguiente del registro.

Si faltan las fotos, el botón de imprimir el pago no se habilita. Quien administra la ventanilla debe tomarlas antes de seguir. Un QR incompleto obliga al funcionario a completarlas antes de proceder.

## Madrid: aún por cerrar

- Tablero de constitución de las juntas y toma de decisiones.
- Contenido del recibo impreso (datos del pago, firma).

## Login DEMP (referencia, no copiado aún)

App de funcionarios en funcionario.consulado.app. Sesión de 12 horas. Roles: consulado, centro de impresión y superadmin (TOTP). Sin captcha en el login; límite por IP y bloqueo progresivo. Turnstile solo en consulta pública, alta y restablecer clave.

## Pregunta abierta

¿Qué muestra el tablero de las juntas?

A) Por junta: quiénes llegaron, quién falta y si ya se constituyó
B) Solo el conteo: constituidas, incompletas y ausentes
C) Otro
