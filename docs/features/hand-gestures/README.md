# Gestos con la mano

Con la cámara encendida, la persona maneja el mapa 3D con las manos, sin tocar el mouse:
- mover el mapa con un pellizco;
- acercar, alejar y girar con dos pellizcos: una mano sostiene y la otra se mueve;
- elegir carpetas, archivos o cualquier botón dejando el cursor quieto.

- Spec: [`spec/003-hand-gestures.md`](../../../spec/003-hand-gestures.md) (gestos para acercar, alejar, girar y seleccionar)
- Rama: `feature/hand-gestures`

## Cómo se usa

1. Toca el botón de la mano en los controles del mapa (abajo a la izquierda). La primera vez el sistema pide permiso para usar la cámara.
2. Aparece una vista previa pequeña de la cámara, en espejo, que dice qué está haciendo la mano. El "?" muestra la lista de gestos.
3. El mismo botón apaga la cámara; cerrar el proyecto también.

La cámara es la misma que usa el [control sin manos](../hands-free/README.md), pero nunca a la vez: encender las manos apaga el control sin manos hasta el próximo inicio.

| Gesto | Qué hace | La vista previa dice |
|---|---|---|
| Pellizco (pulgar e índice) y mover la mano | El mapa sigue a la mano | «Moviendo el mapa» |
| Pellizco con las dos manos: una sostiene quieta y la otra sube o baja | Subir acerca y bajar aleja, alrededor de la mano que sostiene, sin pasar los límites del zoom | «Acercando» / «Alejando» |
| Pellizco con las dos manos: una sostiene y la otra va de lado | Hacia tu derecha gira el mapa a la derecha; hacia tu izquierda, al revés | «Girando el mapa» |
| Mano abierta | Aparece un cursor violeta que sigue el punto entre pulgar e índice, con la tarjeta de hover del mapa | «Señalando» |
| Dejar el cursor quieto ~800 ms sobre algo | Un anillo se llena y lo elige, igual que un clic | «Seleccionado: `src`» |

Con dos manos, la dirección se decide al empezar: lo primero que pasa su umbral (vertical o de lado) se mantiene hasta soltar. Así un zoom no gira el mapa sin querer, ni un giro lo acerca. Cualquiera de las dos manos puede sostener: mueve la que más se movió. Para cambiar de gesto, suelta y vuelve a pellizcar. Girar una sola mano como una perilla ya no gira el mapa.

El gesto de dos manos tiene sus propias reglas:
- **Le gana al arrastre**: si una mano ya estaba moviendo el mapa y la otra pellizca, pasa al gesto de dos manos y el arrastre se detiene.
- **Espera a la segunda mano**: con la otra mano a la vista, un pellizco solo espera ~300 ms antes de mover el mapa, porque casi nadie pellizca con las dos manos en el mismo instante.
- **Aguanta los parpadeos**: si el seguimiento pierde una mano menos de ~180 ms, el gesto sigue.
- **Reconoce cada mano**: aunque MediaPipe entregue las manos en otro orden, o pierda una un momento, cada una se reconoce por dónde estaba su palma.
- **Al soltar una mano**: el gesto termina, y la otra no arrastra el mapa hasta que también suelte (la vista previa dice «Suelta la mano para volver a agarrar»).

El cursor cubre toda la ventana con la parte central de la imagen, así se llega a los bordes sin sacar la mano de la cámara. Con dos manos abiertas, sigue a la que ya lo tenía. Lo que se eligió no se vuelve a elegir hasta que el cursor salga y vuelva a entrar.

### Qué se puede elegir

- **En el mapa 3D y en la vista git**: lo mismo que responde a un clic (carpetas, archivos, Supabase y sus tablas, commits).
- **En los paneles, todo lo que responde a un clic**: botones, pestañas, ítems de menú, filas del explorador, chips del chat y enlaces. Si hay un botón dentro de una fila, se elige el botón.
- **Nunca**, aunque esté a la vista: lo que lleva `data-gesture="never"` y lo que está dentro. Son acciones que se disparan sin pedir confirmación y que cambian código o seguridad:
  - reparar (deja escribir al agente), verificar o marcar como arreglado, y deshacer un cambio del agente;
  - cambiar el modo de aprobación del agente;
  - los botones de los servidores y su menú ⋯;
  - el botón de la mano (apagar la cámara mirando fijo sería un accidente).

  Sobre esos elementos no aparece el anillo. Commit, revert, reset, cambiar de rama y aprobar escrituras del agente piden un diálogo nativo, que el cursor no alcanza.
- Los campos de texto no reciben el foco. Mientras hay un diálogo de confirmación abierto no se elige nada: el proceso principal avisa a la ventana (`dialog:state`) cada vez que abre y cierra uno.

### Dos manos y computadoras lentas

MediaPipe sigue hasta dos manos por cuadro. Con `npm run dev`, la vista previa muestra los cuadros por segundo y si corre en GPU o en CPU. Si corre en CPU y baja de 20 cuadros por segundo durante 3 segundos, el zoom y el giro con dos manos se apagan: se vuelve a una mano, para que la CPU trabaje menos, y la vista previa lo dice. La próxima vez que se encienda la cámara lo intenta de nuevo.

## Seguridad y privacidad

- Apagado por defecto. La imagen se analiza en esta computadora (MediaPipe en WASM, con el modelo local en `renderer/assets/hands/`) y no sale a internet. No se guarda ningún cuadro ni ningún punto de la mano.
- Solo video: `electron/main.js` (`allowPermission`) concede la cámara únicamente a la página de la app y niega el micrófono y cualquier otro permiso (salvo copiar al portapapeles). En macOS el sistema pregunta antes. Esta función no pidió permisos nuevos.
- La cámara se libera al apagarla (se detienen las pistas del stream).
- La CSP permite `wasm-unsafe-eval` (necesario para el WASM de MediaPipe), sin `unsafe-eval`.
- El cursor es una capa que deja pasar los clics (`pointer-events: none`): no reemplaza al mouse ni lo bloquea.

## La librería

`@mediapipe/tasks-vision` 1.1.1 (la última en npm), con `HandLandmarker` en modo VIDEO y GPU con respaldo en CPU, hasta ~30 análisis por segundo. Por cada mano entrega 21 puntos en la imagen (x, y, z), 21 en metros y si es la mano izquierda o la derecha. Usamos solo x e y de algunos puntos: muñeca, pulgar, índice, y los nudillos del índice, del medio y del meñique. Se descartó `GestureRecognizer`: solo trae 7 gestos fijos, sin pellizco ni zoom, necesita otro modelo, y su GPU es más lenta según el benchmark de Google. El paquete y el modelo son Apache 2.0.

## Archivos

| Pieza | Archivo |
|---|---|
| Cámara → puntos de hasta dos manos, GPU o CPU, menos manos si la CPU no da | `renderer/services/handTrackingService.js` |
| Puntos → gestos: pellizco (`PinchTracker`), sostener y mover con dos manos (`TwoHandTracker`: zoom o giro), cursor (`PointerTracker`), elegir quieto (`DwellTimer`), qué mano lleva el cursor (`pickCursorHand`) | `renderer/models/handGesture.js` |
| Gesto → cámara del mapa, cursor, anillo y selección; cuadros por segundo | `renderer/viewmodels/handControlViewModel.js` |
| Qué hay bajo el cursor y si se puede elegir (todo lo clickeable salvo `never`) | `renderer/views/ui/handTargets.js` |
| El cursor y el anillo; elegir como un clic y hacer zoom con el mismo código del mouse | `renderer/views/ui/handCursorView.js` |
| `pickAtScreen` y `zoomAt` (los mismos que usan el clic y la rueda) | `renderer/views/scene/inputController.js` |
| Botón, vista previa, "?" y cuadros por segundo | `renderer/views/ui/handControlView.js` |
| Modelo de la mano (Google MediaPipe, Apache 2.0) | `renderer/assets/hands/hand_landmarker.task` |

El paneo usa `CameraViewModel.glideBy` y el giro `CameraViewModel.turnBy`: los dos suavizan el salto entre cuadros de la cámara. El zoom con dos manos usa `zoomAt`, igual que la rueda del mouse: mantiene fijo el punto del mapa bajo la mano que sostiene.

## Cómo probarla

- Corre `npm test`. Los tests son:
  - `tests/renderer/handGesture.test.mjs` y `handPointerZoom.test.mjs`: los gestos con manos sintéticas de `handFixtures.mjs`;
  - `handControlViewModel.test.mjs` y `handControlGestures.test.mjs`: el view model, con zoom, cursor, elegir quieto, CPU lenta y apagar;
  - `handTargets.test.mjs`: qué se puede elegir y qué no (`never`, texto, diálogo abierto).
- Con cámara: abre un proyecto y enciende la mano. Prueba:
  - pellizcar y mover;
  - sostener con una mano y subir o bajar la otra (zoom), o moverla de lado (giro);
  - la mano abierta quieta sobre una carpeta;
  - el cursor sobre "Reparar" (no pasa nada).
- Sin cámara real: Chromium o Electron con `--use-fake-device-for-media-stream` llega hasta «Muestra tu mano a la cámara».
