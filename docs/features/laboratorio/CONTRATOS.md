# Laboratorio: contratos entre módulos

Lee esto antes de escribir código del laboratorio. Cada módulo tiene un dueño y nadie toca archivos de otro. Si necesitas algo de otro módulo, usa su API tal como está aquí. Si hace falta un cambio, dilo en tu informe final; no lo hagas tú.

Contexto general: `docs/CONTEXTO-LABORATORIO.md`. Reglas del repo: `CLAUDE.md`.
- ESM vanilla, MVVM: `models/` y `viewmodels/` puros, sin DOM ni three.
- Pruebas con `node --test` en `tests/renderer/*.test.mjs` (se incluyen solas).
- Texto visible solo en `renderer/i18n/lab.es.js` (`strings.lab`), ya escrito. Si te falta un texto, añádelo **solo dentro de tu bloque** de ese archivo, en un sub-objeto con el nombre de tu módulo, y avísalo.

## Ya hecho (no editar sin avisar)

- **`renderer/models/componentCatalog.js`:**
  - `COMPONENTS`, `CATEGORIES`, `PIN_KINDS`, `componentOf(id)`, `catalogSections(query, nameOf)`;
  - cada pieza tiene `id`, `kind`, `category`, `size` [ancho, fondo, alto] en mm, `color`, `pins`, `volts`, `mA`, `logic`, `budgetMa`, `holes` (placas: [x, y] en mm desde la esquina) y `source`.
- **`renderer/models/circuitModel.js`:**
  - `DESIGN_FILE` = `'laboratorio/circuito.json'`;
  - `emptyDesign`, `parseDesign(text)` → `{ design, dropped, error }`, `serializeDesign`;
  - `addPart(d, type, {x, z, rot})` → `{ design, id }`, `movePart`, `rotatePart`, `removePart`;
  - `connect(d, from, to)` → `{ design, ok, reason, id }`, `disconnect(d, wireId)`;
  - `checkDesign(d)` → `{ level, issues, parts: { id: 'green'|'yellow'|'red' }, budget }`;
  - `autoWire(d, partId, boardId?)` → `{ design, added, missing }`, `describeDesign(d)`.
- **`renderer/viewmodels/labLayout.js`:** `MM` = 0.1 (1 unidad del mundo = 10 mm), `partBox(part)`, `pinSpots(part)` → `[{ pin, x, y, z }]`, `pinSpot(part, pin)`, `freeSpot(design, type, x, z)`, `wireKind(design, wire)` → `'power'|'gnd'|'bus'|'signal'`.
- **`sceneView.layers.lab`:** un `THREE.Group` que solo se ve con la vista `lab`. También `sceneView.groundPointAt(x, y)`, `pickAt(x, y, objects)` (busca `userData.pick` subiendo por los padres), `toScreen` y `onFrame(cb(t, dt))`.
- **Materiales y paleta:** `renderer/views/scene/materials.js` (`M`, `PALETTE`). Estilo oscuro, neutro, con un acento morado. **Solo brillan los problemas** (rojo y ámbar) y lo que está «vivo» en la simulación (LED encendido, corriente que fluye).

## Diseño (archivo del proyecto)

`laboratorio/circuito.json` = `{ version: 1, parts: [{ id, type, x, z, rot }], wires: [{ id, from: { part, pin }, to: { part, pin } }] }`. `x` y `z` van en unidades del mundo; `rot` en cuartos de vuelta.

## `renderer/services/labService.js` (dueño: viewmodel)

```js
createLabService(bridge = window.platanus) → {
  available,                    // true en escritorio
  load() → { ok, data: string|null },        // el texto del archivo, null si no existe
  save(text) → { ok, error? },               // main lo valida con parseDesign y lo re-serializa
  exportFile(kind, content) → { ok, data: { file } }   // kind: 'stl' (content: base64) | 'scad' | 'ino'
}
```

En la web guarda en memoria. En escritorio usa el puente `window.platanus.lab`:
- `load()` → IPC `lab:load`;
- `save(text)` → `lab:save`;
- `exportFile(kind, content)` → `lab:export`.

Rutas fijas: `laboratorio/caja.stl`, `laboratorio/caja.scad`, `laboratorio/circuito/circuito.ino`.

## `renderer/viewmodels/labViewModel.js` (dueño: viewmodel)

```js
new LabViewModel({ projectModel, labService, bus? })
store: {
  open, loaded,
  design, check,                       // check = checkDesign(design)
  selected: partId|null,
  wiring: { part, pin }|null,          // primer pin elegido, esperando el segundo
  hover: { part, pin }|null,
  query, sections,                     // catalogSections(query, nombre visible)
  notice: { kind: 'ok'|'warn'|'error', text }|null,
  sim: { running, t },                 // t en ms desde que empezó
  simState,                            // simulate(design, t): el estado de cada pieza (ver simModel)
  enclosure: { visible, exploded, data }, // data = enclosureFor(design)
}
add(type, at?) → id     move(id, {x, z})     moveEnd(id)     rotate(id)     remove(id)
select(id|null)     pickPin(part, pin)     setHover(part, pin)|setHover(null)     cancelWire()
autoWire(id?)       // sin id: todas las piezas
removeWire(id)      setQuery(q)      escape()
onDiskChanged(paths)     // recarga si cambió DESIGN_FILE y no fue un guardado propio
toggleSim()      tick(dt)   // la vista llama tick cada cuadro mientras sim.running
toggleEnclosure()      toggleExplode()      exportEnclosure('stl'|'scad')      exportSketch()
```

## `renderer/models/simModel.js` (dueño: Pi qwen)

`simulate(design, tMs)` → `{ parts: { [id]: state }, wires: { [wireId]: flow } }`.
- Es determinista: el mismo `t` da el mismo resultado.
- Una pieza mal conectada (con `missing` o `wrongPin` en `checkDesign`) queda `{ kind, dead: true }`.
- Valores de `flow` (0..1, la corriente que se ve en el cable): `power` y `gnd` = 1 si la pieza vive; las señales laten.

| Pieza | Estado |
|---|---|
| `led` | `{ kind:'led', on }`: parpadea a 1 Hz, o se enciende si un sensor ve algo cerca |
| `servo-sg90` | `{ kind:'servo', angle }`: 0–180, sigue la distancia o barre |
| `hc-sr04` | `{ kind:'distance', cm }`: oscila entre 5 y 60 cm |
| `pir` | `{ kind:'motion', detected }` |
| `dht22` | `{ kind:'climate', c, h }` |
| `soil` | `{ kind:'soil', percent }` |
| `ldr` | `{ kind:'light', percent }` |
| `buzzer` | `{ kind:'buzzer', on }` |
| `relay` | `{ kind:'relay', on }` |
| `oled-128x64` / `lcd-1602-i2c` | `{ kind:'display', lines: [string, string] }`: muestra la lectura principal |
| `button` | `{ kind:'button', pressed }` |
| `potentiometer` | `{ kind:'knob', percent }` |
| `l298n` | `{ kind:'motors', speed }` |
| placas | `{ kind:'board', running }` |

## `renderer/models/sketchModel.js` (dueño: Pi qwen)

`sketchFor(design)` → `{ ok, reason?, code, board, libraries: [string] }`.
- `code` es el `.ino` completo y compilable, con `setup()` y `loop()`.
- Usa los pines reales del cableado y hace lo mismo que la simulación: leer los sensores, actuar y mostrar en pantalla.
- Comentarios del `.ino` en español sencillo.
- `reason`: `'noBoard'`.

## `renderer/models/enclosureModel.js` (dueño: agente caja)

`enclosureFor(design, opts?)` → `{ ok, reason?, size: { w, d, h }, solids, cutouts, printMinutes, grams }`.
- Todo va en **mm**, en un marco local centrado en el banco: x = x del mundo × 10, z = z del mundo × 10, y hacia arriba desde el piso de la caja.
- `solids`: `[{ kind: 'box', min: [x, y, z], max: [x, y, z], group: 'base'|'lid' } | { kind: 'cylinder', center: [x, y, z], r, h, segments, group }]`.
  - Las piezas se tocan sin solaparse, para un STL limpio.
  - Separadores M3 bajo los `holes` de la placa.
  - Huecos en las paredes (USB de la placa, «ojos» del HC-SR04) y en la tapa (ventana de pantalla, domo del PIR).
- `toStl(enclosure, group?)` → `ArrayBuffer`: STL binario de triángulos con normales.
- `toScad(enclosure)` → `string`: OpenSCAD equivalente.
- Los datos de huecos por tipo de pieza van en `renderer/models/enclosureFeatures.js` (mismo dueño).

## Vista 3D

**`renderer/views/scene/lab/partMeshes.js`** (dueño: agente modelos 3D)

`buildPart(type)` → `{ group, pins: Map<pinId, Object3D>, setLevel(level), setSelected(bool), setHover(pinId|null), setSim(state|null), update(t, dt) }`.
- Modelos procedurales detallados y reconocibles. Por ejemplo:
  - Uno: PCB azul, chip, cabezales hembra, USB-B, jack;
  - HC-SR04: dos «ojos» de malla plateada;
  - servo: cuerpo azul y brazo blanco que gira con `angle`;
  - LED: domo que brilla con `on`;
  - OLED: pantalla con textura de canvas que muestra `lines`;
  - DHT22: rejilla blanca; relé: caja azul; botón: capuchón; perilla: eje que gira.
- Medidas a escala con `MM`. El origen está en el centro de la huella, con y = 0 en el piso.
- Los pines van en las posiciones locales que da `pinSpots` con `{ type, x: 0, z: 0, rot: 0 }`.
- Cada pin lleva `userData.pick = { type: 'pin', pin }`; quien llama añade `part`. El cuerpo lleva `userData.pick = { type: 'part' }`.

**`renderer/views/scene/labView.js`** + `lab/wireMeshes.js` (dueño: agente banco)

`createLabView({ sceneView, labels, labViewModel, cameraViewModel })` → `{ grabber, picker: { targets, handle(pick) }, update }`.
- Interacción:
  - arrastrar piezas (grabber), elegir pines (primer clic y segundo clic);
  - una línea elástica desde el pin elegido hasta el cursor; hover de pin con etiqueta;
  - anillo de selección; resplandor rojo o ámbar según `check.parts`.
- Cables: tubos curvos (arco) del color de `wireKind` (`power` rojo apagado, `gnd` gris oscuro, `bus` azul, `signal` claro), con partículas que viajan cuando `sim.running` según `simState.wires`.
- La caja: `lab/enclosureMesh.js`, del agente caja, con la API `buildEnclosure(data)` → `{ group, setExploded(bool), update(t, dt) }`. Es translúcida, y en vista explotada la tapa sube y las paredes se abren con easing.
- Un banco vacío muestra un tapete o base de trabajo sutil.

## UI (dueño: agente panel)

- **`renderer/views/ui/catalogView.js`:** `renderCatalog({ labViewModel })` → `HTMLElement[]` para el panel lateral.
  - Buscador, secciones y tarjetas con mini ícono SVG por categoría, nombre, descripción, voltaje y mA.
  - Las tarjetas son `draggable` y ponen `dataTransfer` `'application/x-qubbot-part'` = id.
  - Debajo, «Revisión del circuito» con los avisos (`strings.lab.check.issues[key]`) y un botón «Arreglar con Qubi» que llama `actions.askAgent(prompt)`.
- **`renderer/views/ui/labToolbarView.js`:** `createLabToolbarView({ stage, labViewModel, appViewModel, actions })`.
  - Barra flotante sobre el escenario cuando la vista es `lab`.
  - Botones: Simular/Detener, Conectar solo, Caja (Ver / Ver por dentro / STL / OpenSCAD), Código, y con una pieza seleccionada Girar y Quitar.
  - Muestra `notice`.
- **`renderer/views/ui/labDropView.js`:** `attachLabDrop({ stage, sceneView, labViewModel, isActive })`. Al soltar sobre el canvas usa `groundPointAt` y luego `add(type, {x, z})`. Mientras se arrastra muestra una sombra de la huella.
- **Estilos:** en `renderer/styles/lab.css`.

## Electron (dueño: agente main)

- **`electron/lab.js`** (CJS): carga `renderer/models/circuitModel.js` con `import()` (ESM).
  - `readDesign(workspace)`;
  - `applyLabTool(name, args, design)` → `{ design, reply }`, para:
    - `lab_add_part {type, near?}`, `lab_connect {from: 'pieza.pin', to: 'pieza.pin'}`, `lab_auto_wire {part?}`, `lab_remove {part?|wire?}`;
    - `lab_view` y `lab_catalog`, que son de solo lectura.
- **IPC:** `lab:load`, `lab:save` (valida y re-serializa; solo escribe `DESIGN_FILE`, sin diálogo) y `lab:export` (solo las 3 rutas fijas). En preload, `lab: { load, save, export }`.
- **MCP:** `platanus_lab_catalog`, `platanus_lab_view`, `platanus_lab_add_part`, `platanus_lab_connect`, `platanus_lab_auto_wire`, `platanus_lab_remove`.
  - Las de escritura van por el mismo camino que `platanus_write_file`: aprobación según el modo, respaldo, `agent:changed`.
  - La ruta `/ro` solo deja las de lectura.
- **Respuestas al agente:** con `describeDesign` y los avisos de `checkDesign`. Textos en `electron/strings.js` (`mcp.lab`).
- **Voz del agente:** en `agent/voice.json`, especialista en sistemas Arduino.
  - Sugiere proyectos con las piezas del catálogo y explica las conexiones en simple.
  - Usa las herramientas del laboratorio.
  - Nunca da por buena una conexión que el verificador marca en rojo.
