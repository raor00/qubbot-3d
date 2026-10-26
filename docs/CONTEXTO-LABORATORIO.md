# Contexto para otro agente: Qubbot → Laboratorio de sistemas Arduino

Documento de traspaso, al 2026-10-25. Cuenta qué es el proyecto, qué se hizo, qué cambió, la nueva vertiente y por dónde seguir. Léelo entero antes de tocar código. Después lee `CLAUDE.md`, `MEMORY.md` y `.claude/skills/platanus-ade/SKILL.md`.

## 1. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Repo original del equipo (hackathon Platanus Hack 26, Caracas) | https://github.com/adirsonmartinez/platanus-hack-26-ve-team-12, en local `/Users/jesus/orca/projects/team-12` |
| **Fork nuevo, donde se trabaja ahora** | https://github.com/raor00/qubbot-3d, en local **`/Users/jesus/orca/projects/qubbot-3d`** |
| Remotos del fork | `origin` = el fork (raor00), `upstream` = el repo del equipo |
| Rama base del fork | `feature/base-completa`: `develop` del equipo + toda la rama de Qubi, con 861 pruebas en verde. Ya está subida. |
| **Rama de trabajo actual** | `feature/laboratorio-arduino`, que sale de `feature/base-completa`. Local, sin commit. |
| PR del equipo | #3 (`feature/llamada-remi` → `develop`): choca con `develop` y tiene una prueba de claves en rojo. En el fork ya está resuelto. |
| Landing anterior (Qubbot como ADE de software) | https://claude.ai/artifact/WXLxv6FZ9aydvQhHH3NkC7. Hay que rehacerla para el laboratorio. |

## 2. Qué es la app (no cambia)

App de escritorio **Electron** (también hay versión web de demo). Es un ADE visual: un **mapa 3D isométrico** (three.js) más un **chat agéntico** (Claude Code, Codex, OpenCode, Grok vía MCP) y **Qubi**, un robot 3D que camina por el mapa, habla por voz (ElevenLabs o Grok) y hace gestos.

- **Código:**
  - JS vanilla con ESM en `renderer/`;
  - patrón MVVM: `models/` y `viewmodels/` puros, sin DOM ni three; `views/` delgadas;
  - estado en `Observable` (`renderer/core/observable.js`);
  - `electron/` es CommonJS (proceso main).
- **Pruebas:** `npm test` (`node --test`). Los archivos `tests/renderer/*.test.mjs` se incluyen solos; las pruebas de electron se listan a mano en `package.json`. Bundle: `npx esbuild renderer/main.js --bundle --outfile=/dev/null '--external:*.css' '--external:*.task'`.
- **Principio central:** «el LLM propone, el plano decide». Los verificadores son deterministas y deciden qué es seguro o correcto; ningún modelo lo decide. Los agentes solo actúan mediante las herramientas MCP de Qubbot (`electron/mcpServer.js`, con manejadores en `electron/main.js`; los ids técnicos siguen siendo `platanus_*`).
- **Texto visible:** siempre en español sencillo, para personas que no programan, y solo en `renderer/i18n/es.js` o `electron/strings.js`.
- **Nombres:** el producto es **Qubbot** y el bot **Qubi**. No usar «Remi» ni «Platanus» en texto visible. `userData` sigue fijado a `platanus-ide`.

## 3. Lo que se construyó antes del cambio de rumbo (ya está en `feature/base-completa`)

- **Llamada con Qubi**:
  - voz en tiempo real;
  - saludos venezolanos variados (`electron/strings.js` → `voice.greetings`);
  - órdenes directas, sin pedir confirmaciones de más ni leer rutas en voz alta;
  - herramientas de voz `ir_a`, `mostrar_carpeta`, `revisar_archivo`, `gesto`, `auditar`, `reparar`;
  - Qubi camina hacia lo que revisa («ya voy pa' allá»);
  - gestos, caras, mirada que sigue al cursor, y gira con la cámara;
  - el modo Vibe/Dev cambia su nivel técnico;
  - equipo de mini-robots trabajadores.
- **Auditoría de seguridad real** (`electron/securityAudit.js`, `electron/securityStore.js`):
  - reglas por contenido y por git (secreto rastreado o en el historial);
  - porcentaje = 100 − 15·rojos − 5·amarillos, con historial guardado;
  - las reparaciones se verifican con una nueva auditoría.
- **Comandos del agente:** `platanus_run_command`, con lista permitida, sin shell, sin `-g` y salida con claves tapadas (`electron/commandRun.js`, endurecido tras una revisión adversaria). También `platanus_delete_file`.
- **Sin datos falsos en escritorio:** servicios «con acceso / sin acceso / sin comprobar»; una carpeta de escritorio nunca es demo.
- **Lo que trajo `develop` del equipo:**
  - gestos con las manos (MediaPipe);
  - «Conectar mi cuenta» de Supabase;
  - nuevo flujo de bienvenida;
  - integraciones «por conectar» (`pending`);
  - carpetas de confianza (`trust.js`).

## 4. La nueva vertiente (lo que pidió el usuario)

Palabras del usuario, resumidas:
- Qubbot pasa a ser un **laboratorio de sistemas Arduino**: modelado 3D de sistemas Arduino para **imprimir en 3D**.
- Habrá un **kit o catálogo de componentes** con el que la gente construye sus sistemas.
- Más adelante se aceptarán **productos externos de otros fabricantes de sistemas Arduino** para integrarlos al catálogo.
- Se ofrecería el **servicio de modelar e imprimir esas piezas** (cajas, soportes, chasis).
- «Todo se mantendría igual, solo que ahora se enfocaría en construir dichas piezas»: el mismo ADE interactivo con mapa 3D, chat y Qubi.
- **Donde estaba el Explorador va el Catálogo de componentes.** Las piezas se **arrastran** al mapa y se va **maquetando**: se colocan piezas y se hacen las **uniones**, es decir, los cables.
- El **chat se especializa**: conversando, sugiere qué se puede construir y cómo serían las conexiones, y **puede hacerlas él mismo**.
- Hay que **rehacer la landing** con toda esta información.
- Debe ser **«algo bastante potente», con gran impacto visual**.

### Criterios del jurado (presentación «cómo hacer un buen demo», Platanus Hack)

| Criterio | Peso |
|---|---|
| Originalidad | 15 % |
| Ambición | 20 % |
| Ejecución | 20 % |
| **Aspecto técnico** | **25 %** |
| Impacto | 20 % |

- **Formato:** 3 jueces. Demo de 3 minutos con corte duro a los 3:01, más 2 minutos de preguntas. La demo se graba y se publica.
- **Estructura sugerida:**
  1. problema (~20 s);
  2. solución, impacto y ambición (20–30 s);
  3. demo en vivo (125–140 s);
  4. gracias.
- **Consejos de la presentación:**
  - títulos con mensaje, nada de «Problema»;
  - modo oscuro, por el streaming;
  - letra grande y sin faltas de ortografía;
  - demo ensayada y creativa.

Qué implica para el producto:
- **Lo técnico pesa más:** checker eléctrico determinista, generación paramétrica de piezas imprimibles (STL), agente con herramientas MCP validadas.
- **Ejecución:** la demo en vivo tiene que funcionar de punta a punta sin trucos.
- **Impacto:** educación STEM, makers en Latinoamérica, prototipos sin saber electrónica ni CAD.

## 5. Diseño del laboratorio (decidido y en curso)

- **El diseño es un archivo del proyecto:** `laboratorio/circuito.json`, con la forma `{ version: 1, parts: [{ id, type, x, z, rot }], wires: [{ id, from: { part, pin }, to: { part, pin } }] }`. Los cambios del agente se aprueban, se respaldan y se pueden deshacer como cualquier otro archivo.
- **Unidades del banco:** 1 unidad = 10 mm; `rot` = cuartos de vuelta.
- **Catálogo:** `renderer/models/componentCatalog.js` (hecho).
  - 4 placas: Arduino Uno, Nano, ESP32 DevKit y Raspberry Pi Pico.
  - 15 piezas en 5 secciones:
    - sensores: HC-SR04, PIR, DHT22, humedad de suelo, LDR;
    - actuadores: servo SG90, relé, buzzer, LED, L298N;
    - pantallas: OLED 128×64, LCD 1602 I2C;
    - entradas: botón, potenciómetro;
    - energía: portapilas 4×AA.
  - **Datos de cada pieza:**
    - medidas en mm (`size`) y agujeros de montaje (`holes`, en las placas);
    - pines con `kinds` en las placas y `accepts` en las piezas;
    - voltaje, consumo en mA, nivel lógico;
    - fuente con licencia.
  - Los nombres visibles irán en `es.js` → `lab.parts.<id>` (todavía no están).
- **Modelo del circuito:** `renderer/models/circuitModel.js` (hecho, con 10 pruebas en verde en `tests/renderer/circuitModel.test.mjs`).
  - **Funciones:** `parseDesign` (descarta lo roto o desconocido), `serializeDesign`, `addPart`, `movePart`, `rotatePart`, `removePart`, `connect`, `disconnect`.
  - **`checkDesign`, el verificador determinista:**
    - rojo: `short`, `mixedPower`, `overvoltage`;
    - amarillo: `missing`, `wrongPin`, `undervoltage`, `pinShared` (el bus I2C sí se comparte), `level` (5 V hacia una placa de 3,3 V), `budget` (consumo en 5 V mayor de lo que da la placa), `noBoard`.
  - **`autoWire`:** cablea solo una pieza. La energía va según el voltaje; la tierra y el I2C se comparten; las señales van a pines libres, dejando los pines PWM y analógicos para quien los necesita.
  - **`describeDesign`:** el banco en texto para el agente.
- **Distribución en el banco:** `renderer/viewmodels/labLayout.js` (hecho, sin pruebas aún).
  - `partBox`: dónde ocupa cada pieza.
  - `pinSpots` y `pinSpot`: dónde está cada pin en el mundo. En las placas, energía y analógicos van en el borde cercano y el resto en el lejano; en las piezas, todos en una fila.
  - `freeSpot`: un hueco libre para una pieza nueva.
  - `wireKind`: el tipo de cable (energía, tierra, bus o señal), para darle color.

### Lo que falta, en orden

1. **`renderer/viewmodels/labViewModel.js`**, con pruebas.
   - Carga y guarda `laboratorio/circuito.json` mediante un servicio nuevo, `renderer/services/labService.js`. En escritorio usa una IPC dedicada `lab:load` / `lab:save`: main solo escribe ese archivo y lo vuelve a serializar tras `parseDesign`. No usar `fs:write`, que pide confirmación en cada sobrescritura. En la versión web guarda en memoria.
   - Recarga cuando el archivo cambia en disco (`workspace.onChanged`), por ejemplo cuando lo edita el agente.
   - Acciones: `add(type, at)`, `move` (guarda al soltar), `rotate`, `remove`, `select`, `pickPin` (primer clic elige un pin, el segundo conecta), `cancelWire`, `autoWire`, `removeWire`, `setQuery`.
   - El estado incluye `check` (resultado de `checkDesign`).
2. **Vista 3D `renderer/views/scene/labView.js`**, en una capa nueva `lab` de `sceneView`.
   - Hoy `sceneView.layers` solo tiene `map` y `git`. Hay que añadir la capa `lab` y su vista en `AppViewModel.VIEWS`, `ShellViewModel.STAGES` y la pestaña `data-stage="lab"` en `renderer/index.html`.
   - Las placas con su PCB, los pines, las etiquetas y los cables como tubos curvos de color según `wireKind`.
   - **Solo brillan los problemas:** una pieza en rojo o amarillo según `check.parts`.
   - Arrastrar piezas con el patrón `grabber` de `inputController.js` (`hit`, `start`, `move`, `end`).
   - Elegir pines con `userData.pick = { type: 'pin', part, pin }`.
3. **Panel Catálogo en lugar del Explorador.**
   - En `index.html`, `#side-dock`, `data-side="explorer"` se convierte en `data-side="catalog"` (el explorador puede quedar más abajo).
   - `ShellViewModel.SIDE_VIEWS` y `renderCatalog` en `views/ui/shellView.js`.
   - Tarjetas por categoría con buscador, que se arrastran con HTML5 DnD sobre el canvas; al soltar se usa `sceneView.groundPointAt` y luego `add`. Un clic las añade en el centro.
   - Abajo, «Revisión del circuito» con los avisos del verificador en español sencillo y el botón «Conectar solo».
4. **Chat especializado.** Herramientas MCP nuevas en `electron/mcpServer.js` y `electron/main.js`:
   - `platanus_lab_catalog`, `platanus_lab_view` (devuelve `describeDesign` y los avisos);
   - `platanus_lab_add_part {type, near?}`, `platanus_lab_connect {from:'pieza.pin', to:'pieza.pin'}`, `platanus_lab_auto_wire {part}`, `platanus_lab_remove {part|wire}`.

   Detalles:
   - Main carga `circuitModel.js` (ESM) con `import()`, y escribe por el mismo camino de `platanus_write_file` (aprobación, respaldo, `agent:changed`).
   - En `agent/voice.json`, la voz de especialista en sistemas Arduino: sugiere proyectos, explica conexiones en simple y usa las herramientas del laboratorio.
   - Chips del chat: «¿Qué puedo construir?», «Revisa mis conexiones», «Conéctalo tú».
   - La voz de Qubi gana herramientas equivalentes (`callViewModel.js`).
5. **Piezas imprimibles (lo más técnico y visual).**
   - Generar en OpenSCAD una **caja a medida** del circuito con las medidas y `holes` de la placa: huecos para el USB, los sensores y la pantalla, y separadores M3. Primero exportar el `.scad`; después STL con el CLI `openscad` si está instalado.
   - Más tarde: soportes de sensores y brackets de servo con BOSL2.
   - Mostrar la caja en 3D cerrándose sobre el circuito: una animación de «vista explotada» o de ensamblado.
6. **Impacto visual para la demo:**
   - Corriente animada: partículas que viajan por los cables.
   - «Simular»: el LED parpadea, el servo gira, el sensor muestra la distancia.
   - Qubi camina hasta la pieza que conecta.
   - Ensamblado animado de la caja.
   - Exportar el `.ino` generado a partir del circuito.
7. **Productos externos.** Formato de «ficha de componente», el JSON del catálogo, que otros fabricantes envían. Se valida igual (medidas, pines, licencia) antes de entrar.
8. **Landing nueva** del laboratorio, en modo oscuro, con títulos que dan un mensaje y los criterios del jurado en mente.
9. Documentar en `docs/features/laboratorio/README.md`, `CLAUDE.md`, `docs/INTERFAZ.md` y `MEMORY.md`.

## 6. Fuentes abiertas para ampliar el catálogo

Antes de traer nada, confirmar el `LICENSE` de cada repo. Las marcadas «sin confirmar» no se verificaron.

| Fuente | Para qué | Licencia |
|---|---|---|
| YAPP_Box: https://github.com/mrWheel/YAPP_Box | Cajas a medida | MIT (sin confirmar) |
| BOSL2: https://github.com/BelfrySCAD/BOSL2 | Soportes, uniones, roscas | BSD-2, se puede vender |
| NopSCADlib: https://github.com/nophead/NopSCADlib | Más de 1.000 piezas | GPL-3 (sin confirmar): lo derivado sería GPL |
| Adafruit CAD Parts: https://github.com/adafruit/Adafruit_CAD_Parts | Medidas STEP/STL | MIT |
| kicad-lib-arduino: https://github.com/g200kg/kicad-lib-arduino | Placas Arduino en 3D | CC0 |
| kicad-packages3D: https://gitlab.com/kicad/libraries/kicad-packages3D | Componentes | CC-BY-SA 4.0 |
| fritzing-parts: https://github.com/fritzing/fritzing-parts | Dibujos 2D | CC-BY-SA 3.0 |
| Arduino docs-content: https://github.com/arduino/docs-content | Planos oficiales | Variable |

No sirven para vender:
- **SparkFun 3D_Models:** sin licencia clara.
- **Ultimate Box Maker:** prohíbe el uso comercial.
- **Thingiverse y Printables:** licencia modelo por modelo, sin descarga masiva.

El usuario dijo que avisará cuándo traer estas fuentes: «cuando yo te indique vas a traerte la info».

## 7. Reglas que no se rompen

- Nunca abrir ni imprimir `.env` / `.env.local`. No pedir ni aceptar claves en el chat. No poner claves en el código; las claves falsas de las pruebas se arman al ejecutar, porque `tests/secrets.test.mjs` revisa los archivos rastreados.
- No aflojar la seguridad de los agentes: actúan solo mediante MCP de Qubbot.
- No subir `vercel.json` del repo del equipo.
- Nunca dejar la app en modo demo (`PLATANUS_DEMO`).
- Pruebas primero; la lógica pura en `models/` y `viewmodels/`.
- Hacer commit o push solo cuando el usuario lo pida. Usar git flow: `feature/*` → PR a `develop`. Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Mantener al día `MEMORY.md` y la skill `platanus-ade` (`references/lessons.md`).
- El usuario escribe en español informal. Respuestas breves y directas.
