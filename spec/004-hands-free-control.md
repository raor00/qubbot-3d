# 004 · Control sin manos: ojos y cabeza

- **Estado:** implementada (falta el protocolo manual con cámara)
- **Autor:** Génesis Zapata
- **Revisor:** (por asignar)
- **Fecha:** 2026-10-24
- **Rama:** `feature/hand-gestures`

## Contexto

Hoy Platanus se maneja con las manos frente a la cámara (spec/003-hand-gestures.md): un cursor violeta, un anillo que elige al quedarse quieto ~800 ms y las reglas de `handTargets.js` (todo lo clickeable salvo `data-gesture="never"`, nada con un diálogo abierto). Quien no puede usar las manos queda afuera, y en el caso más grave (ELA avanzada, síndrome de enclaustramiento) tampoco mueve la cabeza ni la cara: le quedan los ojos.

Se quiere manejar Platanus sin manos, con dos formas de apuntar: **los ojos** (la prioridad, porque es lo último que queda) y **la cabeza** (más precisa para quien la mueve). El análisis previo (Paso 0) concluyó que una webcam se equivoca de 2 a 3,65° al estimar la mirada, según el estudio. En una laptop de 13" a 60 cm son unos 106 a 194 px, y los objetivos de Platanus miden de 20 a 40 px. Por eso con los ojos no se elige directo: se usa una **lupa en dos pasos** (mirar fijo agranda la zona, y adentro se elige mirando fijo).

`@mediapipe/tasks-vision` 1.1.1, ya instalado, trae `FaceLandmarker`: 478 puntos con el iris, 52 blendshapes y la pose de la cabeza, con el mismo WASM que las manos. No entrega un punto de mirada en la pantalla: eso lo da la calibración.

## Comportamiento esperado

### Encender y apagar

- **B1.** WHEN se abre Platanus, THE SYSTEM SHALL dejar la cámara apagada siempre. Nada se enciende solo: solo el botón del ojo (o el de la mano) la enciende. (Cambio del 2026-10-24: antes, tras un opt-in, arrancaba sola al abrir.)
- **B2.** WHEN alguien toca el botón del ojo (junto al de la mano, en el mismo grupo) con mouse o teclado por primera vez, THE SYSTEM SHALL mostrar en la tarjeta de cámara de la mano la elección (ojos o cabeza) y recordarla en esta computadora; las veces siguientes, el ojo enciende directo con lo elegido. (Cambio del 2026-10-24: todo vive junto a la mano; no hay barra ni menú aparte.)
- **B3.** WHEN el modo sin manos está encendido, THE SYSTEM SHALL mostrar todo el tiempo la tarjeta con el estado: es el indicador de que la cámara está encendida. La imagen de la cámara solo se ve mientras se revisa la posición (2026-10-25: después de calibrar no hace falta).
- **B4.** WHEN alguien vuelve a tocar el botón del ojo (con mouse o teclado), THE SYSTEM SHALL apagar la cámara y conservar la elección y la calibración (solo números), para no calibrar cada vez. El botón del ojo no se puede elegir con la mirada ni con la cabeza (lleva `data-gesture="never"`), igual que el de la mano: apagarlo sin querer dejaría a la persona sin forma de volver a encenderla.
- **B5.** WHEN el modo sin manos está encendido, THE SYSTEM SHALL no correr el seguimiento de manos al mismo tiempo: una entrada por vez, con la misma cámara.

### Calibrar la mirada

Calibración v2 (2026-10-24, tras probarla con cámara: quedaba lejos, temblaba, se corría con la cabeza y confundía).

- **B6.** WHEN se apunta con los ojos y no hay calibración guardada, o la persona elige "Recalibrar", THE SYSTEM SHALL revisar primero la posición, en la tarjeta: cara centrada, a buena distancia, de frente y con los ojos abiertos, con un mensaje concreto («Acércate un poco», «Mira de frente a la pantalla»…). Los puntos nunca arrancan solos: solo con «Empezar» (o «Empezar igual» si la posición no está bien).
- **B6b.** WHEN calibra, THE SYSTEM SHALL oscurecer todo salvo la tarjeta y mostrar 9 puntos de borde a borde (márgenes de 6 a 8 %), en un orden sin saltos largos. Cada punto se desliza a su lugar, espera 0,9 s (el ojo llega tarde) y toma todos los cuadros de 1 s, descartando parpadeos y valores atípicos. Después pide mirar el centro y mover un poco la cabeza 4 s (si puede), para aprender qué hace la cabeza, y mide 4 puntos de prueba. El contador va en la tarjeta, no junto al punto. El ritmo se ajusta (hasta 2,5 veces más lento). No pide teclado ni mouse.
- **B6c.** WHEN ajusta el modelo, THE SYSTEM SHALL usar, por cuadro, el iris de cada ojo abierto, la apertura de los párpados, la mirada que estima MediaPipe (`eyeLook*`) y la pose de la cabeza; regresión ridge por eje, lineal o con términos cuadráticos de los ojos, elegida dejando un punto afuera.
- **B6d.** WHEN la calibración va en contra de la mirada que estima MediaPipe (salió espejada), THE SYSTEM SHALL rechazarla y decirlo; solo se puede repetir.
- **B7.** WHEN termina, THE SYSTEM SHALL mostrar el resultado: la calidad en palabras (buena, regular, mala), el error típico en px y, sobre la pantalla, cada punto de prueba contra dónde cayó la mirada, con «Usar así», «Repetir puntos malos» (si hay) y «Repetir». Solo «Usar así» la guarda, y solo como números.
- **B8.** WHEN la persona elige "Corregir", THE SYSTEM SHALL mostrar un punto en el centro y, al mirarlo fijo, corregir el desvío sin repetir toda la calibración.
- **B8b.** WHEN la persona elige algo con los ojos, THE SYSTEM SHALL aprender de esa selección: dónde estaba la mirada justo antes contra dónde estaba el objetivo ajusta una corrección pequeña (recalibración implícita), que se guarda con la calibración. Una selección lejos de la mirada (más del doble del error) no cuenta, y hasta que las selecciones cubran 2 columnas y 2 filas de la pantalla solo se aprende un corrimiento, nunca un estiramiento.

### Apuntar

- **B9.** WHEN se apunta con los ojos, THE SYSTEM SHALL mover el cursor según la mirada calibrada, con un filtro One Euro tranquilo (el suavizado se ajusta) que salta enseguida ante una sacada grande, y lo deja quieto del todo mientras la mirada fija un punto.
- **B10.** WHEN los ojos están cerrados (un parpadeo), THE SYSTEM SHALL dejar el cursor quieto donde estaba y no reiniciar el anillo por ese salto.
- **B11.** WHEN se apunta con la cabeza, THE SYSTEM SHALL mover el cursor según la pose de la cabeza respecto de su posición de reposo, con una ganancia ajustable para cada dirección (izquierda, derecha, arriba, abajo) y suavizado ajustable. No pide calibración.
- **B12.** WHEN la persona elige "Recentrar" (modo cabeza), THE SYSTEM SHALL tomar la posición actual de la cabeza como el centro de la ventana.
- **B13.** WHEN no se ve la cara, THE SYSTEM SHALL ocultar el cursor, cancelar el anillo y la lupa, y decir «No veo tu cara» en la tarjeta.

### Elegir

- **B14.** WHEN se apunta con los ojos y la mirada se queda quieta (dentro de la tolerancia) durante el tiempo de dwell, y dentro del recuadro que mostraría la lupa hay algo que se puede elegir, THE SYSTEM SHALL abrir la lupa: un recuadro centrado en la mirada que muestra esa parte de la ventana agrandada, con un factor ajustable.
- **B15.** WHEN la lupa está abierta y la mirada se queda quieta el tiempo de dwell sobre un objetivo dentro de ella, THE SYSTEM SHALL elegir el elemento que está en ese lugar de la ventana real, igual que un clic, y cerrar la lupa.
- **B16.** WHEN la lupa está abierta y la mirada sale de ella, THE SYSTEM SHALL cerrarla sin elegir nada.
- **B17.** WHEN se apunta con la cabeza, THE SYSTEM SHALL elegir con el dwell directo sobre el objetivo, sin lupa. La lupa queda como opción en los ajustes.
- **B18.** WHEN el punto (en la ventana o dentro de la lupa) está a menos de un radio de un objetivo que se puede elegir, THE SYSTEM SHALL llevar el anillo al objetivo más cercano y dibujarlo sobre el objetivo, no sobre el punto.
- **B19.** WHEN algo se acaba de elegir, THE SYSTEM SHALL no volver a elegirlo hasta que el punto salga de ese objetivo y vuelva a entrar.
- **B20.** WHEN el punto sale del objetivo antes de completar el anillo, THE SYSTEM SHALL reiniciar el anillo sin elegir: elegir solo ocurre al completarse.

### Parpadeo largo (opt-in)

- **B21.** WHEN el parpadeo largo no está activado (por defecto), THE SYSTEM SHALL ignorar los parpadeos para elegir.
- **B22.** WHEN la persona activa el parpadeo largo, THE SYSTEM SHALL calibrarlo: le pide unos parpadeos largos, mide su duración y fija el umbral por encima de sus parpadeos espontáneos. Los espontáneos duran entre 100 y 400 ms según la fuente.
- **B23.** WHEN el parpadeo largo está activado y la persona cierra los ojos más que su umbral con el anillo sobre un objetivo (en la ventana o en la lupa), THE SYSTEM SHALL elegirlo como lo haría el dwell. Un parpadeo más corto no hace nada. El dwell sigue funcionando.

### Pausa y botones de la tarjeta

- **B24.** WHEN el modo sin manos está encendido, THE SYSTEM SHALL mostrar en la tarjeta de cámara "Pausa", "Corregir" (ojos) o "Recentrar" (cabeza), "Recalibrar" (ojos) y "Ajustes". Cada botón mide al menos el error medido en la calibración (entre 72 y 140 px), y se elige directo, sin lupa.
- **B25.** WHEN la persona elige "Pausa", THE SYSTEM SHALL dejar de abrir la lupa y de elegir, salvo el botón "Seguir", hasta que lo elija.
- **B26.** WHEN la persona abre "Ajustes", THE SYSTEM SHALL permitir cambiar, con botones de más y menos sin arrastrar:
  - con qué apunta;
  - el tiempo de dwell, de 0,5 a 3 s (empieza en 1 s con los ojos y en 0,8 s con la cabeza, D2);
  - la tolerancia de movimiento;
  - el suavizado;
  - el factor de la lupa;
  - el ritmo de la calibración (ojos);
  - la ganancia por dirección (cabeza);
  - el parpadeo largo, sí o no.

  Cada cambio se usa desde el siguiente anillo y se recuerda en esta computadora.

### Seguridad y privacidad

- **B27.** WHEN algo se elige con los ojos o la cabeza, THE SYSTEM SHALL aplicar las reglas de las manos: se elige todo lo clickeable salvo lo marcado `data-gesture="never"` y lo que está dentro; nada mientras hay un diálogo de confirmación abierto (`dialog:state`); los campos de texto no reciben el foco.
- **B28.** WHEN se guardan ajustes o calibraciones, THE SYSTEM SHALL guardar solo números (tiempos, factores, ganancias, coeficientes, umbrales). Nunca se guardan imágenes, puntos de la cara, blendshapes ni posiciones de la mirada.
- **B29.** WHEN la cámara está encendida, THE SYSTEM SHALL analizar cada cuadro en esta computadora y descartarlo. A la lógica le llegan solo los puntos de la malla, 10 blendshapes (2 de parpadeo y los 8 `eyeLook*`) y la matriz de pose de la cabeza. Ningún cuadro, punto de la cara, blendshape, muestra de calibración ni dato de la mirada se guarda, se escribe en logs ni sale a la red, y nada identifica a la persona.

### Lo que se ve

- **B30.** WHEN cambia lo que pasa, THE SYSTEM SHALL decirlo en la tarjeta con uno de estos estados: «Mirando», «Lupa abierta», «Seleccionado: `src`», «En pausa», «No veo tu cara», «Mira el punto hasta que se llene: 3 de 9».
- **B31.** WHEN el análisis se mantiene bajo 20 cuadros por segundo durante 3 s, THE SYSTEM SHALL avisarlo en la tarjeta. En modo dev, la tarjeta muestra los cuadros por segundo y si corre en GPU o en CPU, como con las manos.
- **B32.** WHEN el sistema tiene activado "reducir movimiento", THE SYSTEM SHALL abrir y cerrar la lupa sin animación y llenar el anillo en pasos.
- **B33.** WHEN se apaga la cámara, THE SYSTEM SHALL ocultar el cursor, la lupa, el anillo y la tarjeta, y soltar lo que estaba en curso.
- **B34.** WHEN se cierra el proyecto, THE SYSTEM SHALL cerrar la lupa y soltar lo que estaba en curso, y seguir encendido: la persona elige otro proyecto reciente con la mirada o la cabeza. (Las manos se apagan al cerrar el proyecto; el control sin manos no, porque la persona no podría volver a encenderlo.)

### Una imagen mejor (2026-10-25)

- **B36.** WHEN se enciende el control sin manos, THE SYSTEM SHALL pedir la cámara a 1280 × 720 como ideal (la de las manos sigue a 640 × 480): los ojos quedan con el doble de píxeles y el iris tiembla menos. Una cámara que no puede da lo que tenga. Solo video, como siempre.
- **B37.** WHEN la imagen está oscura (luminancia media menor a 0,2, medida una vez por segundo en una miniatura de 32 × 24 que se pisa cada vez), THE SYSTEM SHALL decirlo: en la revisión de posición como problema («Hay poca luz: prende una luz frente a ti, no detrás») y, mientras se apunta, en la tarjeta. Solo ese número sale del servicio.
- **B38.** WHERE la app corre con `npm run dev`, WHEN se presiona ⌘⇧D (Ctrl+Shift+D) después de una calibración, THE SYSTEM SHALL copiar al portapapeles un informe de precisión de texto, solo con números: por punto (muestras que quedaron, descartadas y perdidas, fps, dispersión de cada rasgo, temblor y deriva de la mirada en px, desvío del objetivo), por rasgo (rango entre puntos, dispersión, relación señal/ruido, correlación con x e y, dispersión en el paso de cabeza), el modelo (tipo, λ, error dejando un punto afuera por eje y por grupo de rasgos, coeficientes), cuándo llegan los ojos a cada punto (en pasos de 150 ms), los puntos de prueba en px y grados (pantalla de 13,3" a 60 cm) y el temblor antes y después del filtro. Sin interfaz nueva: la tarjeta dice un momento si se copió. Nada de imágenes, puntos de la cara ni blendshapes; no va a disco, consola ni red. Los números de la calibración viven en memoria y se olvidan al apagar.

### Objetivos de al menos 24 px (D1)

- **B35.** WHEN se dibujan los botones del breadcrumb, las filas y las acciones del árbol Dev, y el "?" de la vista previa de la mano, THE SYSTEM SHALL darles al menos 24 × 24 px (WCAG 2.5.8).

**Ejemplo de punta a punta** (datos ficticios):

1. Tomás tiene ELA avanzada y solo mueve los ojos. Su hermana Lucía abre Platanus en la laptop de Tomás, toca el ojo junto a la mano y, en la tarjeta de cámara, elige «Con los ojos».
2. La tarjeta muestra la cámara grande: «Acércate un poco a la pantalla». Lucía acerca la laptop, la tarjeta dice «Bien así: ya puedes empezar» y Lucía toca «Empezar». Tomás mira los 9 puntos, el centro y los 4 de prueba; el contador va en la tarjeta. La tarjeta dice «Calidad: buena · Error típico: 84 px», y Lucía toca «Usar así». Los botones de la tarjeta miden 84 px.
3. Al día siguiente, Lucía abre Platanus y toca el ojo: arranca directo con los ojos y la calibración de ayer, sin preguntar.
4. Tomás mira fijo el ícono Riesgos del dock lateral. Se abre la lupa con esa zona agrandada ×4. Mira fijo el ícono agrandado, el anillo se llena sobre él y el panel de Riesgos se abre. Esa selección afina un poco la calibración.
5. Mira fijo la carpeta `src` del mapa: se abre la lupa, la elige adentro y la carpeta se despliega, igual que con un clic. La tarjeta dice «Seleccionado: `src`».
6. Quiere leer el código de `src/api/pagos.js` sin que se abran lupas. Mira fijo "Pausa" en la tarjeta. La tarjeta dice «En pausa». Lee tranquilo y después mira fijo "Seguir".
7. En una tarjeta de riesgo, la lupa muestra "Reparar". Tomás lo mira fijo y no aparece el anillo: es una acción `never`.

## Out of scope

- Expresiones faciales como atajos (cejas, boca, sonrisa): van en una spec siguiente, sobre esta misma base.
- Gestos con los ojos para mover el foco como Tab: van en una spec siguiente, después de que el mapa 3D se pueda recorrer con teclado.
- Personas que tampoco mueven los ojos (enclaustramiento completo): necesitan interfaces cerebro-computadora.
- Eye trackers infrarrojos dedicados (Tobii) como entrada propia de Platanus: se usan a través del sistema operativo, como un mouse.
- Escribir con la mirada (teclado en pantalla). Para escribir en el chat, la persona usa el teclado de accesibilidad del sistema.
- Mover, girar o acercar el mapa con la mirada o la cabeza: se usan los controles del mapa (acercar, alejar, girar, centrar), que se eligen como cualquier botón.
- Voz o micrófono: la ventana nunca recibe el micrófono.
- Confirmar diálogos nativos (aprobar una escritura del agente, commit, revert, reset, cambiar de rama): siguen pidiendo mouse, teclado o la herramienta del sistema. Es a propósito: una mirada sin querer no aprueba nada.
- Recorrer el mapa 3D con el teclado (foco en carpetas y archivos): va con la spec de gestos con los ojos.
- Seguir manos y cara a la vez.
- Reconocer quién es la persona.

## Checklist de dominio

- [ ] La cámara siempre arranca apagada. Nada se enciende solo: la cámara solo con el botón del ojo o de la mano, y la calibración solo con «Empezar».
- [ ] Solo video, procesado en esta computadora. No se toca `allowPermission` ni la CSP, y no se pide ningún permiso nuevo.
- [ ] Ningún cuadro, punto de la cara, blendshape ni dato de la mirada se guarda, se escribe en logs ni sale a la red. Los ajustes y la calibración guardan solo números.
- [ ] Nada de reconocimiento de identidad. La cara es un dato biométrico: solo se usa para mover el cursor y elegir.
- [ ] Se elige con las mismas reglas que las manos (`uiTarget`, lista `never`, `dialog:state`). El botón que desactiva el control sin manos es `never`.
- [ ] Nada obligatorio: el dwell siempre funciona y el parpadeo largo es opt-in.
- [ ] WCAG 2.2: tiempos ajustables (2.2.1), elegir solo al completar y cancelar al salir (2.5.2), ajustes sin arrastrar (2.5.7).
- [ ] El modelo de la cara es local, como el de las manos, y se carga la primera vez que se usa.
- [ ] MVVM como hoy: la matemática (mirada calibrada, pose, parpadeo, lupa, imán) es pura y tiene tests, el view model pasa de cara a cursor y selección, y la vista solo dibuja. El cursor, el anillo y `handTargets` se reutilizan, sin duplicarlos.
- [ ] Textos en `renderer/i18n/es.js`, íconos de Hugeicons y colores de los tokens. Se respeta "reducir movimiento".

## Plan de validación

| Comportamiento | Chequeo | Resultado esperado |
|---|---|---|
| B2–B4 | Test del view model con almacenamiento falso: primera vez, segunda vez, al apagar | La primera vez la tarjeta pregunta; la segunda arranca directo con lo elegido; al apagar se conservan la elección y la calibración. El ojo lleva `never`. |
| B5 | Test: encender sin manos con las manos encendidas | El seguimiento de manos se detiene; solo corre un modelo. |
| B1 | Test del view model | La cámara no arranca hasta tocar el ojo. |
| B6 | Test del view model con una persona sintética lejos, girada y bien ubicada | La tarjeta dice el problema; con todo bien sigue esperando; solo «Empezar» o «Empezar igual» arrancan los puntos. |
| B6b–B6d | `gazeModel.test.mjs` con una persona realista (laptop de 13" a 60 cm, temblor de MediaPipe, sacada tardía, cabeza que se mueve) | Menos de 45 s; error en los puntos de prueba bajo 60 px; ningún cuadro del punto anterior mezclado; atípicos descartados; el modelo elegido tiene el menor error dejando un punto afuera; con la cabeza en el modelo, una cabeza girada y movida cae cerca; una calibración espejada se rechaza. |
| B7 | Test del view model | El resultado no se guarda hasta «Usar así»; un punto de prueba mal mirado queda marcado y «Repetir puntos malos» mide solo ese y vuelve a probar. |
| B8b | Test del modelo y del view model | Con una deriva, las selecciones la corrigen a menos de la mitad; tras una selección, la corrección guardada cambia. |
| B9 | Test del filtro y de la fijación | El temblor baja a menos de la mitad, un salto se sigue enseguida y, mientras fija, el cursor no se mueve. |
| B8 | Fixture con desvío constante | "Corregir" lo elimina sin repetir los 9 puntos. |
| B10 | Fixture con un parpadeo en medio | Durante el parpadeo el cursor queda quieto y el anillo no se reinicia. |
| B11–B12 | Fixtures de pose de la cabeza, con ganancia distinta por dirección | El cursor se mueve con cada ganancia; "Recentrar" toma la pose actual como centro. |
| B13 | Frames sin cara | Cursor oculto, anillo y lupa cancelados, estado «No veo tu cara». |
| B14–B16 | `mock.timers`: mirada quieta sobre una zona con y sin objetivos; después quieta dentro de la lupa; después afuera | Se abre la lupa solo si hay objetivos; dentro elige el elemento real; al salir se cierra sin elegir. |
| B17 | Modo cabeza con dwell sobre un objetivo | Elige sin abrir la lupa. |
| B18 | Punto cerca de dos objetivos | El anillo va al más cercano dentro del radio; fuera del radio, ninguno. |
| B19–B20 | Quedarse después de elegir; salir antes de completar | Una sola selección; salir reinicia sin elegir. |
| B21–B23 | Fixtures de blendshapes de parpadeo con varias duraciones, con y sin opt-in | Sin opt-in no elige; con opt-in elige solo por encima del umbral calibrado, y el dwell sigue funcionando. |
| B24–B25 | Calibración con error conocido; "Pausa" y después "Seguir" | Los botones de la tarjeta miden al menos el error; en pausa solo "Seguir" responde. |
| B26 | Cambiar cada ajuste con más y menos | Se usa desde el siguiente anillo y queda guardado; el dwell no sale de 0,5 a 3 s. |
| B27 | Test con elementos falsos: uno `never`, uno dentro de un `never`, un campo de texto, un diálogo abierto | No se eligen; los clickeables sí. |
| B28 | Leer lo guardado después de calibrar y ajustar | Solo claves conocidas con valores numéricos (o sí/no). |
| B29 | Test de `faceFromResult` con un resultado falso de MediaPipe | Llegan solo los puntos, los 10 blendshapes listados y la matriz; nada más. |
| B30–B33 | Captura de la tarjeta en cada estado; con "reducir movimiento"; apagar a mitad de una lupa | Textos correctos; lupa sin animación; todo oculto y suelto al apagar. |
| B34 | Test del view model: cerrar el proyecto con la lupa abierta | La lupa se cierra y el modo sigue encendido. |
| B35 | Test que lee el CSS de esos elementos | Alto y ancho mínimos de 24 px. |
| B36 | `cameraQuality.test.mjs` | La cámara de la cara pide 1280 × 720 ideal y solo video; la de las manos, 640 × 480. |
| B37 | `cameraQuality.test.mjs` y el view model | La luminancia media de la miniatura va de 0 a 1; con poca luz la posición dice «luz» y la tarjeta avisa al apuntar. |
| B38 | `gazeReport.test.mjs` y el view model | El informe sale de la última calibración (también de una rechazada), tiene los signos correctos de cada rasgo, la llegada de los ojos, el error en grados y el filtro; no trae blendshapes ni puntos de la cara; se olvida al apagar. |
| Protocolo manual | Con la cámara y la cabeza apoyada, sin moverla: 20 selecciones entre íconos del dock, filas del explorador y carpetas del mapa | 18 o más elegidas bien y ninguna acción `never` disparada. |

**Condición de terminado:** `npm test` termina con `# fail 0`, y el protocolo manual con la cabeza apoyada da 18 o más de 20 selecciones correctas y ninguna acción `never`.

## Rollout

Se trabaja en `feature/hand-gestures`, que entra a `develop` con `git flow feature finish`. Una calibración guardada con el formato anterior se descarta sola y se calibra de nuevo. La cámara siempre arranca apagada. El modelo de la cara se baja una vez con `npm run models` a `renderer/assets/face/` y se commitea, como el de las manos.

## Decisiones abiertas

- **D1 (resuelta el 2026-10-24).** Los objetivos de menos de 24 px se arreglan en esta rama (B35). El foco con teclado en el mapa 3D queda para la spec de gestos con los ojos.
- **D2 (resuelta el 2026-10-24).** El dwell empieza en 1000 ms con los ojos (el extremo alto de lo que usa la literatura, 200 a 1000 ms, porque es para quien empieza) y en 800 ms con la cabeza (como las manos). Se ajusta por persona de 0,5 a 3 s y se revisa con el protocolo manual.
- **D3.** ¿Quién revisa esta spec? Decide: Génesis.
