// The lab's texts (docs/features/laboratorio/README.md), in plain Spanish. es.js exposes them as
// strings.lab. Code, comments and identifiers stay in English.

export const lab = {
  title: 'Laboratorio',
  tab: 'Laboratorio',
  tabInfo: (parts, issues) => `${parts} ${parts === 1 ? 'pieza' : 'piezas'} · ${issues ? `${issues} por revisar` : 'todo bien conectado'}`,
  railInfo: 'Arrastra placas, sensores y motores al banco y conéctalos.',

  // --- The catalog (side panel, where the explorer was) ---
  catalog: {
    title: 'Catálogo',
    intro: 'Arrastra una pieza al banco, o tócala para ponerla en el centro.',
    search: 'Buscar pieza…',
    empty: 'No hay piezas con ese nombre.',
    add: (name) => `Poner ${name} en el banco`,
    pins: (n) => `${n} ${n === 1 ? 'pin' : 'pines'}`,
    mA: (n) => `${n} mA`,
    volts: ([min, max]) => (min === max ? `${min} V` : `${min}–${max} V`),
    license: (name, license) => `Medidas: ${name} (${license})`,
    noProject: 'Abre o crea un proyecto para armar tu circuito.',
  },
  categories: {
    boards: 'Placas',
    sensors: 'Sensores',
    actuators: 'Motores y salidas',
    displays: 'Pantallas',
    inputs: 'Botones y perillas',
    power: 'Energía',
  },
  parts: {
    'arduino-uno': { name: 'Arduino Uno', desc: 'La placa clásica para empezar: 5 V, 14 pines digitales y 6 analógicos.' },
    'arduino-nano': { name: 'Arduino Nano', desc: 'Lo mismo que el Uno, en pequeño: cabe en cualquier caja.' },
    'esp32-devkit': { name: 'ESP32', desc: 'Con wifi y bluetooth, trabaja a 3,3 V.' },
    pico: { name: 'Raspberry Pi Pico', desc: 'Pequeña, rápida y barata; trabaja a 3,3 V.' },
    'hc-sr04': { name: 'Sensor de distancia', desc: 'Mide a qué distancia está algo, con ultrasonido (HC-SR04).' },
    pir: { name: 'Sensor de movimiento', desc: 'Avisa cuando alguien pasa cerca (PIR).' },
    dht22: { name: 'Temperatura y humedad', desc: 'Mide la temperatura y la humedad del aire (DHT22).' },
    soil: { name: 'Humedad de la tierra', desc: 'Dice si una planta necesita agua.' },
    ldr: { name: 'Sensor de luz', desc: 'Mide cuánta luz hay.' },
    'servo-sg90': { name: 'Servo', desc: 'Un motor pequeño que gira a un ángulo exacto (SG90).' },
    relay: { name: 'Relé', desc: 'Prende y apaga cosas grandes, como una lámpara o una bomba.' },
    buzzer: { name: 'Zumbador', desc: 'Hace pitidos y melodías sencillas.' },
    led: { name: 'LED', desc: 'Una luz pequeña que prende, apaga o parpadea.' },
    l298n: { name: 'Control de motores', desc: 'Mueve dos motores de ruedas hacia adelante y hacia atrás (L298N).' },
    'oled-128x64': { name: 'Pantalla OLED', desc: 'Una pantalla pequeña para mostrar texto y dibujos.' },
    'lcd-1602-i2c': { name: 'Pantalla LCD', desc: 'Dos líneas de texto, fácil de leer.' },
    button: { name: 'Botón', desc: 'Lo que pasa cuando alguien lo aprieta.' },
    potentiometer: { name: 'Perilla', desc: 'Una perilla que gira para subir o bajar un valor.' },
    'battery-aa4': { name: 'Portapilas 4×AA', desc: 'Energía sin cable: 6 V para la placa.' },
  },

  // --- The bench (3D view) ---
  bench: {
    empty: 'Tu banco está vacío. Arrastra una placa desde el catálogo para empezar.',
    dropHere: 'Suelta para ponerla en el banco',
    wiring: (part, pin) => `Conectando ${pin} de ${part}: toca el pin de destino. Esc para cancelar.`,
    selected: (name) => `${name} seleccionada`,
    rotate: 'Girar',
    remove: 'Quitar',
    autoWire: 'Conectar solo',
    autoWired: (n) => (n ? `Listo: ${n} ${n === 1 ? 'cable' : 'cables'} nuevos.` : 'Ya estaba todo conectado.'),
    autoWireMissing: (pins) => `No encontré dónde conectar: ${pins.join(', ')}.`,
    noBoardForWire: 'Primero pon una placa en el banco.',
    removeWire: 'Quitar cable',
    connectRefused: {
      unknown: 'Ese pin no existe.',
      same: 'Elige otro pin: es el mismo.',
      duplicate: 'Esos dos pines ya están conectados.',
      full: 'El banco ya tiene demasiados cables.',
    },
    saved: 'Guardado',
    saveFailed: 'No pude guardar el circuito. Prueba otra vez.',
    loadFailed: 'El archivo del circuito tenía partes rotas: las quité.',
    pinTip: (part, pin) => `${pin} · ${part}`,
  },

  // --- The checker's findings (circuitModel.checkDesign), in plain words ---
  check: {
    title: 'Revisión del circuito',
    ok: 'Todo está bien conectado.',
    summary: (red, yellow) => [red && `${red} ${red === 1 ? 'peligro' : 'peligros'}`, yellow && `${yellow} por revisar`].filter(Boolean).join(' · '),
    issues: {
      short: () => 'Cortocircuito: la energía va directo a tierra. Puede quemar la placa.',
      mixedPower: () => 'Se juntaron 5 V y 3,3 V en el mismo cable.',
      overvoltage: (part) => `${part} es de 3,3 V y está conectada a 5 V: se puede quemar.`,
      undervoltage: (part) => `${part} necesita 5 V y le llegan 3,3 V: puede no funcionar.`,
      missing: (part, pin) => `A ${part} le falta conectar ${pin}.`,
      wrongPin: (part, pin) => `${pin} de ${part} está en un pin que no sirve para eso.`,
      pinShared: (part, pin, boardPin) => `${pin} de ${part} comparte el pin ${boardPin} con otra pieza.`,
      level: (part, pin) => `${pin} de ${part} manda 5 V a una placa de 3,3 V: usa un divisor de voltaje.`,
      budget: (part, used, budget) => `La placa da ${budget} mA y le piden ${used} mA: usa una fuente aparte.`,
      noBoard: () => 'Falta una placa que controle las piezas.',
    },
    fix: 'Arreglar con Qubi',
  },

  // --- Simulation (the bench comes alive) ---
  sim: {
    start: 'Simular',
    stop: 'Detener',
    running: 'Simulando…',
    blocked: 'Arregla los peligros en rojo antes de simular.',
    distance: (cm) => `${cm} cm`,
    temperature: (c, h) => `${c} °C · ${h} %`,
    angle: (deg) => `${deg}°`,
    on: 'Encendido',
    off: 'Apagado',
  },

  // --- Printable parts (the enclosure) ---
  enclosure: {
    title: 'Caja para imprimir',
    make: 'Crear la caja',
    show: 'Ver la caja',
    hide: 'Ocultar la caja',
    explode: 'Ver por dentro',
    exportStl: 'Descargar STL',
    exportScad: 'Descargar OpenSCAD',
    saved: (file) => `Guardé ${file} en tu proyecto.`,
    noBoard: 'Pon una placa en el banco para hacer su caja.',
    size: (w, d, h) => `${w} × ${d} × ${h} mm`,
    print: (minutes, grams) => `Unas ${Math.round(minutes / 60 * 10) / 10} h de impresión · ${grams} g de PLA`,
  },

  // --- Code for the board ---
  sketch: {
    make: 'Crear el código',
    saved: (file) => `El código está en ${file}.`,
    noBoard: 'Pon una placa en el banco para crear su código.',
  },

  // --- Chat chips (the chat specialized in Arduino) ---
  chips: {
    ideas: '¿Qué puedo construir?',
    review: 'Revisa mis conexiones',
    wireIt: 'Conéctalo tú',
    enclosure: 'Hazle una caja',
  },
  prompts: {
    ideas: '¿Qué puedo construir con las piezas que tengo en el banco? Dame 3 ideas sencillas y arma la que más te guste.',
    review: 'Revisa las conexiones de mi circuito y arregla lo que esté mal.',
    wireIt: 'Conecta todas las piezas del banco a la placa de la forma correcta.',
    enclosure: 'Hazle una caja imprimible a mi circuito.',
  },

  // --- The lab's panel UI (catalogView, labToolbarView, labDropView) ---
  panel: {
    toolbar: 'Herramientas del banco',
    enclosure: 'Caja',
    partLabel: (name, n) => `${name} ${n}`,
    showPart: (part) => `Ver ${part} en el banco`,
    dropPart: (name) => `Soltar ${name} aquí`,
  },
  // --- labViewModel's own notices ---
  viewModel: {
    exportFailed: 'No pude guardar el archivo. Prueba otra vez.',
    notReady: 'Esta parte del laboratorio todavía no está lista.',
  },
};
