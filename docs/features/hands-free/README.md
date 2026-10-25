# Control sin manos (ojos o cabeza)

Para quien no puede usar las manos (lesión medular, ELA, esclerosis múltiple, distrofia muscular, parálisis cerebral, amputaciones, artritis), Platanus se maneja con la cámara:

- **Con los ojos**, pensado para el caso más grave: quien solo mueve los ojos. Mirar fijo abre una lupa sobre esa zona, y adentro se elige mirando fijo.
- **Con la cabeza**, más preciso para quien la mueve: el cursor sigue la nariz y se elige quedándose quieto.

En los dos casos se elige igual que con un clic, con las mismas reglas que las manos.

- Spec: [`spec/004-hands-free-control.md`](../../../spec/004-hands-free-control.md)
- Rama: `feature/hand-gestures`

## Dónde está: junto a la mano

En los controles del mapa (abajo a la izquierda), el ojo está en el mismo grupo que la mano. Las dos formas usan la misma tarjeta de cámara, encima de los controles. No hay barra ni menú aparte.

**Nada se enciende solo.** La cámara arranca apagada siempre, y solo el ojo (o la mano) la enciende.

1. Alguien toca el ojo con el mouse o el teclado. Una persona sin manos no puede empezar sola, así que lo hace otra persona.
2. La primera vez, la tarjeta pregunta **Con los ojos** o **Con la cabeza**. Queda recordado: las veces siguientes, el ojo enciende directo con lo elegido y con la calibración guardada.
3. Volver a tocar el ojo apaga la cámara. La elección y la calibración se conservan (son solo números).

Ni el ojo ni la mano se pueden elegir con la mirada o la cabeza (`data-gesture="never"`): apagarlos sin querer dejaría a la persona sin forma de volver a encenderlos. Usan la misma cámara, pero nunca a la vez: encender una forma apaga la otra.

Mientras está encendido, la tarjeta muestra:

- la cámara en espejo, solo mientras se revisa la posición (después de calibrar no hace falta);
- el estado;
- lo que corresponde a cada momento: la posición, la calibración, el resultado, los ajustes, o los botones **Pausa**, **Corregir** (ojos) o **Recentrar** (cabeza), **Recalibrar** (ojos) y **Ajustes**. Esos botones miden al menos el error de la calibración (entre 72 y 140 px) y se eligen directo, sin lupa.

## Con los ojos: la calibración

1. **Posición.** La tarjeta agranda la cámara y revisa cuatro cosas:
   - que la cara esté centrada;
   - que esté a buena distancia;
   - que mire de frente;
   - que los ojos estén abiertos.

   Pide lo concreto («Acércate un poco a la pantalla», «Mira de frente a la pantalla»). Con todo bien dice «Bien así: ya puedes empezar». Los puntos nunca arrancan solos: solo con **Empezar** (o **Empezar igual**, si la posición no está bien). Si se puede, conviene apoyar la cabeza.
2. **Puntos.** Todo se oscurece salvo la tarjeta y los controles. Un punto grande se desliza a cada lugar: 9 puntos de borde a borde, fila por fila, sin saltos largos. Se mira cada punto hasta que el anillo se llena; el contador va en la tarjeta, no junto al punto.
   - Cada punto espera 0,9 s, porque la mirada llega tarde, y después toma todos los cuadros de 1 s.
   - Descarta los parpadeos y los cuadros que se alejan mucho de los demás.
   - El ritmo se puede hacer hasta 2,5 veces más lento («Ajustes» → «Ritmo de la calibración»), para quien mueve los ojos despacio, como en la ELA.
3. **La cabeza.** Unos segundos mirando el centro mientras se mueve un poco la cabeza, si se puede. Así el modelo aprende qué cambia cuando la cabeza se mueve.
4. **Prueba.** 4 puntos que no se usaron para calibrar.
5. **Resultado.** La tarjeta muestra:
   - la calidad en palabras (buena, regular o mala);
   - el error típico en px;
   - sobre la pantalla, cada punto de prueba (un anillo) y dónde cayó la mirada (un punto).

   Los botones son **Usar así**, **Repetir puntos malos** (solo si hubo alguno) y **Repetir**. Solo «Usar así» la guarda.

**Si sale espejada**, se rechaza y solo se puede repetir. Eso pasa cuando la mirada que estima MediaPipe dice "izquierda" donde el punto estaba a la derecha.

### Una imagen mejor

- La cámara de la cara se pide a **1280 × 720** (la de las manos sigue a 640 × 480). Así cada ojo ocupa el doble de píxeles y el iris tiembla menos. Si la cámara no puede, da lo que tenga; con `npm run dev`, la tarjeta muestra el tamaño real.
- **La luz se mide una vez por segundo:** el cuadro se dibuja en una miniatura de 32 × 24, que se pisa cada vez, y solo sale un número (la luminancia media). Con poca luz, la revisión de posición lo pide («Hay poca luz: prende una luz frente a ti, no detrás») y, mientras se apunta, la tarjeta avisa que el cursor va a temblar más.

### Cómo calcula la mirada

Por cada cuadro arma un vector con:

- el iris de cada ojo abierto, medido entre las esquinas y contra el centro de los párpados;
- cuán abiertos están los párpados;
- la mirada que estima MediaPipe (`eyeLook*`);
- la pose de la cabeza: giro, inclinación y posición.

Con eso ajusta una regresión ridge por eje, lineal o con algunos términos cuadráticos de los ojos. El tipo y la regularización se eligen dejando un punto afuera cada vez y quedándose con el que menos se equivoca. Como la pose de la cabeza entra al modelo, moverse un poco ya no corre el cursor.

### Mientras se usa

- **Un filtro One Euro tranquilo**, que salta de inmediato ante una sacada grande. Una webcam tiembla unos 100 px por cuadro: el filtro lo baja a unos 35 px, y mientras la mirada fija un punto el cursor queda quieto del todo. El suavizado se ajusta.
- **Lupa:** dejar la mirada quieta 1 s (ajustable) donde hay algo que elegir abre una lupa ×4 ahí. Adentro, mirar fijo lo elige; mirar afuera la cierra sin elegir.
- **Aprende de cada selección, con cuidado:** dónde estaba la mirada justo antes de elegir, comparado con dónde estaba el objetivo, ajusta una corrección pequeña que se guarda con la calibración, como números. Una selección lejos de donde estaba la mirada no cuenta. Mientras las selecciones no cubran al menos 2 columnas y 2 filas de la pantalla, solo corre el cursor, sin estirar nada: así elegir siempre en el dock no deforma el resto.
- **Corregir:** si el cursor quedó corrido, se mira un punto en el centro y se corrige sin repetir todo.
- **Un parpadeo** deja el cursor donde estaba. Si un ojo no cierra o no abre bien (una parálisis de un lado), alcanza con el otro.

## Con la cabeza

- El cursor sigue la nariz respecto de su posición de reposo: la del primer momento, o la que se toma con «Recentrar» mirando al centro.
- No necesita calibración.
- Se elige quedándose quieto 0,8 s (ajustable) directamente sobre el objetivo, sin lupa; la lupa se puede activar en los ajustes.
- La velocidad se ajusta por separado hacia cada lado.

## Lo que vale para los dos

| Pieza | Qué hace |
|---|---|
| Imán | Si el punto queda cerca de algo elegible, el anillo va al objetivo más cercano y se dibuja sobre él. |
| Una vez | Lo que se eligió no se vuelve a elegir hasta salir y volver a entrar. Salir antes de completar el anillo no elige nada. |
| Pausa | Para leer código o el chat tranquilo: no abre la lupa ni elige nada, salvo «Seguir». |
| Ajustes | Una página por ajuste en la tarjeta, con «Menos» y «Más» grandes (sin arrastrar). Se guardan en esta computadora. |
| Parpadeo largo | Apagado por defecto. Al activarlo se piden 3 parpadeos largos para medirlos, y el umbral queda por encima de los espontáneos (nunca menos de 500 ms). |
| Sin cara | Si no se ve la cara, el cursor, el anillo y la lupa desaparecen, y la tarjeta dice «No veo tu cara». |
| Cerrar el proyecto | La lupa se cierra, pero el control sigue encendido para elegir otro proyecto reciente. |

## Seguridad y privacidad

- **Qué se elige:** lo mismo que con las manos (`renderer/views/ui/handTargets.js`), es decir, todo lo clickeable salvo lo marcado `data-gesture="never"` y lo que está dentro:
  - reparar;
  - verificar;
  - deshacer cambios del agente;
  - el modo de aprobación;
  - los servidores;
  - los botones de la mano y del ojo.

  El imán no rodea un objetivo bloqueado para elegir otro de al lado. Mientras hay un diálogo de confirmación abierto, no se elige nada.
- **Lo que no se puede hacer con la mirada:** aprobar escrituras del agente, commit, revert, reset y cambiar de rama siguen pidiendo mouse, teclado o la herramienta del sistema.
- **La lupa** agranda la ventana real (una escala de CSS sobre `<body>`), así que lo que se elige es el elemento real.
- **La cara es un dato biométrico.** Cada cuadro se analiza en esta computadora y se descarta. A la lógica le llegan solo:
  - los puntos de la malla;
  - 10 blendshapes: 2 de parpadeo y los 8 `eyeLook*` (los otros 42 se descartan en el servicio);
  - la matriz de pose de la cabeza.

  Las muestras de la calibración viven en memoria. Nada de la cara se guarda, se escribe en logs, sale a la red ni llega al agente, y no hay reconocimiento de identidad.
- **Lo guardado** (`localStorage`, clave `platanus.handsFree.v1`) son solo números y sí/no: los coeficientes del modelo, la corrección, los ajustes, los umbrales y con qué se apunta. Al leerlo se valida todo. Una calibración del formato anterior se descarta y se calibra de nuevo.
- **Solo video**, con la regla de siempre (`allowPermission`). No se tocó la CSP.

## El modelo

`FaceLandmarker` de `@mediapipe/tasks-vision` 1.1.1 (el mismo paquete y el mismo WASM que las manos), en modo VIDEO, con una cara, blendshapes y matriz de pose, en GPU con respaldo en CPU. El modelo (`face_landmarker.task`, Apache 2.0) se baja una vez con `npm run models` a `renderer/assets/face/` y se commitea, como el de las manos.

## Archivos

| Pieza | Archivo |
|---|---|
| Cámara y bucle de análisis, compartidos con las manos | `renderer/services/cameraLoop.js` |
| Cámara → puntos, 10 blendshapes y matriz de pose | `renderer/services/faceTrackingService.js` |
| La mirada: vector por cuadro, calibración, modelo, filtro, fijación, corrección, posición | `renderer/models/gazeModel.js` |
| El informe de precisión (solo `npm run dev`, ⌘⇧D) | `renderer/models/gazeReport.js` |
| La cabeza, el parpadeo largo, la lupa y el imán | `renderer/models/faceGesture.js` |
| Lo que se recuerda, validado | `renderer/models/handsFreeSettings.js` |
| Cara → cursor, lupa, anillo, selección; posición, calibración, resultado; pausa y ajustes | `renderer/viewmodels/handsFreeViewModel.js` |
| Qué hay cerca de un punto, si una zona tiene algo elegible, elegir como clic | `renderer/views/ui/handCursorView.js` (`createHandTargets`) y `handTargets.js` |
| El ojo, la tarjeta y la capa (cursor, lupa, velo y puntos) | `renderer/views/ui/handsFreeView.js` |
| Estilos | `renderer/styles/handsfree.css` |
| Descarga del modelo | `scripts/fetch-face-model.js` (`npm run models`) |

## Cómo probarla

- Corre `npm test`. Los tests son:
  - **`gazeModel.test.mjs`:** la calibración con una persona realista de `faceFixtures.mjs`, que simula una laptop de 13" a 60 cm, el temblor de MediaPipe, la sacada que llega tarde y la cabeza que se mueve. Cubre:
    - el tiempo y el error;
    - las muestras que no se mezclan entre puntos;
    - los cuadros atípicos;
    - la elección del modelo;
    - el rechazo de una calibración espejada;
    - la compensación de cabeza;
    - el filtro y la fijación;
    - la recalibración implícita;
    - repetir los puntos malos;
    - el ritmo y la posición.
  - **`handsFreeViewModel.test.mjs`:** el ojo y la elección; la posición; aceptar, repetir y repetir los puntos malos; la lupa; la cabeza; la pausa; `never`; el parpadeo largo; corregir y recentrar; los ajustes.
  - **`handsFreeSettings.test.mjs`:** lo guardado y lo que llega de cada cuadro.
  - **`axisConvention.test.mjs`:** la convención de ejes.
  - **`cameraQuality.test.mjs`:** la cámara a 1280 × 720 y la medición de la luz.
  - **`gazeReport.test.mjs`:** el informe de precisión: signos de cada rasgo, llegada de los ojos, error en grados, filtro, y que no trae nada de la cara.
  - **`handTargets.test.mjs` y `targetSizes.test.mjs`.**
- **Con cámara:** `npm run models` (una vez) y `npm start`. Toca el ojo, elige «Con los ojos» y calibra. Protocolo manual: con la cabeza apoyada, haz 20 selecciones entre íconos del dock, filas del explorador y carpetas del mapa. Pasa con 18 o más bien y ninguna acción `never`.
- **Informe de precisión (solo `npm run dev`):** después de calibrar, ⌘⇧D (Ctrl+Shift+D) copia al portapapeles un informe de texto, y la tarjeta dice un momento «Informe de precisión copiado». Sirve para saber qué falla con una cámara real:
  - **por punto:** cuántas muestras quedaron, se descartaron o se perdieron (parpadeos, sin cara); los fps; cuánto tiembla cada rasgo; cuánto tiembla y se desliza la mirada en px; cuán lejos del punto cayó;
  - **por rasgo:** cuánto cambia entre puntos contra cuánto tiembla (señal/ruido), su signo respecto de x e y (así se ve si `eyeLook*` está al revés) y cuánto se movió en el paso de cabeza;
  - **el modelo:** qué tipo y qué λ ganó, el error dejando un punto afuera en x y en y, el mismo error usando solo algunos rasgos (ojos, `eyeLook*`, cabeza) y el peso de cada uno;
  - **la llegada:** a cuántos px estaban los ojos de su lugar final en cada tramo de 150 ms desde que apareció el punto (dice si alcanza la espera de 0,9 s);
  - **los puntos de prueba:** el error en px y en grados (supone una pantalla de 13,3" a 60 cm), en x y en y, y el temblor antes y después del filtro.

  Son solo números: nada de imágenes, puntos de la cara ni blendshapes. No se guarda en disco ni va a la consola ni a la red, y se olvida al apagar el control. Calcularlo usa la última calibración, incluso si fue rechazada (`renderer/models/gazeReport.js`).
- **Lo que no se pudo probar sin cámara:**
  - la precisión real con tu cámara y tu luz (las pruebas usan una persona simulada);
  - el costo en CPU;
  - la lupa sobre la ventana real.
