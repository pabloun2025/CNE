# Guía para agentes — Proyecto CNE (elección del 29-11-2026 en el exterior)

**Alcance vigente (18-11-2026): solo el sistema operativo de Madrid**, publicado en https://madrid.consulado.app. El portal consular y el tablero DGSMH no se construyen.

## Orden de lectura

0. **`docs/TRASPASO.md`** — estado actual, infraestructura, cuentas, decisiones y pendientes. Empiece aquí.
1. `ESPECIFICACION_FUNCIONAL.md` — documento canónico. Prevalece sobre todo lo demás (las entradas «DECIDIDO (18-11-2026)» sustituyen lo anterior).
2. `insumos/GUIA_DE_USO_PARA_CLAUDE.md` — insumos aportados, fuentes oficiales y qué falta.
3. `docs/diseno/` — plan vigente de Madrid: `07-plan-madrid.md`, `09-cambios-decisiones.md` y comprobaciones en `08-…`. 00–06 son referencia del diseño inicial.
4. `INSTRUCCIONES.md` — solo historial.

## Reglas que no se negocian

- **Pautas Karpathy** (`.claude/skills/karpathy-guidelines/SKILL.md`): pensar antes de programar, simplicidad primero, cambios quirúrgicos, ejecución guiada por metas verificables.
- **No inventar datos.** Ni recintos, ni electores, ni MJRV, ni importes, ni tipo de cambio, ni catálogos de incidencias. Lo que no está aportado se marca como **pendiente** y el sistema funciona sin él (importación posterior). Los datos de ejemplo para pruebas son evidentemente ficticios (p. ej. «APELLIDO PRUEBA 001», cédulas 0000000001…) y llevan la etiqueta de prueba.
- **Distinguir siempre confirmado / pendiente** con fuente y fecha en los datos importados.
- **Repositorios de referencia solo lectura:** `consulares`, `teinvito`, `DEMP`. Se copia código a CNE adaptándolo; nunca se modifica, se hace commit ni se despliega en ellos.
- **Producción compartida.** La VM Oracle (`ubuntu@51.170.51.109`) ya sirve consulares y teinvito. CNE va en su propia carpeta (`/home/ubuntu/cne`), su propio proyecto Docker Compose y datos y permisos separados. Nunca se reinicia, detiene ni modifica un contenedor ajeno sin visto bueno expreso de Pablo.
- **Secretos.** Nunca en el repositorio, en la salida de comandos ni en conversaciones. Viven en los secretos de GitHub de `pabloun2025/CNE` y en `/home/ubuntu/cne/.env.production` del servidor.
- **Envíos reales.** Pruebas y local usan proveedores simulados. No se envía ningún WhatsApp ni correo real sin orden expresa.
- **Madrid nunca alimenta automáticamente el tablero de Quito.** Imprimir un acta no confirma un pago.
- Interfaz en español, trato de usted, frases cortas. Comentarios del código en español, breves, explicando el porqué.

## Agentes

- `cne-disenador` (Opus): diseña arquitectura, datos, pantallas y el plan de tareas. No escribe código de la aplicación.
- `cne-programador` (Sonnet): implementa el plan tarea por tarea, prueba y prepara la publicación.
- Publicar: merge en `main` → flujo `oracle-deploy.yml` → `verificar-sitios.yml` (detalle en `docs/TRASPASO.md` §4).

## Antes de dar algo por terminado

`npx tsc --noEmit -p .`, `npm run lint`, `npm test` y `npm run build`. Las pantallas se revisan también a 375 px.
