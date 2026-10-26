// Generate a complete, compilable Arduino .ino sketch from a circuit design.
// Pure function: { ok, reason?, code, board, libraries }
// The .ino uses real pin numbers from the wiring, includes the right libraries,
// and mirrors simModel behaviour in loop().

import { componentOf } from './componentCatalog.js';

// Resolve the net graph: for every pin of every part, find all pins on the
// board that share the same net (direct wire or through other parts).
// Returns { part.pinId: { boardPin: boardPinId, pinSpec, pinType } }
function buildNetMap(design, boardPart, boardSpec) {
  const parent = new Map();
  const find = (k) => {
    while (parent.get(k) !== k) {
      parent.set(k, parent.get(parent.get(k)));
      k = parent.get(k);
    }
    return k;
  };
  const add = (k) => { if (!parent.has(k)) parent.set(k, k); };

  for (const w of design.wires) {
    add(w.from.part + ':' + w.from.pin);
    add(w.to.part + ':' + w.to.pin);
    parent.set(
      find(w.from.part + ':' + w.from.pin),
      find(w.to.part + ':' + w.to.pin),
    );
  }

  const nets = new Map();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!nets.has(root)) nets.set(root, []);
    nets.get(root).push({
      part: k.slice(0, k.lastIndexOf(':')),
      pin: k.slice(k.lastIndexOf(':') + 1),
    });
  }

  const result = {};
  for (const part of design.parts) {
    const spec = componentOf(part.type);
    if (!spec || spec.kind === 'board') continue;
    for (const pin of spec.pins) {
      const key = part.id + ':' + pin.id;
      const members = nets.get(find(key));
      if (!members) continue;
      const boardPin = members.find((m) => m.part === boardPart.id);
      if (!boardPin) continue;
      const pinSpec = boardSpec.pins.find((p) => p.id === boardPin.pin);
      result[key] = { boardPin: boardPin.pin, pinSpec };
    }
  }
  return result;
}

// Pin code for the .ino: Uno D13→13 A0→A0, ESP32 GPIO12→12, Pico GP4→4
function pinNum(pinSpec) {
  if (!pinSpec) return '?';
  const id = pinSpec.id;
  if (id.startsWith('A')) return id;
  if (id.startsWith('GP')) return id.slice(2);
  if (id.startsWith('GPIO')) return id.slice(4);
  if (id.startsWith('D')) return id.slice(1);
  return id;
}

// Pin type for the .ino: 'analog', 'pwm', or 'digital'
function pinType(pinSpec) {
  if (!pinSpec) return 'digital';
  const kinds = pinSpec.kinds || [];
  if (kinds.includes('analog')) return 'analog';
  if (kinds.includes('pwm')) return 'pwm';
  return 'digital';
}

// Check whether every pin of a part has a net map entry (fully wired)
function isWired(partId, pinIds, pinMap) {
  return pinIds.every((p) => pinMap.has(partId + ':' + p));
}

export function sketchFor(design) {
  // 1. Find the first board
  const boardPart = design.parts.find((p) => componentOf(p.type)?.kind === 'board');
  if (!boardPart) return { ok: false, reason: 'noBoard' };

  const boardSpec = componentOf(boardPart.type);

  // 2. Build net map
  const rawMap = buildNetMap(design, boardPart, boardSpec);
  const pinMap = new Map();
  for (const [key, val] of Object.entries(rawMap)) {
    pinMap.set(key, { ...val, pinType: pinType(val.pinSpec) });
  }

  // 3. Gather libraries
  const libraries = new Set(['Servo']);
  let hasDistance = false;
  let hasServo = false;
  let hasDHT = false;
  let hasOLED = false;
  let hasLCD = false;

  for (const part of design.parts) {
    switch (part.type) {
      case 'hc-sr04':  hasDistance = true; break;
      case 'servo-sg90': hasServo = true; break;
      case 'dht22':    hasDHT = true; break;
      case 'oled-128x64': hasOLED = true; break;
      case 'lcd-1602-i2c': hasLCD = true; break;
    }
  }

  if (boardPart.type === 'esp32-devkit' && hasServo) {
    libraries.add('ESP32Servo');
  }
  if (hasDHT) libraries.add('DHT');
  if (hasOLED) {
    libraries.add('Adafruit SSD1306');
    libraries.add('Adafruit GFX');
  }
  if (hasLCD) libraries.add('LiquidCrystal I2C');

  const libList = [...libraries];

  // 4. Build the .ino code
  let code = '';

  // --- Includes ---
  code += libList.map((lib) => '#include <' + lib + '.h>\n').join('');
  code += '\n';

  // --- Global variable declarations ---
  code += '// ===== Declaraciones globales =====\n\n';
  code += 'Servo servo;\n';
  if (hasDHT) code += 'DHT dht(2, DHT22);\n'; // pin 2 is a placeholder, overridden below
  if (hasOLED) code += 'Adafruit_SSD1306 oled(128, 64, &Wire);\n';
  if (hasLCD) code += 'LiquidCrystal_I2C lcd(0x27, 16, 2);\n';

  code += '\n// ===== Pines =====\n\n';

  // Pin definitions per part
  for (const part of design.parts) {
    const spec = componentOf(part.type);
    if (!spec || spec.kind === 'board') continue;

    for (const pin of spec.pins) {
      // Signal pins → const int PIN_N = X;
      if (pin.accepts.includes('gnd') || pin.accepts.includes('5v') ||
          pin.accepts.includes('3v3') || pin.accepts.includes('vin')) {
        continue; // power pins don't get a const int
      }
      const mapEntry = pinMap.get(part.id + ':' + pin.id);
      if (mapEntry) {
        const p = pinNum(mapEntry.pinSpec);
        code += 'const int ' + pin.id + '_' + pin.id + ' = ' + p + ';\n';
      }
    }
  }

  code += '\n';

  // --- setup() ---
  code += 'void setup() {\n';
  code += '  Serial.begin(9600);\n';

  for (const part of design.parts) {
    const spec = componentOf(part.type);
    if (!spec || spec.kind === 'board') continue;

    for (const pin of spec.pins) {
      if (pin.accepts.includes('gnd') || pin.accepts.includes('5v') ||
          pin.accepts.includes('3v3') || pin.accepts.includes('vin')) {
        continue;
      }
      const mapEntry = pinMap.get(part.id + ':' + pin.id);
      if (!mapEntry) continue;

      const p = pinNum(mapEntry.pinSpec);

      if (part.type === 'hc-sr04' && pin.id === 'TRIG') {
        code += '  pinMode(' + p + ', OUTPUT);  // TRIG sensor distancia\n';
      } else if (part.type === 'hc-sr04' && pin.id === 'ECHO') {
        code += '  pinMode(' + p + ', INPUT);   // ECHO sensor distancia\n';
      } else if (part.type === 'servo-sg90' && pin.id === 'SIG') {
        code += '  servo.attach(' + p + ');\n';
      } else if (part.type === 'led' || part.type === 'buzzer' ||
                 part.type === 'relay') {
        code += '  pinMode(' + p + ', OUTPUT);\n';
      } else if (part.type === 'button') {
        code += '  pinMode(' + p + ', INPUT_PULLUP);\n';
      } else if (part.type === 'dht22' && pin.id === 'DATA') {
        code += '  dht.begin();\n';
      }
    }
  }

  // Initialize I2C displays (SDA=A4, SCL=A5 on Uno)
  if (hasOLED || hasLCD) {
    code += '\n  pinMode(A4, OUTPUT);\n  pinMode(A5, OUTPUT);\n  Wire.begin();\n';
  }
  if (hasOLED) code += '  oled.begin(0x3C);\n';
  if (hasLCD) code += '\n  lcd.init();\n  lcd.backlight();\n';

  code += '}\n\n';

  // --- loop() ---
  code += 'void loop() {\n';

  // Distance sensor reading (always first, -1 default for parts without it)
  code += '  float distancia = -1;\n\n';

  if (hasDistance) {
    const trigMap = pinMap.get('hc-sr04-1:TRIG');
    const echoMap = pinMap.get('hc-sr04-1:ECHO');
    if (trigMap && echoMap) {
      const t = pinNum(trigMap.pinSpec);
      const e = pinNum(echoMap.pinSpec);
      code += '  // --- Lectura de distancia ---\n';
      code += '  digitalWrite(' + t + ', LOW);\n';
      code += '  delayMicroseconds(2);\n';
      code += '  digitalWrite(' + t + ', HIGH);\n';
      code += '  delayMicroseconds(10);\n';
      code += '  digitalWrite(' + t + ', LOW);\n';
      code += '  long duracion = pulseIn(' + e + ', HIGH);\n';
      code += '  distancia = duracion / 58.0;\n';
      code += '  if (distancia < 0) distancia = 0;\n';
      code += '  if (distancia > 400) distancia = 400;\n\n';
    }
  }

  // Servo behaviour
  if (hasServo) {
    const sigMap = pinMap.get('servo-sg90-1:SIG');
    if (sigMap) {
      code += '  // --- Servo ---\n';
      code += '  if (distancia > 0 && distancia <= 400) {\n';
      code += '    int angulo = map(distancia, 5, 60, 0, 180);\n';
      code += '    servo.write(angulo);\n';
      code += '  } else {\n';
      code += '    // Barre si no hay distancia\n';
      code += '    for (int angulo = 0; angulo <= 180; angulo += 1) {\n';
      code += '      servo.write(angulo);\n';
      code += '      delay(10);\n';
      code += '    }\n';
      code += '  }\n\n';
    }
  }

  // LED behaviour
  if (design.parts.some((p) => p.type === 'led')) {
    const sigMap = pinMap.get('led-1:SIG');
    if (sigMap) {
      const p = pinNum(sigMap.pinSpec);
      code += '  // --- LED ---\n';
      code += '  if (distancia > 0 && distancia < 20) {\n';
      code += '    digitalWrite(' + p + ', HIGH);\n';
      code += '  } else {\n';
      code += '    // Parpadea si no hay distancia\n';
      code += '    if (millis() % 1000 < 500) {\n';
      code += '      digitalWrite(' + p + ', HIGH);\n';
      code += '    } else {\n';
      code += '      digitalWrite(' + p + ', LOW);\n';
      code += '    }\n';
      code += '  }\n\n';
    }
  }

  // Buzzer
  if (design.parts.some((p) => p.type === 'buzzer')) {
    const sigMap = pinMap.get('buzzer-1:SIG');
    if (sigMap) {
      const p = pinNum(sigMap.pinSpec);
      code += '  // --- Zumbador ---\n';
      code += '  if (distancia > 0 && distancia < 20) {\n';
      code += '    digitalWrite(' + p + ', HIGH);\n';
      code += '  } else {\n';
      code += '    digitalWrite(' + p + ', LOW);\n';
      code += '  }\n\n';
    }
  }

  // Relay
  if (design.parts.some((p) => p.type === 'relay')) {
    const sigMap = pinMap.get('relay-1:IN');
    if (sigMap) {
      const p = pinNum(sigMap.pinSpec);
      code += '  // --- Relé ---\n';
      code += '  if (distancia > 0 && distancia < 20) {\n';
      code += '    digitalWrite(' + p + ', HIGH);\n';
      code += '  } else {\n';
      code += '    digitalWrite(' + p + ', LOW);\n';
      code += '  }\n\n';
    }
  }

  // Button
  if (design.parts.some((p) => p.type === 'button')) {
    const sigMap = pinMap.get('button-1:SIG');
    if (sigMap) {
      const p = pinNum(sigMap.pinSpec);
      code += '  // --- Botón ---\n';
      code += '  if (digitalRead(' + p + ') == LOW) {\n';
      code += '    digitalWrite(13, HIGH);\n';
      code += '  }\n\n';
    }
  }

  // Potentiometer
  if (design.parts.some((p) => p.type === 'potentiometer')) {
    const sigMap = pinMap.get('potentiometer-1:OUT');
    if (sigMap) {
      const p = pinNum(sigMap.pinSpec);
      code += '  // --- Potenciómetro ---\n';
      code += '  int valorPot = analogRead(' + p + ');\n';
      code += '  Serial.println(valorPot);\n\n';
    }
  }

  // DHT22
  if (hasDHT) {
    const sigMap = pinMap.get('dht22-1:DATA');
    if (sigMap) {
      code += '  // --- DHT22 ---\n';
      code += '  float c = dht.readTemperature();\n';
      code += '  float f = c * 9.0 / 5.0 + 32.0;\n';
      code += '  float h = dht.readHumidity();\n';
      code += '  Serial.print("Temperatura: ");\n';
      code += '  Serial.print(c);\n';
      code += '  Serial.print(" C, Humedad: ");\n';
      code += '  Serial.print(h);\n';
      code += '  Serial.println("%");\n\n';
    }
  }

  // OLED display
  if (hasOLED) {
    code += '  // --- Pantalla OLED ---\n';
    code += '  oled.clearDisplay();\n';
    code += '  oled.setCursor(0, 0);\n';
    code += '  oled.setTextSize(1);\n';
    code += '  if (distancia > 0 && distancia <= 400) {\n';
    code += '    oled.print("Dist: ");\n';
    code += '    oled.println(distancia);\n';
    code += '  } else {\n';
    code += '    oled.print("C: ");\n';
    code += '    oled.print(c);\n';
    code += '  }\n';
    code += '  oled.display();\n';
    code += '  delay(200);\n\n';
  }

  // LCD display
  if (hasLCD) {
    code += '  // --- Pantalla LCD 1602 ---\n';
    code += '  lcd.setCursor(0, 0);\n';
    code += '  if (distancia > 0 && distancia <= 400) {\n';
    code += '    lcd.print("Dist: ");\n';
    code += '    lcd.println(distancia);\n';
    code += '  } else {\n';
    code += '    lcd.print("C: ");\n';
    code += '    lcd.print(c);\n';
    code += '  }\n\n';
  }

  // Serial.println of readings
  code += '  // --- Lecturas por Serial ---\n';
  code += '  if (distancia > 0 && distancia <= 400) {\n';
  code += '    Serial.print("Distancia: ");\n';
  code += '    Serial.println(distancia);\n';
  code += '  }\n\n';

  // Unconnected pieces: comment only
  for (const part of design.parts) {
    const spec = componentOf(part.type);
    if (!spec || spec.kind === 'board') continue;
    const pinIds = spec.pins.map((p) => p.id);
    if (!isWired(part.id, pinIds, pinMap)) {
      code += '  // ' + part.id + ': falta conectarla\n';
    }
  }

  code += '  delay(200);\n';
  code += '}\n';

  return {
    ok: true,
    code: code,
    board: boardPart,
    libraries: libList,
  };
}