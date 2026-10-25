// Every user-facing text lives here (Spanish). Code, comments and identifiers stay in English.
// To translate the UI, copy this file (e.g. en.js) and change the import in the modules that use it.
import { plural } from '../core/format.js';

const files = (n) => plural(n, 'archivo', 'archivos');
const folders = (n) => plural(n, 'carpeta', 'carpetas');

export const strings = {
  controls: {
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    rotateLeft: 'Girar a la izquierda (Q)',
    rotateRight: 'Girar a la derecha (E)',
    reset: 'Centrar vista',
    hands: 'Mover el mapa con la mano (cámara)',
    handsFree: 'Control sin manos: ojos o cabeza (cámara)',
  },

  // Moving the map with a hand in front of the camera (the image never leaves the computer)
  hands: {
    starting: 'Encendiendo la cámara…',
    noHand: 'Muestra tu mano a la cámara',
    open: 'Junta pulgar e índice para agarrar el mapa',
    pinching: {
      grab: 'Agarrado: mueve la mano para mover el mapa',
      pan: 'Moviendo el mapa',
      hold: 'Sostén con una mano y mueve la otra: arriba o abajo para el zoom, a los lados para girar',
      rotate: 'Girando el mapa',
    },
    // spec/003-hand-gestures.md: zoom with two hands, a cursor, selecting by holding still
    zoom: { zoom: 'Zoom: sube o baja la mano', zoomIn: 'Acercando', zoomOut: 'Alejando' },
    pointing: 'Señalando: deja la mano quieta sobre algo para elegirlo',
    holding: 'Quieta… eligiendo',
    selected: (name) => `Seleccionado: ${name}`,
    waitRelease: 'Suelta la mano para volver a agarrar',
    slow: 'Tu computadora va lenta para dos manos: el zoom y el giro con dos manos quedaron apagados.',
    fps: (fps, delegate) => `${fps} fps · ${delegate ?? '…'}`,
    help: 'Ver los gestos',
    helpTitle: 'Gestos',
    helpItems: [
      'Pellizca (pulgar e índice) y mueve la mano: mueves el mapa.',
      'Zoom: pellizca con las dos manos, deja una quieta y sube la otra para acercar o bájala para alejar.',
      'Girar: pellizca con las dos manos, deja una quieta y mueve la otra a la derecha o a la izquierda.',
      'Mano abierta: aparece el cursor. Déjalo quieto ~1 segundo sobre algo para elegirlo.',
      'Se puede elegir todo lo que se elige con un clic, salvo reparar, verificar, deshacer, los permisos del agente y los servidores.',
    ],
    errors: {
      denied: 'No hay permiso para usar la cámara. Actívalo en la configuración del sistema.',
      noCamera: 'No encontré una cámara.',
      failed: 'No pude iniciar el seguimiento de la mano.',
    },
  },

  // Using Platanus without hands: pointing with the eyes or the head (spec/004-hands-free-control.md).
  // Everything lives in the hand's camera card. The image never leaves the computer; only the adjustments
  // are remembered.
  handsFree: {
    choose: '¿Con qué vas a apuntar?',
    withEyes: 'Con los ojos',
    withHead: 'Con la cabeza',
    starting: 'Encendiendo la cámara…',
    noFace: 'No veo tu cara',
    looking: 'Mirando',
    pointingHead: 'Apuntando con la cabeza',
    holding: 'Quieto…',
    lens: 'Lupa abierta: mira fijo lo que quieres',
    selected: (name) => `Seleccionado: ${name}`,
    paused: 'En pausa',
    slow: 'Va lento: el cursor puede ir a saltos.',
    dark: 'Hay poca luz: el cursor va a temblar más. Prende una luz frente a ti.',
    fps: (fps, delegate, size) => `${fps} fps · ${delegate ?? '…'}${size ? ` · ${size.width}×${size.height}` : ''}`,
    // The precision report (npm run dev, ⌘⇧D): only numbers, copied to paste in the chat with whoever helps
    report: {
      copied: 'Informe de precisión copiado',
      none: 'Calibra primero: el informe sale de la última calibración',
      failed: 'No se pudo copiar el informe',
    },
    needsCalibration: 'Falta calibrar la mirada',
    error: (px) => `Error: ${px} px`,
    bar: {
      pause: 'Pausa',
      resume: 'Seguir',
      correct: 'Corregir',
      recenter: 'Recentrar',
      recalibrate: 'Recalibrar',
      settings: 'Ajustes',
    },
    positioning: {
      title: 'Primero, tu posición',
      issues: {
        noFace: 'No veo tu cara: ponte frente a la cámara',
        light: 'Hay poca luz: prende una luz frente a ti, no detrás',
        eyes: 'Abre bien los ojos',
        closer: 'Acércate un poco a la pantalla',
        farther: 'Aléjate un poco de la pantalla',
        center: 'Centra tu cara en la imagen',
        frontal: 'Mira de frente a la pantalla',
      },
      ready: 'Bien así: ya puedes empezar',
      hint: 'Si puedes, apoya la cabeza: la calibración sale más exacta.',
      start: 'Empezar',
      anyway: 'Empezar igual',
    },
    calibration: {
      points: (i, total) => `Mira el punto hasta que se llene: ${i} de ${total}`,
      head: 'Sigue mirando el punto y mueve la cabeza un poco, despacio (si puedes)',
      test: (i, total) => `Comprobando: ${i} de ${total}`,
      center: 'Mira el punto del centro',
      centerHead: 'Mira al centro de la pantalla y quédate quieto',
      blink: (count, needed) => `Parpadea largo (cierra los ojos un segundo): ${count} de ${needed}`,
      cancel: 'Cancelar',
    },
    result: {
      title: 'Resultado de la calibración',
      quality: { good: 'Calidad: buena', fair: 'Calidad: regular', bad: 'Calidad: mala' },
      error: (px) => `Error típico: ${px} px`,
      inverted: 'Salió al revés: la mirada y los puntos no coinciden. Repítela mirando cada punto.',
      failed: 'No pude calcularla. Repítela con más luz y la cara de frente.',
      accept: 'Usar así',
      repeatBad: 'Repetir puntos malos',
      repeat: 'Repetir',
    },
    settingsPanel: {
      title: 'Ajustes sin manos',
      previous: 'Anterior',
      next: 'Siguiente',
      close: 'Cerrar',
      less: 'Menos',
      more: 'Más',
      page: (i, total) => `${i} de ${total}`,
      labels: {
        pointer: 'Apuntar con',
        dwell: 'Tiempo quieto para elegir',
        tolerance: 'Tolerancia al moverse',
        smoothing: 'Suavizado del cursor',
        lensFactor: 'Aumento de la lupa',
        pace: 'Ritmo de la calibración',
        gainLeft: 'Velocidad hacia la izquierda',
        gainRight: 'Velocidad hacia la derecha',
        gainUp: 'Velocidad hacia arriba',
        gainDown: 'Velocidad hacia abajo',
        headLens: 'Lupa con la cabeza',
        longBlink: 'Elegir con un parpadeo largo',
      },
      pointers: { eyes: 'Los ojos', head: 'La cabeza' },
      yes: 'Sí',
      no: 'No',
      seconds: (ms) => `${(ms / 1000).toLocaleString('es', { maximumFractionDigits: 2 })} s`,
      times: (n) => `×${n.toLocaleString('es')}`,
      pace: (n) => (n === 1 ? 'Normal' : `${n.toLocaleString('es')} veces más lento`),
      level: (n) => n.toLocaleString('es', { maximumFractionDigits: 2 }),
    },
    errors: {
      denied: 'No hay permiso para usar la cámara. Actívalo en la configuración del sistema.',
      noCamera: 'No encontré una cámara.',
      failed: 'No pude iniciar el seguimiento de la cara. Si falta el modelo, corre npm run models.',
    },
  },

  git: {
    title: (branch) => (branch ? `Git · ${branch}` : 'Git · HEAD suelto'),
    summary: ({ branches, commits, lastTag }) =>
      `${plural(branches, 'rama', 'ramas')} · ${plural(commits, 'commit', 'commits')}` + (lastTag ? ` · último tag ${lastTag}` : ''),
    risky: (n) => `⚠ ${plural(n, 'commit subió', 'commits subieron')} secretos`,
    loading: 'Leyendo el historial…',
    notRepo: 'Esta carpeta no usa git',
    notRepoHint: 'Inicializa un repositorio (git init) para ver tus ramas aquí.',
    gitMissing: 'No encontré git instalado en este equipo.',
    error: 'No pude leer el historial de git.',
    noProject: 'Abre un proyecto para ver sus ramas.',
    deleted: 'borrada',
    head: 'HEAD',
    laneNames: { merged: 'rama mezclada', unknown: 'sin rama' },
    commitSelected: ({ short, subject, author, date, lane, files }) => {
      const when = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      const list = files.slice(0, 8).map((f) => `${f.status} ${f.path}`).join('\n');
      const more = files.length > 8 ? `\n… y ${files.length - 8} más` : '';
      const changes = files.length ? `\n\n${plural(files.length, 'archivo', 'archivos')}:\n${list}${more}` : '\n\nCommit de merge (sin cambios propios).';
      return `🔹 ${short} · ${subject}\n${author} · ${when}\nRama: ${lane}${changes}`;
    },
    riskWarning: (files) =>
      `\n\n⚠ Este commit subió ${files.join(', ')}. Aunque se borre después, queda en el historial de git: rota esas claves y limpia la historia (por ejemplo con git filter-repo).`,
  },

  emptyState: {
    title: '¿Qué construimos hoy?',
    body: 'Crea un proyecto o abre uno que ya tengas para verlo en el mapa.',
    newAction: 'Nuevo proyecto',
    action: 'Abrir carpeta…',
    recentNone: 'Aquí verás los proyectos que abras.',
    // When a recent project was last opened (calendar days ago)
    when: (days) => (days === 0 ? 'hoy' : days === 1 ? 'ayer' : days < 7 ? `${days} d` : days < 30 ? `${Math.floor(days / 7)} sem` : `${Math.floor(days / 30)} m`),
  },

  // Floating editor: files clicked on the map open as tabs
  editor: {
    title: 'Editor',
    close: 'Cerrar el editor',
    closeTab: 'Cerrar pestaña',
    save: 'Guardar',
    saveHint: 'Guardar (⌘S)',
    saving: 'Guardando…',
    saved: 'Guardado',
    unsaved: 'Sin guardar',
    loading: 'Abriendo…',
    secret: 'Secreto',
    secretHint: 'Este archivo guarda secretos: tu agente no puede leerlo. Guardarlo pide confirmación.',
    confirmClose: (name) => `"${name}" tiene cambios sin guardar. ¿Cerrar y perderlos?`,
    stale: 'El archivo cambió en el disco mientras lo editabas.',
    reload: 'Recargar del disco',
    // CodeMirror's own texts (search panel, folding), by its English phrase
    phrases: {
      'Find': 'Buscar', 'Replace': 'Reemplazar', 'next': 'siguiente', 'previous': 'anterior', 'all': 'todos',
      'match case': 'mayúsculas', 'regexp': 'expresión regular', 'by word': 'palabra completa',
      'replace': 'reemplazar', 'replace all': 'reemplazar todo', 'close': 'cerrar',
      'current match': 'coincidencia actual', 'on line': 'en la línea', 'replaced match on line $': 'reemplazada en la línea $',
      'replaced $ matches': '$ reemplazos', 'Go to line': 'Ir a la línea', 'go': 'ir',
      'Folded lines': 'Líneas plegadas', 'Unfolded lines': 'Líneas desplegadas', 'to': 'a', 'folded code': 'código plegado',
      'unfold': 'desplegar', 'Fold line': 'Plegar línea', 'Unfold line': 'Desplegar línea', 'Control character': 'Carácter de control',
    },
    errors: {
      notFound: 'El archivo ya no existe.',
      notFile: 'No es un archivo.',
      tooLarge: 'Es demasiado grande para abrirlo aquí (máximo 2 MB).',
      binary: 'Es un archivo binario (imagen, fuente…): no se puede editar como texto.',
      'desktop-only': 'Disponible en la app de escritorio.',
      failed: 'No se pudo abrir el archivo.',
    },
  },

  panels: {
    backToMap: 'Volver al mapa',
    schemaTitle: 'Supabase · esquema public',
    schemaSummary: (tables, hasError) => (hasError ? `${tables} tablas · 1 con error` : `${tables} tablas · todo en orden`),
    breadcrumbLabel: 'Ruta de la carpeta',
    upHint: 'Esc sube un nivel',
  },

  hud: {
    seeRisks: 'Ver la lista de riesgos',
    security: 'Seguridad',
    files: 'Archivos',
    risk: 'En riesgo',
    review: 'A revisar',
    commits: 'Commits',
  },

  map: {
    files,
    risk: (n) => `${n} en riesgo`,
    review: (n) => `${n} a revisar`,
    rootSummary: (fileCount, folderCount) => `${files(fileCount)} · ${folders(folderCount)}`,
    emptyFolder: 'vacía',
    more: (n) => `+${n} más`,
    integrations: 'Integraciones',
    defaultProjectName: 'proyecto',
    // The robot on the plaza of a new, empty project. It talks to people who do not program: it asks about the
    // idea, never about technology, and then recommends a stack explained in everyday words.
    welcome: {
      // First question: experience. "Ya programo" -> the robot says goodbye and the chat opens (Dev mode);
      // "Estoy empezando" -> the technology cards
      experience: {
        title: '¡Hola! Soy tu guía 👋',
        question: '¿Cuánta experiencia tienes programando?',
        hint: 'No hay respuestas incorrectas: así sé cómo ayudarte mejor.',
        beginner: '🌱 Estoy empezando',
        dev: '💻 Ya programo',
      },
      farewell: {
        title: '¡Genial! 🚀',
        text: 'Te dejo el chat para que pidas lo que quieras. Si me necesitas, aquí estaré.',
      },
      // Second question: the technologies to start with (models/stackCatalog.js decides which and their rules)
      stack: {
        title: '¿Con qué quieres empezar tu proyecto?',
        question: 'Ya elegí lo más usado para empezar. Toca una tarjeta para quitarla o volver a ponerla.',
        start: '✨ ¡Empecemos!',
        dismiss: 'Lo exploro yo',
      },
      // One card per technology: its name and what it does for the person, in plain words
      catalog: {
        nextjs: { name: 'Next.js', text: 'Tu app: las pantallas que ve la gente.' },
        vercel: { name: 'Vercel', text: 'La publica en internet con su propia dirección.' },
        supabase: { name: 'Supabase', text: 'Guarda tus datos: usuarios, productos, pedidos.' },
      },
      // The bubble's own controls
      ui: {
        progress: (step, of) => `Paso ${step} de ${of}`,
        coach: 'Tu guía',
        back: 'Atrás',
        rewind: (answer) => `Cambiar esta respuesta: ${answer}`,
        skip: 'Saltar',
        collapse: 'Minimizar',
        expand: 'Abrir la guía',
        close: 'Cerrar la guía',
        pill: 'Guía',
        skipTyping: 'Clic para ver todo',
        base: 'Base',
      },
      // What "Guardar mi avance" types in the chat: a commit understood by models/gitIntent.js (not the agent)
      saveProgressPhrase: 'Guarda mis avances con el nombre "Primera versión"',
      // No agent chosen yet: the request waits until the person picks one in the agent panel
      pickAgent: '¡Ya casi! 🙌 Para escribir el código necesito un asistente de IA. Elige uno en el panel de la izquierda (usa tu propia suscripción) y empiezo con tu pedido apenas lo elijas.',
      // The request the robot hands to the agent: a base project with only what was chosen, ready for the
      // person's accounts (never real keys). The person does not program: the answer in plain words.
      // `chosen`: catalog ids; `names`: their names, in the same order
      scaffoldPrompt: (chosen, names) => {
        const has = (id) => chosen.includes(id);
        return [
          `Quiero empezar un proyecto nuevo y no sé programar. Elegí empezar con: ${names.join(', ')}.`,
          '',
          'Crea el proyecto base, mínimo pero completo:',
          '- Una app Next.js (App Router, TypeScript) con una página de inicio amable que diga que el proyecto ya está funcionando.',
          '- package.json con los scripts dev, build y start.',
          '- Un README.md en español sencillo: qué es, cómo verlo funcionando y qué cuentas faltan conectar.',
          '- Un .gitignore que proteja node_modules y los archivos .env (salvo .env.example).',
          ...(has('supabase') ? ['- Supabase: @supabase/supabase-js en package.json, un cliente en lib/supabase.ts que lea NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY, y un .env.example con esas variables vacías.'] : []),
          ...(has('vercel') ? ['- Vercel: un vercel.json mínimo para publicarla.'] : []),
          '',
          'No pongas claves reales ni crees archivos .env: yo conecto mis cuentas después desde Qubbot.',
          'Al terminar, explícame en palabras simples, sin jerga, qué hiciste y qué falta conectar.',
        ].join('\n');
      },
      // Coach mode: tips that react to the project while it grows. Plain words; the file names come second.
      tips: {
        // The base project went to the agent: it is getting ready before the first file shows up
        building: {
          title: 'Preparando tu proyecto…',
          text: 'El agente está pensando cómo armarlo. En un momento verás aparecer las primeras carpetas en el mapa.',
          watch: '💬 Ver lo que hace',
        },
        waiting: {
          title: 'Tú tomaste las decisiones importantes 🧠',
          text: 'Ahora el agente escribe el código por ti. Cuando aparezca el primer archivo en el mapa, te cuento qué sigue.',
          ask: '💬 Hablar con el agente',
          change: '↩️ Cambiar mi elección',
        },
        firstFile: {
          title: '¡Tu proyecto ya existe! 🎉',
          text: (name) => `Apareció ${name} en tu mapa. Yo lo vigilo: si algo se pone riesgoso, te aviso aquí mismo.`,
        },
        gitignore: {
          title: 'Protejamos tus contraseñas 🔐',
          text: 'Te sugiero un archivo que evita que tus claves se publiquen por accidente (se llama .gitignore). Los profesionales siempre lo tienen.',
          ask: '✨ Agrégalo por mí',
          prompt: 'Crea un .gitignore adecuado para este proyecto (excluye .env, llaves y carpetas de dependencias). Explícame en una frase simple para qué sirve.',
        },
        readme: {
          title: 'Preséntale tu proyecto al mundo 📝',
          text: 'Una ficha de presentación (README) cuenta qué hace tu proyecto. Es lo primero que la gente lee.',
          ask: '✨ Escríbela por mí',
          prompt: 'Escribe un README.md corto y amigable para este proyecto: qué es, para quién es y cómo verlo funcionando. Sin jerga.',
        },
        risk: {
          title: { red: 'Encontré algo delicado 🚨', yellow: 'Vale la pena revisar esto ⚠️' },
          text: (path, reason) => `${reason} (${path}). Tranquilo: Qubi lo puede arreglar contigo.`,
          repair: '🔧 Arréglalo con Qubi',
          locate: '📍 Muéstramelo',
        },
        saveProgress: {
          title: 'Guarda una foto de tu avance 📸',
          text: 'Así siempre puedes volver a este punto si algo sale mal después. Los programadores lo llaman "commit".',
          save: '📸 Guardar mi avance',
        },
        allSet: {
          title: '¡Lo estás haciendo increíble! 🚀',
          text: 'Tu proyecto tiene todo lo básico y nada en rojo, como el de un profesional. Me retiro; el semáforo del mapa sigue cuidándolo.',
          bye: '👋 ¡Gracias, guía!',
        },
        next: 'Entendido',
      },
    },
  },

  // Integration nodes in the band at the top of the map (brand names)
  // The Supabase side panel (renderer/viewmodels/databaseViewModel.js, drawn in views/ui/shellView.js)
  database: {
    connected: 'Conectado',
    starting: 'Preparándose',
    paused: 'En pausa',
    demo: 'Datos de ejemplo',
    region: { 'sa-east-1': 'São Paulo', 'us-east-1': 'Virginia (EE. UU.)', 'us-east-2': 'Ohio (EE. UU.)', 'us-west-1': 'California (EE. UU.)', 'eu-west-1': 'Irlanda', 'eu-central-1': 'Fráncfort' },
    postgres: (v) => `Postgres ${v}`,
    plan: { free: 'Plan Free', pro: 'Plan Pro', team: 'Plan Team', enterprise: 'Plan Enterprise' },
    tables: 'Tablas',
    rows: 'Filas',
    size: 'Tamaño',
    usage: (used, limit) => `${used} de ${limit} incluidos en tu plan`,
    rowsNote: 'Las filas son una estimación de Postgres.',
    biggest: 'Tablas más grandes',
    noTables: 'Todavía no hay tablas. Pídele al agente que cree la primera.',
    rowsOf: (n) => `${n} filas`,
    refresh: 'Actualizar',
    schema: 'Ver tablas en el mapa',
    dashboard: 'Abrir en Supabase',
    loading: 'Consultando tu base de datos…',
    updated: 'Actualizado recién',
    unlinked: 'Este proyecto usa Supabase, pero todavía no conectaste tu cuenta. Conéctala para ver tus tablas, filas y espacio usado.',
    signedOut: 'Tu sesión de Supabase se cerró. Vuelve a conectar tu cuenta para ver los datos.',
    connect: 'Conectar mi cuenta',
    failed: 'No se pudieron leer los datos de Supabase.',
    retry: 'Intentar de nuevo',
  },

  // "Conectar mi cuenta" (renderer/viewmodels/connectViewModel.js, views/ui/connectModalView.js)
  accounts: {
    close: 'Cerrar',
    desktopOnly: 'Conectar cuentas solo funciona en la app de escritorio.',
    supabase: {
      title: 'Conecta Supabase',
      intro: 'Aquí se guardan los datos de tu app: usuarios, productos, pedidos. Tu proyecto ya está listo para usarlo; solo falta tu cuenta.',
      steps: ['Inicia sesión en Supabase (se abre tu navegador)', 'Elige dónde crear tu base de datos', 'Yo guardo las claves en tu proyecto, sin mostrarlas'],
      signIn: 'Iniciar sesión con Supabase',
      signing: 'Esperando que inicies sesión en tu navegador…',
      organization: 'Organización',
      newProject: (name) => `Crear un proyecto nuevo: «${name}»`,
      newNote: 'En la región de São Paulo. Antes de crearlo te muestro lo que cuesta (en el plan Free, nada).',
      existing: 'Usar un proyecto que ya tengo',
      noProjects: 'No hay proyectos activos en esta organización.',
      connect: 'Conectar',
      stages: {
        creating: 'Creando tu proyecto en Supabase…',
        starting: 'Supabase está preparando tu base de datos. Tarda uno o dos minutos…',
        keys: 'Guardando las claves en tu proyecto…',
      },
      done: (name) => `¡Listo! Tu app ya está conectada a «${name}». Guardé las claves en .env.local, protegido para que no se suba a internet.`,
      doneButton: 'Volver al mapa',
      noOrganization: 'Tu cuenta de Supabase todavía no tiene una organización. Crea una en supabase.com y vuelve a intentarlo.',
      failed: 'No se pudo conectar',
      retry: 'Intentar de nuevo',
      // What the chat says once it is connected, and why .env.local stays green
      chat: (name) => `Supabase quedó conectado con «${name}» ✅. Las claves están en .env.local y no se suben a internet.`,
      envReason: 'Claves guardadas por Qubbot; .gitignore evita que se suban.',
    },
  },

  integrations: {
    names: { supabase: 'Supabase', vercel: 'Vercel', github: 'GitHub', clerk: 'Clerk', posthog: 'PostHog' },
    // whether your agent (or Qubbot itself) can use the service: main checks its CLI login and MCP config;
    // "por conectar": set up in the project, still waiting for the person's account
    status: { connected: 'con acceso', incident: 'con una incidencia', disconnected: 'sin acceso', pending: 'por conectar', unknown: 'sin comprobar' },
    // A click on an integration still waiting for the person's account ("Conectar mi cuenta" comes later)
    pendingInfo: (name) => `${name} ya está listo en tu proyecto: solo falta conectar tu cuenta. Muy pronto podrás hacerlo con un clic desde aquí; mientras tanto, el README te dice qué datos necesita.`,
  },

  supabase: {
    connected: 'Supabase · conectado',
    // on the desktop: what main detected (whether your agent can use Supabase)
    state: { connected: 'Supabase · tu agente tiene acceso', disconnected: 'Supabase · tu agente sin acceso', unknown: 'Supabase · sin comprobar' },
    vulnerable: 'Supabase · RLS desactivado',
    critical: 'CRÍTICO',
    latency: (ms) => `${ms} ms`,
    exposed: 'expuesto',
    rlsOn: 'RLS ON',
    rlsOff: 'RLS OFF',
  },

  security: {
    levels: { green: 'Seguro', yellow: 'Revisar', red: 'Riesgo', grey: 'Sin evaluar' },
    levelWithEmoji: { green: '🟢 Seguro', yellow: '🟡 Revisar', red: '🔴 Riesgo', grey: '⚪ Sin evaluar' },
    reasons: {
      envTemplate: 'Plantilla de variables de entorno: verifica que no tenga valores reales.',
      envFile: 'Archivo de claves subido al repositorio: cualquiera con acceso al código puede verlas.',
      privateKey: 'Llave o certificado privado dentro del proyecto.',
      secretName: 'El nombre sugiere credenciales o secretos guardados en el código.',
      sql: 'SQL o migración: revisa permisos y políticas RLS.',
      sensitiveLogic: 'Lógica sensible (autenticación o sesiones): conviene revisarla.',
      config: 'Configuración: revisa que no exponga datos ni dé permisos de más.',
      clean: 'Sin señales de riesgo.',
      // The audit (electron/securityAudit.js): what each rule found, in plain words
      hardcodedSecret: 'Hay una clave o contraseña escrita dentro del archivo: cualquiera que lo vea puede usarla.',
      sqlInjection: 'Una consulta a la base de datos pega lo que manda la persona tal cual: alguien podría leer o borrar datos (inyección SQL).',
      commandInjection: 'Se ejecuta un comando del sistema armado con datos de afuera: alguien podría colar sus propios comandos.',
      tlsDisabled: 'Se apagó la verificación de conexiones seguras (HTTPS): alguien en medio podría espiar.',
      jwtUnsafe: 'Los pases de sesión (JWT) se leen sin comprobar que sean de verdad.',
      evalUse: 'Se ejecuta texto como si fuera código (eval): si ese texto viene de afuera, es peligroso.',
      htmlInjection: 'Se pinta HTML que puede venir de afuera: alguien podría colar código en la página.',
      corsOpen: 'Cualquier página web puede hablar con este servidor (CORS abierto a todos).',
      weakHash: 'Se usa un candado viejo (MD5 o SHA-1) que ya se puede romper.',
      insecureRandom: 'Se crean claves o pases con un azar que se puede adivinar (Math.random).',
      cookieInsecure: 'Una cookie de sesión se guarda sin protección (httpOnly): un script podría robarla.',
      debugEnabled: 'El modo de pruebas (debug) está encendido: muestra detalles internos a cualquiera.',
      sqlNoAccessRules: 'Una tabla guarda datos personales sin reglas de quién puede verlos o cambiarlos.',
      sqlGrantAll: 'Se dan todos los permisos de una tabla a cualquiera.',
      dockerRoot: 'El contenedor corre como administrador (root): si alguien entra, entra con todos los permisos.',
      dockerLatest: 'La imagen base no tiene versión fija: puede cambiar sola y romper o abrir algo.',
      envTemplateValue: 'La plantilla de variables tiene un valor que parece real: solo debería tener nombres.',
      secretNotIgnored: 'Archivo de claves que no está en .gitignore: podría subirse al repositorio por error.',
      secretInHistory: 'Este archivo de claves se subió alguna vez: aunque ya no esté, sigue en el historial. Hay que cambiar esas claves.',
    },
    // A few words per rule (Qubi's context in a call: «src/orders.ts (línea 12: consulta SQL insegura)»)
    short: {
      hardcodedSecret: 'clave escrita en el código', sqlInjection: 'consulta SQL insegura', commandInjection: 'comando del sistema inseguro',
      tlsDisabled: 'HTTPS sin verificar', jwtUnsafe: 'sesiones sin verificar', evalUse: 'ejecuta texto como código', htmlInjection: 'HTML que viene de afuera',
      corsOpen: 'abierto a cualquier web', weakHash: 'candado viejo (MD5/SHA-1)', insecureRandom: 'pases adivinables', cookieInsecure: 'cookie sin proteger',
      debugEnabled: 'modo debug encendido', sqlNoAccessRules: 'datos personales sin reglas de acceso', sqlGrantAll: 'permisos para todos',
      dockerRoot: 'corre como administrador', dockerLatest: 'imagen sin versión fija', envTemplateValue: 'valor real en la plantilla',
      envFile: 'claves subidas al repositorio', privateKey: 'llave privada', secretName: 'archivo de secretos', secretNotIgnored: 'claves sin .gitignore', secretInHistory: 'claves en el historial de git',
    },
    // Where the audit found it: "Línea 12: …"; more than one finding adds how many more
    atLine: (line, text) => (line ? `Línea ${line}: ${text}` : text),
    more: (n) => ` (y ${n} ${n === 1 ? 'cosa más' : 'cosas más'})`,
    accepted: 'Lo revisaste y lo aceptaste así. Si el archivo cambia, se vuelve a revisar.',
    // Same reasons for "dev" mode: which rule matched and what to do about it
    techReasons: {
      envTemplate: 'Regla: nombre .env.(example|sample|template). Comprueba que solo tenga claves vacías o de ejemplo.',
      envFile: 'Regla envFile: archivo de claves rastreado por git (git ls-files). git rm --cached, añadirlo a .gitignore y rotar las claves.',
      privateKey: 'Regla: extensión .pem/.key/.p12/.pfx/.keystore/.jks o id_rsa*. Revocar la llave y sacarla del repo.',
      secretName: 'Regla: el nombre contiene secret/credential/password/private_key/service_account. Mover a variables de entorno.',
      sql: 'Regla: extensión .sql. Verificar ENABLE ROW LEVEL SECURITY y políticas por tabla.',
      sensitiveLogic: 'Regla: auth/login/session/token/jwt/middleware/crypto. Revisar validación de sesión, expiración y rutas sin auth.',
      config: 'Regla: archivo de configuración (Dockerfile, *.config.*, *.yml, vercel.json…). Revisar permisos y valores expuestos.',
      clean: 'Ninguna regla de riesgo coincide.',
      hardcodedSecret: 'Regla hardcodedSecret: clave con forma conocida (sk_, AKIA, ghp_, xox, AIza, PEM, URL con contraseña) o password/secret/apiKey asignado a un literal. Rotar la clave y leerla de process.env.',
      sqlInjection: 'Regla sqlInjection: query/execute con template ${} o concatenación. Usar parámetros ($1, ?) o el query builder.',
      commandInjection: 'Regla commandInjection: exec/spawn con template o concatenación, o shell=True. Usar execFile con argumentos separados.',
      tlsDisabled: 'Regla tlsDisabled: rejectUnauthorized:false, NODE_TLS_REJECT_UNAUTHORIZED=0 o verify=False. Quitarlo o fijar el certificado (ca).',
      jwtUnsafe: "Regla jwtUnsafe: algorithms ['none'] o jwt.decode sin verify. Usar jwt.verify con algoritmo fijo.",
      evalUse: 'Regla evalUse: eval() o new Function(). Reemplazar por JSON.parse o un mapa de funciones.',
      htmlInjection: 'Regla htmlInjection: innerHTML con variable, dangerouslySetInnerHTML o v-html. Usar textContent o sanear con DOMPurify.',
      corsOpen: "Regla corsOpen: origin '*' o cors() sin opciones. Limitar origin a los dominios propios.",
      weakHash: 'Regla weakHash: md5/sha1. Para contraseñas usar bcrypt/argon2; para integridad sha256.',
      insecureRandom: 'Regla insecureRandom: Math.random() para tokens o secretos. Usar crypto.randomBytes / crypto.randomUUID.',
      cookieInsecure: 'Regla cookieInsecure: res.cookie/cookies.set sin httpOnly. Añadir httpOnly, secure y sameSite.',
      debugEnabled: 'Regla debugEnabled: DEBUG=True o run(debug=True). Leerlo del entorno y apagarlo en producción.',
      sqlNoAccessRules: 'Regla sqlNoAccessRules: CREATE TABLE con columnas personales (email, teléfono, documento…) sin ENABLE ROW LEVEL SECURITY. Activar RLS y crear políticas.',
      sqlGrantAll: 'Regla sqlGrantAll: GRANT ALL … TO public/anon. Dar solo los permisos necesarios.',
      dockerRoot: 'Regla dockerRoot: Dockerfile sin USER no root. Añadir USER node (o un usuario propio).',
      dockerLatest: 'Regla dockerLatest: FROM sin tag o :latest. Fijar la versión (node:22-alpine o por digest).',
      envTemplateValue: 'Regla envTemplateValue: valor de 12+ caracteres que no es de ejemplo en la plantilla .env. Dejar solo el nombre.',
      secretNotIgnored: 'Regla secretNotIgnored: .env/llave/secreto sin entrada en .gitignore (git check-ignore). Añadirlo a .gitignore.',
      secretInHistory: 'Regla secretInHistory: git log --all -- <archivo> encuentra un commit con él. Rotar las claves; para borrarlo del historial, git filter-repo y forzar el push.',
    },
    byAgent: 'Evaluado por el agente.',
    byRemi: 'Plan de Qubi.',
    byDemo: 'Regla de demo: el agente de IA lo evaluará más adelante.',
  },

  // Folder tags (models/folderTags.js) and the friendly names of "vibe" mode
  tags: {
    ui: 'Interfaz',
    scene3d: '3D',
    logic: 'Lógica',
    data: 'Datos',
    server: 'Servidor',
    desktop: 'Escritorio',
    agent: 'Agente',
    security: 'Seguridad',
    tests: 'Pruebas',
    docs: 'Documentación',
    config: 'Configuración',
    assets: 'Recursos',
  },
  folders: {
      root: { name: 'Edificio principal', summary: 'La raíz del proyecto: lo que está fuera de las carpetas.' },
      screen: { name: 'Lo que ves en pantalla', summary: 'Todo lo que aparece en la ventana: mapa, paneles, chat y estilos.' },
      components: { name: 'Piezas de la pantalla', summary: 'Botones, paneles y vistas que dibujan lo que ves.' },
      styles: { name: 'Colores y estilos', summary: 'Cómo se ve todo: colores, tamaños, efectos de vidrio y animaciones.' },
      scene: { name: 'Escena 3D', summary: 'Las carpetas, los riesgos, Qubi y la cámara del mapa.' },
      viewmodels: { name: 'Estado de cada pantalla', summary: 'Qué muestra cada parte y qué pasa al hacer clic, sin dibujar nada.' },
      services: { name: 'Conexiones', summary: 'Habla con el disco, la app de escritorio y tu agente de IA.' },
      core: { name: 'Cómo funciona por dentro', summary: 'Piezas básicas que usa el resto del código.' },
      models: { name: 'Datos que recuerda la app', summary: 'El proyecto abierto, el semáforo de cada archivo y lo que eligió la persona.' },
      database: { name: 'Base de datos', summary: 'Tablas, migraciones y reglas de quién puede leer qué.' },
      server: { name: 'Servidor', summary: 'Lo que corre fuera de la pantalla y responde a la app.' },
      desktop: { name: 'App de escritorio', summary: 'La ventana, los permisos al disco, el servidor local y los agentes con tu suscripción.' },
      agent: { name: 'Inteligencia artificial', summary: 'Instrucciones y conexiones del agente de IA.' },
      security: { name: 'Seguridad y accesos', summary: 'Quién puede entrar y qué puede hacer.' },
      tests: { name: 'Pruebas automáticas', summary: 'Revisiones que se corren solas para que nada se rompa.' },
      docs: { name: 'Documentación', summary: 'Explicaciones, decisiones e instrucciones del proyecto.' },
      automation: { name: 'Automatizaciones y ajustes', summary: 'Lo que se ejecuta solo al subir cambios o publicar versiones.' },
      assets: { name: 'Imágenes y archivos', summary: 'Logos, imágenes, fuentes y archivos que se sirven tal cual.' },
      i18n: { name: 'Textos e idiomas', summary: 'Todas las frases que lee la persona, en un solo lugar.' },
  },
  // Name + sentence of a folder from folderTags.folderGuide(): { key, tags }
  describeFolder: ({ key, tags }, folder) => {
    if (key) return strings.folders[key];
    const tag = strings.tags[tags[0]];
    return { name: tag ? `${tag} · ${folder}` : folder, summary: tag ? `Archivos de ${tag.toLowerCase()}.` : 'Archivos del proyecto.' };
  },

  devTree: {
    search: 'Buscar archivo o carpeta…',
    expandAll: 'Expandir todo',
    collapseAll: 'Contraer todo',
    onlyRisks: 'Solo riesgos',
    map: 'Ver en el mapa',
    repair: 'Reparar',
    copyPath: 'Copiar ruta',
    copied: 'Ruta copiada',
    noMatches: 'Nada coincide con la búsqueda.',
    by: { agent: 'IA', qubi: 'Qubi' },
    size: (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`),
    matches: (n) => (n === 1 ? '1 resultado' : `${n} resultados`),
  },

  mode: {
    vibe: 'Vibe',
    tech: 'Dev',
    title: 'Cómo te hablo',
    info: 'Vibe: una guía con nombres sencillos. Dev: todas las carpetas, rutas y reglas.',
  },

  hover: {
    clickFolder: 'Clic para entrar al edificio',
    clickFile: 'Clic para ver el detalle',
    atRisk: (n) => `${n} en riesgo`,
    toReview: (n) => `${n} por revisar`,
    noRisks: 'Sin riesgos',
    files,
    floor: 'Piso',
    path: 'Ruta',
    size: (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`),
  },

  repair: {
    name: 'Qubi · reparador',
    step: (i, n) => `paso ${i}/${n}`,
    queued: (n) => `${n} en fila`,
    working: 'Arreglando',
    steps: ['Caminando hacia el problema', 'Mirando el problema', 'Reparando', 'Revisando el resultado', 'Listo'],
    stepsAgent: (agent) => ['Caminando hacia el problema', 'Mirando el problema', `${agent} está reparando`, 'Revisando el resultado', 'Listo'],
    outcome: { fixed: 'Reparado y auditado ✅', partial: 'Cambió algo, pero sigue el riesgo', planned: 'Plan listo', clear: 'La auditoría ya no encuentra nada', failed: 'No se pudo reparar' },
    // the audit still finds something after a repair or a "Ya lo apliqué"
    stillRisky: 'La auditoría todavía encuentra el problema.',
    fixedToVerify: (n) => `Tu agente cambió ${n === 1 ? '1 archivo' : `${n} archivos`} para arreglarlo. Revísalo y márcalo como verificado.`,
    timeout: 'El agente tardó demasiado.',
    cancelled: 'Se canceló.',
    verified: 'Verificado',
    undo: 'Deshacer cambio',
    undone: 'Deshecho',
    agentFixPrompt: (path, reason, findings = []) =>
      `Repara este problema de seguridad del archivo ${path}: ${reason}\n` +
      (findings.length
        ? 'La auditoría fija de Qubbot encontró exactamente esto (regla y línea); arregla eso, no otra cosa. Al terminar, Qubbot vuelve a auditar el archivo: solo queda verde si la regla ya no se cumple.\n'
          + findings.map((f) => `- Línea ${f.line || '–'}: ${f.rule}. ${strings.security.techReasons[f.rule] ?? ''}`).join('\n') + '\n'
        : '') +
      'Tienes permiso para resolverlo de verdad, no solo para explicar: platanus_write_file edita, platanus_delete_file borra (con copia) y platanus_run_command ejecuta comandos del proyecto (por ejemplo `git rm --cached <archivo>` para sacar un archivo de claves del repositorio sin borrarlo, o instalar y probar). Haz todo lo que el arreglo necesite y luego di en pocas palabras qué hiciste.\n' +
      '1. Lee el archivo con platanus_read_file (si se niega porque tiene secretos, no insistas: los archivos de claves se arreglan con .gitignore y git rm --cached, sin abrirlos).\n' +
      '2. Si hay un arreglo pequeño y seguro editando archivos del proyecto, escribe el archivo completo corregido con platanus_write_file y explica el cambio en "reason". La persona aprobará cada cambio. Si una parte no se puede hacer desde el proyecto (por ejemplo, cambiar claves en otro servicio), haz lo demás y explícale solo esa parte a la persona.\n' +
      '3. Explica con tres tarjetas cortas: "> [!riesgo] Qué encontré", "> [!ok] Qué cambié" (o "> [!nota] Por qué no cambié nada") y "> [!paso] Qué te falta hacer a ti".',
    chat: {
      started: (path, agent) => (agent ? `Qubi y ${agent} empezaron a revisar ${path}` : `Qubi empezó a revisar ${path}`),
      // Title of a repair's card in the chat
      title: (agent) => (agent ? 'Qubi y tu agente' : 'Qubi'),
      working: (name) => `Revisando ${name}…`,
      changed: (path, reason) => `Guardé un cambio en ${path}: ${reason}`,
      finished: {
        fixed: (path, n) => `Reparación de ${path}: ${n === 1 ? '1 archivo cambiado' : `${n} archivos cambiados`}. Quedó en amarillo hasta que lo verifiques en el historial de reparaciones.`,
        planned: (path) => `Plan de reparación de ${path} listo. Cuando lo apliques, márcalo en el historial de reparaciones.`,
        failed: (path, why) => `No se pudo reparar ${path}. ${why}`,
        verified: (path) => `${path} quedó verificado.`,
        clear: (path) => `Falsa alarma: ${path} está bien y quedó en verde. No hacía falta cambiar nada.`,
      },
      planTitle: 'Pasos:',
    },
    myPlan: 'Mi plan',
    fromAgent: (agent) => `Plan escrito con ${agent}`,
    fromGuide: 'Plan de la guía de Qubbot',
    honest: 'Qubi no cambia archivos. Tu agente sí puede, pero solo con tu aprobación y guardando una copia para deshacer. El archivo queda en amarillo hasta que lo verifiques.',
    markFixed: 'Ya lo apliqué',
    auditAgain: 'Volver a auditar',
    close: 'Cerrar',
    repair: 'Reparar',
    repairing: 'Qubi trabajando…',
    queuedShort: 'En fila',
    chip: 'Reparar con Qubi',
    chipWorst: 'Reparar lo más grave',
    plannedReason: (first) => `Qubi dejó un plan: ${first}. Falta aplicarlo.`,
    fixedReason: 'Arreglado siguiendo el plan de Qubi.',
    nothing: 'No hay riesgos para reparar. ¡Todo en orden! 🟢',
    started: (path) => `🔧 Qubi va a revisar ${path}.`,
    history: {
      title: 'Reparaciones',
      intro: 'Todo lo que Qubi y tu agente repararon o dejaron pendiente.',
      empty: 'Todavía no hay reparaciones. Toca "Reparar" en un riesgo.',
      clear: 'Limpiar terminadas',
      status: { queued: 'En fila', working: 'Trabajando', planned: 'Plan listo', fixed: 'Por verificar', verified: 'Verificado', clear: 'Falsa alarma', failed: 'Falló' },
      by: (agent) => (agent ? `con ${agent}` : 'con la guía de Qubbot'),
      changes: 'Cambios',
      plan: 'Pasos',
      explanation: 'Lo que explicó el agente',
      created: 'archivo nuevo',
      interrupted: 'Se cortó porque la app se cerró mientras trabajaba.',
      byAudit: (score) => `Verificado por la auditoría${Number.isFinite(score) ? `: el proyecto quedó en ${score}%` : ''}.`,
      verify: 'Marcar verificado',
      retry: 'Reintentar',
      open: 'Ver en el mapa',
      ago: (iso) => {
        const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
        return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`;
      },
    },
    agentPrompt: (path, reason) =>
      `Lee el archivo ${path} con platanus_read_file si puedes. El problema es: ${reason}. ` +
      'Responde SOLO con 3 pasos cortos para arreglarlo, uno por línea, cada línea empezando con "- ". No cambies ningún archivo.',
    plans: {
      envFile: ['Sacar el archivo .env del repositorio y agregarlo a .gitignore', 'Cambiar las claves que tenía (ya pudieron verse)', 'Guardar las claves nuevas en las variables del servidor'],
      privateKey: ['Quitar la llave del proyecto y guardarla en un lugar seguro', 'Crear una llave nueva y dar de baja la anterior', 'Agregar ese tipo de archivo a .gitignore'],
      secretName: ['Buscar contraseñas o claves escritas a mano en el archivo', 'Moverlas a variables de entorno', 'Cambiar las que ya estuvieron en el código'],
      envTemplate: ['Revisar que solo tenga nombres de variables, sin valores reales', 'Si hay un valor real, borrarlo y cambiar esa clave'],
      sql: ['Revisar que cada tabla tenga RLS activado', 'Crear una regla para que cada persona solo vea sus datos', 'Probar con la anon key que no se pueda leer todo'],
      sensitiveLogic: ['Revisar quién puede entrar sin iniciar sesión', 'Comprobar que las sesiones caduquen', 'Pedirle al agente una revisión línea por línea'],
      config: ['Revisar que no tenga claves ni datos privados', 'Quitar permisos que no se usen', 'Dejar solo lo necesario para producción'],
      other: ['Revisar el archivo con el agente', 'Corregir lo que encuentre', 'Volver a revisar el semáforo'],
      hardcodedSecret: ['Quitar la clave del archivo y leerla de una variable de entorno', 'Cambiar esa clave en el servicio (ya pudo verse)', 'Volver a auditar'],
      sqlInjection: ['Cambiar la consulta para que use parámetros ($1, $2…)', 'Validar los datos antes de guardarlos', 'Volver a auditar'],
      commandInjection: ['Pasar los datos como argumentos separados (execFile)', 'Validar lo que llega de afuera', 'Volver a auditar'],
      tlsDisabled: ['Volver a encender la verificación HTTPS', 'Si es un certificado propio, indicarlo con ca', 'Volver a auditar'],
      jwtUnsafe: ['Verificar cada pase con jwt.verify y un algoritmo fijo', 'Volver a auditar'],
      evalUse: ['Reemplazar eval por algo que no ejecute texto', 'Volver a auditar'],
      htmlInjection: ['Mostrar el texto con textContent o sanearlo', 'Volver a auditar'],
      corsOpen: ['Limitar CORS a los dominios de tu app', 'Volver a auditar'],
      weakHash: ['Cambiar MD5/SHA-1 por bcrypt (contraseñas) o SHA-256', 'Volver a auditar'],
      insecureRandom: ['Crear los pases con crypto.randomBytes o randomUUID', 'Volver a auditar'],
      cookieInsecure: ['Guardar la cookie con httpOnly, secure y sameSite', 'Volver a auditar'],
      debugEnabled: ['Apagar el modo debug o leerlo del entorno', 'Volver a auditar'],
      sqlNoAccessRules: ['Activar las reglas de acceso (RLS) en la tabla', 'Crear una regla para que cada quien vea solo lo suyo', 'Volver a auditar'],
      sqlGrantAll: ['Quitar GRANT ALL y dar solo los permisos necesarios', 'Volver a auditar'],
      dockerRoot: ['Añadir un usuario sin permisos de administrador (USER node)', 'Volver a auditar'],
      dockerLatest: ['Fijar la versión de la imagen base', 'Volver a auditar'],
      envTemplateValue: ['Dejar en la plantilla solo el nombre de la variable', 'Si el valor era real, cambiar esa clave', 'Volver a auditar'],
      secretNotIgnored: ['Añadir el archivo a .gitignore', 'Volver a auditar'],
      secretInHistory: ['Cambiar (rotar) cada clave del archivo en su servicio', 'Si el repositorio es público, borrarlo del historial', 'Volver a auditar'],
    },
  },

  // The robot on the map: the person drags or throws it onto a folder and it asks what to do there
  robot: {
    hint: 'Arrástrame o lánzame a una carpeta',
    dropHere: (name) => `Suéltame aquí: ${name}`,
    nowhere: 'Aquí no hay nada. Suéltame sobre una carpeta y te cuento qué hay.',
    at: (name) => `Estoy en ${name}`,
    ask: '¿Te explico qué hay aquí o quieres cambiar algo?',
    // its choices on the map, short (the chat card has the full wording)
    short: { ask: 'Explícame', edit: 'Cambiar algo', locate: 'Riesgos', tour: 'Recorrido' },
    chat: {
      here: 'El robot está aquí',
      where: (name, n) => `${name} · ${n === 1 ? '1 archivo' : `${n} archivos`}`,
      wholeProject: 'Todo el proyecto',
      projectSummary: 'La plaza: aquí se ve el proyecto completo y sus archivos sueltos.',
      allGood: 'Sin problemas',
      risks: (red, yellow) => [red && `${red} en riesgo`, yellow && `${yellow} por revisar`].filter(Boolean).join(' · '),
      explain: 'Explícame qué hay aquí',
      explainPrompt: (name) => `Explícame con palabras simples qué hay en «${name}», para qué sirve y qué archivo debería mirar primero.`,
      explainProject: 'Explícame el proyecto',
      explainProjectPrompt: 'Explícame con palabras simples cómo está armado este proyecto y por dónde debería empezar.',
      change: 'Quiero cambiar algo aquí',
      changeDraft: (name) => `En «${name}» quiero `,
      risks2: 'Ver sus riesgos',
      tour: 'Recorrido desde aquí',
    },
  },

  // Building live: the robot carries each file the agent saves to its folder (viewmodels/buildViewModel.js)
  build: {
    title: 'Construyendo',
    finished: 'Obra terminada',
    saving: (name) => `Llevo «${name}» a su carpeta`,
    waiting: (name) => `Espero tu permiso para guardar «${name}»`,
    saved: (name) => `«${name}» guardado`,
    edited: (name) => `Actualicé «${name}»`,
    notSaved: (name) => `«${name}» no se guardó`,
    done: (n, edits) => `Listo: ${[n && `${n} ${n === 1 ? 'archivo nuevo' : 'archivos nuevos'}`, edits && `${edits} ${edits === 1 ? 'cambio' : 'cambios'}`].filter(Boolean).join(' y ') || 'nada nuevo'}`,
    root: 'Archivos sueltos',
    papers: (n, edits) => [n && `+${n} ${n === 1 ? 'archivo nuevo' : 'archivos nuevos'}`, edits && `${edits} ${edits === 1 ? 'cambio' : 'cambios'}`].filter(Boolean).join(' · ') || 'En obra',
  },

  // Qubi's team (docs/features/llamada/FASE2.md, viewmodels/teamViewModel.js): 2 or 3 workers, each in
  // its own folder, and Qubi checks what each one did
  team: {
    title: 'Equipo de Qubi',
    worker: (n) => `Trabajador ${n}`,
    status: {
      queued: 'En espera',
      working: 'Trabajando',
      waiting: 'Espera tu permiso',
      done: 'Terminó',
      failed: 'No pudo terminar',
      cancelled: 'Cancelado',
    },
    audit: { checking: 'Qubi revisa…', approved: 'Aprobado', flagged: 'Revisar' },
    // Why Qubi asks the person to look at a worker's job (the fixed checks decide; the review only adds a note)
    auditNotes: {
      outside: (path) => `Cambió «${path}», que está fuera de su carpeta.`,
      secret: (path) => `Tocó «${path}», un archivo con claves.`,
      red: (path) => `«${path}» quedó en rojo en el semáforo de seguridad.`,
      failed: 'El trabajo no terminó bien.',
      review: (text) => `Qubi opina: ${text}`,
    },
    phase: { working: 'El equipo está trabajando', auditing: 'Qubi revisa el trabajo', done: 'El equipo terminó' },
    files: (created, changed) => [created && `${created} ${created === 1 ? 'archivo nuevo' : 'archivos nuevos'}`, changed && `${changed} ${changed === 1 ? 'cambio' : 'cambios'}`].filter(Boolean).join(' · ') || 'Sin archivos todavía',
    // What Qubi says on the map while it hands out the work and checks each folder
    guide: {
      dispatch: (title) => `Tú te encargas de: ${title}`,
      scan: (folder) => `Reviso ${folder}/`,
      approved: (folder) => `${folder}/ está bien`,
      flagged: (folder) => `Hay que revisar ${folder}/`,
      done: (approved, total) => `Revisé todo: ${approved} de ${total} ${total === 1 ? 'aprobado' : 'aprobados'}`,
    },
    // Why the work could not be handed out (the `motivo` the voice tool answers)
    errors: {
      ocupado: 'El equipo todavía está trabajando. Espera a que termine.',
      'sin-proyecto': 'Primero abre un proyecto.',
      'sin-agente': 'Primero elige en el chat qué agente construye.',
      'carpetas-repetidas': 'Cada tarea necesita su propia carpeta: sin repetirla y sin meter una dentro de otra.',
      'carpeta-invalida': 'Una de las carpetas no sirve: tiene que estar dentro del proyecto y no puede guardar claves.',
      'muchas-tareas': 'Puedo repartir de 1 a 3 tareas a la vez.',
    },
    // What the app tells the voice (Qubi retells it); never the agents' own words
    notices: {
      started: (n) => `Repartí el trabajo entre ${n} ${n === 1 ? 'trabajador' : 'trabajadores'}. Cada uno trabaja en su carpeta.`,
      workerDone: (title) => `Terminó la tarea «${title}». Qubi la está revisando.`,
      allDone: (approved, flagged) => `El equipo terminó. ${approved} ${approved === 1 ? 'tarea aprobada' : 'tareas aprobadas'}${flagged ? ` y ${flagged} para revisar` : ''}.`,
    },
    // Prompts for the coding agent (it reads Spanish; the rules repeat what main enforces anyway)
    prompt: {
      worker: ({ pedido, folder, memory }) => [
        'Eres un trabajador del equipo de Qubi en Qubbot. Tu tarea:',
        pedido,
        '',
        'Reglas:',
        `- Solo escribe archivos dentro de la carpeta «${folder}/». Qubbot rechaza cualquier escritura fuera de ella.`,
        '- Usa solo las herramientas de Qubbot para leer y escribir.',
        '- Nunca leas ni escribas archivos con claves (.env y parecidos).',
        '- Otros trabajadores hacen otras partes en otras carpetas al mismo tiempo: no toques su trabajo.',
        '- Al terminar, cuenta en una o dos frases sencillas qué hiciste.',
        ...(memory ? ['', 'Lo que Qubi recuerda de este proyecto:', memory] : []),
      ].join('\n'),
      review: ({ folder, files }) => [
        `Revisa, sin cambiar nada, el trabajo que se acaba de hacer en «${folder}/».`,
        `Archivos: ${files.join(', ')}.`,
        'Léelos con las herramientas de Qubbot y di en una sola frase sencilla si ves algún problema (un error, algo peligroso o algo sin terminar). Si está bien, dilo.',
        'No copies código ni claves en tu respuesta.',
      ].join('\n'),
    },
    // ver_equipo, for the voice: phase + one line per worker (titles, folders, counts; never the agent's words)
    // workers: [{ n, title, folder, status, created, changed, audit: 'checking'|'approved'|'flagged'|null }]
    summary: (phase, workers) => {
      if (!workers.length) return 'No hay ningún equipo trabajando.';
      const head = { working: 'El equipo está trabajando', auditing: 'Qubi está revisando el trabajo', done: 'El equipo terminó', idle: 'El equipo ya terminó' }[phase] ?? 'El equipo está trabajando';
      const audit = { checking: 'Qubi lo está revisando', approved: 'aprobado', flagged: 'para revisar' };
      const status = { queued: 'en espera', working: 'trabajando', waiting: 'espera tu permiso', done: 'terminó', failed: 'no pudo terminar', cancelled: 'cancelado' };
      const lines = workers.map((w) => {
        const files = [w.created && `${w.created} ${w.created === 1 ? 'archivo nuevo' : 'archivos nuevos'}`, w.changed && `${w.changed} ${w.changed === 1 ? 'cambio' : 'cambios'}`].filter(Boolean).join(' y ');
        return [`«${w.title}» en ${w.folder}/: ${status[w.status] ?? w.status}`, files, w.audit && audit[w.audit]].filter(Boolean).join(', ');
      });
      return `${head}. ${lines.join('. ')}.`;
    },
  },

  // What Qubbot remembers of a project between calls (models/projectMemoryModel.js)
  memory: {
    title: 'Lo que recuerdo',
    empty: 'Aún no recuerdo nada de este proyecto.',
    // calls, built, learned: lists (or already joined text); '' when there is nothing to tell
    text: ({ calls, built, learned } = {}) => {
      const list = (x) => (Array.isArray(x) ? x.filter(Boolean).join(', ') : String(x ?? '').trim());
      const parts = [
        list(calls) && `Llamadas anteriores: ${list(calls)}`,
        list(built) && `ya existe: ${list(built)}`,
        list(learned) && `aprendido: ${list(learned)}`,
      ].filter(Boolean);
      const text = parts.join('; ');
      return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : '';
    },
  },

  // The voice call with Qubi (docs/features/llamada/README.md): Qubi talks, the person's agent builds
  call: {
    button: 'Hablar en vivo', // the header phone (docs/features/llamada/MEJORAS.md §5)
    goToCall: 'Ir a la llamada', // the header phone while a call is on
    short: 'Hablar', // the robot's bubble
    placeholder: 'Escríbele a Qubi…', // the chat's box while a call is on: what you write goes to Qubi
    // The panel above Qubi's head: "En vivo · 0:42"
    timer: (seconds) => {
      const s = Math.max(0, Math.floor(seconds));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
    live: (time) => `En vivo · ${time}`,
    state: {
      ringing: 'Llamando…',
      live: 'En vivo',
      connecting: 'Conectando con Qubi…',
      listening: 'Qubi te escucha',
      speaking: 'Qubi está hablando',
      muted: 'Micrófono apagado',
      simulated: 'Llamada simulada',
      realtime: 'Voz a voz',
      realtimeHint: 'Qubi te escucha y te responde con su voz al instante, sin pasar por texto.',
      ended: 'Llamada terminada',
      working: 'Qubi está construyendo',
      asking: 'Buscando la respuesta…',
    },
    actions: { hideLog: 'Ocultar la conversación', showLog: 'Mostrar la conversación', settings: 'Ajustes', chat: 'Ver la conversación', mute: 'Apagar micrófono', unmute: 'Encender micrófono', hangUp: 'Colgar' },
    settings: {
      title: 'Ajustes de la llamada',
      builder: 'Quién construye',
      simulate: 'Usar llamada simulada',
      provider: 'Servicio de voz',
      providers: { auto: 'Automático', elevenlabs: 'ElevenLabs', grok: 'Grok' },
      providerHint: 'Automático usa ElevenLabs si está conectado; si no, Grok.',
      voice: 'Voz de Qubi',
      // keys of VOICES in electron/voiceCall.js; the first four are ElevenLabs voices, the last three Grok's
      style: 'Forma de hablar',
      styles: { pana: 'Pana venezolano', neutral: 'Neutral', formal: 'Formal', divertido: 'Divertido' },
      level: 'Nivel técnico',
      levels: { basico: 'Básico · muy sencillo y breve', intermedio: 'Intermedio', tecnico: 'Técnico · preciso' },
      levelHint: 'Cuánto detalle técnico usa Qubi al explicarte.',
      voices: { juan: 'Juan', julio: 'Julio', josemanuel: 'José Manuel', maggie: 'Maggie', rex: 'Rex', eve: 'Eve', ara: 'Ara' },
      voiceNotes: { juan: 'Natural y espontánea', julio: 'Animada', maggie: 'Voz femenina' },
      voiceGroups: { elevenlabs: 'ElevenLabs', grok: 'Grok' },
      connection: 'Conexión de voz…', // opens the voice-connect modal
    },
    // Qubi asks before it opens or runs anything (MEJORAS.md §2); label = permission.labels[action](target)
    permission: {
      ask: (label) => `Qubi quiere ${label}`,
      allow: 'Permitir',
      deny: 'No',
      always: 'Siempre en esta llamada',
      labels: {
        abrir_archivo: (name) => `abrir ${name}`,
        ejecutar_app: (command) => `ejecutar ${command}`,
        abrir_en_navegador: (port) => (port ? `abrir tu proyecto en el navegador (puerto ${port})` : 'abrir tu proyecto en el navegador'),
      },
      voiceHint: 'También puedes decir «sí» o «no».',
      // the person asked for it a moment ago: no second question
      direct: (label) => `${label.charAt(0).toUpperCase()}${label.slice(1)}: lo pediste tú.`,
      // The system line left in the call card after the answer
      granted: (label) => `Permitido: ${label}`,
      denied: (label) => `No permitido: ${label}`,
      expired: (label) => `Sin respuesta: ${label}`,
      // How the person's next phrase answers by voice: it starts with one of these (lowercase, without accents)
      yes: ['si', 'dale', 'ok', 'okey', 'claro', 'hazlo', 'de una', 'va', 'vale', 'listo', 'permitir', 'adelante'],
      no: ['no', 'espera', 'para', 'detente', 'mejor no', 'cancela'],
    },
    // Qubi walking where the person sends it (ir_a / volver, MEJORAS.md §3); shown on the call panel
    guide: {
      // Said on the way, a different one each time (ir_a, mostrar_carpeta; revisar_archivo; abrir_archivo)
      going: [
        (name) => `¡Voy pa' allá! ${name}`,
        (name) => `Ya voy, déjame ir a ${name}`,
        (name) => `¡Dale! Te llevo a ${name}`,
        (name) => `Vamos a ver ${name}, sígueme`,
        (name) => `¡Epa! Caminando hacia ${name}`,
      ],
      reviewing: [
        (name) => `Voy pa' allá a revisar ${name}`,
        (name) => `Déjame ir a echarle un ojo a ${name}`,
        (name) => `Ya voy a ver qué tiene ${name}`,
      ],
      opening: [
        (name) => `Voy a buscar ${name} para abrirlo`,
        (name) => `Ya voy por ${name}`,
      ],
      arrived: (name) => `Aquí está ${name}`,
      back: 'Vuelvo a mi puesto',
      notFound: (name) => `No encontré ${name} en el mapa`,
      root: 'la plaza del proyecto', // the name when the path is the project itself
    },
    errors: {
      offline: 'Qubi está fuera de conexión. Conecta un servicio de voz para hablar con él.',
      'weak-keychain': 'Tu sistema no puede guardar la clave cifrada: la usaré solo mientras Qubbot esté abierto.',
      'no-key': 'Falta la clave de voz para hablar con Qubi. Puedes usar la llamada simulada.',
      mic: 'No pude usar el micrófono. Revisa el permiso del micrófono en los ajustes de tu computador.',
      auth: 'La clave de voz no funciona. Revisa que esté bien copiada.',
      quota: 'Se acabaron los minutos de voz de la cuenta. Prueba más tarde.',
      network: 'Se cortó la conexión con Qubi. Revisa tu internet y vuelve a llamar.',
      failed: 'La llamada no pudo empezar. Inténtalo de nuevo en un momento.',
      noProject: 'Abre un proyecto antes de llamar a Qubi.',
    },
    card: {
      title: 'Llamada con Qubi',
      you: 'Tú',
      qubi: 'Qubi',
      duration: (seconds) => {
        const s = Math.max(0, Math.round(seconds));
        return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
      },
      task: { build: 'Qubi pidió construir', ask: 'Qubi preguntó' },
      empty: 'Todavía no han hablado.',
    },
    // What the client tools answer to the voice agent: plain facts it can retell (never file contents)
    tools: {
      someone: 'el agente de prueba', // who builds when no agent is connected (simulated call)
      context: {
        project: (name) => `Proyecto: ${name}.`,
        builder: (name) => `Quien construye: ${name}.`,
        empty: 'El proyecto todavía está vacío.',
        folders: (list) => `Carpetas principales: ${list}.`,
        folder: (name, n) => `${name} (${n === 1 ? '1 archivo' : `${n} archivos`})`,
        loose: (n) => `Archivos sueltos fuera de las carpetas: ${n}.`,
        light: (red, yellow, green) => `Semáforo de seguridad: ${red} en riesgo, ${yellow} por revisar y ${green} bien.`,
        risky: (list) => `Archivos que conviene revisar: ${list}.`,
        // the audit: its score and, per risky file, what it found and where
        score: (score) => `Puntaje de seguridad de la auditoría: ${score}%.`,
        finding: (path, line, what) => (line ? `${path} (línea ${line}: ${what})` : `${path} (${what})`),
        looking: (path) => `La persona está mirando la carpeta ${path} en el mapa.`,
      },
      progress: {
        none: 'No hay ningún trabajo en curso.',
        running: (agent) => `${agent} está trabajando en el pedido.`,
        asking: (agent) => `${agent} está buscando la respuesta.`,
        waiting: (name) => `Espera permiso de la persona para guardar «${name}».`,
        created: (list) => `Archivos nuevos: ${list}.`,
        changed: (list) => `Archivos cambiados: ${list}.`,
        done: 'Terminó.',
        failed: 'No pudo terminar.',
      },
    },
    // ajustar_qubi: Qubi changes how it talks because the person asked (told to the voice as context)
    // the project changed during the call (an audit, files): the fresh summary, as context for Qubi
    contextNow: (summary) => `[aviso de Qubbot] Así está el proyecto ahora (no lo leas en voz alta; úsalo si te preguntan): ${summary}`,
    adjust: {
      levels: { basico: 'muy sencillo y breve, sin palabras técnicas', intermedio: 'claro, nombrando lo común', tecnico: 'técnico y preciso, con nombres exactos' },
      styles: { pana: 'como un pana venezolano, coloquial y cálido', neutral: 'en español neutro y cordial, sin modismos', formal: 'formal, tratando de usted y sin bromas', divertido: 'divertido y con mucha energía' },
      context: ({ level, style }) => `[aviso de Qubbot] La persona cambió cómo quiere que hables. Desde ahora y hasta el final de la llamada habla ${[level, style].filter(Boolean).join(', y ')}.`,
      done: (what) => `Qubi ahora habla así: ${what}.`,
    },
    silenceEnded: 'La llamada se cortó porque nadie respondió en 20 segundos.',
    // revisar_archivo: what the agent is asked (read-only; the answer is spoken, so no code)
    review: ({ path, pregunta, level, findings = [] }) => [
      `Lee el archivo ${path} sin cambiar nada.`,
      findings.length
        ? `La auditoría de Qubbot marcó en este archivo: ${findings.map((f) => `línea ${f.line || '–'}: ${strings.security.reasons[f.rule] ?? f.rule}`).join(' · ')}. Revisa esos puntos concretos: di si el riesgo es real, por qué, y qué habría que cambiar. No digas que está bien si ese punto sigue ahí: el mapa solo se pone verde cuando la auditoría ya no lo encuentra.`
        : '',
      pregunta ? `La persona quiere saber: ${pregunta}` : 'Explica qué hace y si ves algo que esté mal o sea peligroso.',
      {
        basico: 'Responde para alguien que no programa: una o dos frases cortas, con palabras de todos los días, sin términos técnicos.',
        intermedio: 'Responde en dos o tres frases claras; puedes nombrar archivos y conceptos comunes explicándolos en pocas palabras.',
        tecnico: 'Responde de forma técnica y precisa en tres frases como máximo: nombra funciones, librerías y riesgos concretos.',
      }[level] ?? '',
      'Sin bloques de código, sin copiar el contenido y sin mostrar claves ni datos secretos: tu respuesta se leerá en voz alta.',
    ].join(' '),
    // Read by Qubi (and shown in the call card): what happened with the work it asked for
    notices: {
      built: (created, changed) => `Listo: ${[created && `${created} ${created === 1 ? 'archivo nuevo' : 'archivos nuevos'}`, changed && `${changed} ${changed === 1 ? 'cambio' : 'cambios'}`].filter(Boolean).join(' y ') || 'no hizo falta cambiar nada'}.`,
      waiting: (name) => `El agente espera tu permiso para guardar «${name}». Puedes aprobarlo en el chat.`,
      failed: (name) => `${name} no pudo terminar el trabajo. Podemos intentarlo de nuevo o pedirlo de otra forma.`,
      answered: 'El agente ya respondió tu pregunta. La tienes en el chat.',
      // revisar_archivo: the agent's answer, cleaned (no code, no keys), for Qubi to tell at the person's level
      reviewed: (summary) => `Revisé el archivo. Esto es lo que encontró el agente: ${summary}`,
      // the same, when the audit flags that file: Qubi says both and never contradicts the map
      reviewedAudit: (summary, audit) => `Revisé el archivo. El mapa lo marca por esto: ${audit}. Esto encontró el agente: ${summary}. Dilo en una o dos frases, sin rutas; si el agente dice que está bien pero el mapa lo sigue marcando, la auditoría todavía lo encuentra: ofrece repararlo.`,
      // reparar: how the audit judged the repair Qubi asked for
      repaired: ({ name, status, score, still }) => (status === 'verified'
        ? `Se reparó ${name} y la auditoría lo confirmó${Number.isFinite(score) ? `: el proyecto quedó en ${score}%` : ''}.`
        : status === 'failed' ? `No se pudo reparar ${name}.`
          : status === 'planned' ? `Para ${name} quedó un plan de reparación: hay que aplicarlo y volver a auditar.`
            : `Se cambió ${name}, pero la auditoría todavía encuentra el problema${still ? `: ${still}` : ''}.`),
      // ejecutar_app answered 'arrancando' (it took longer than the tool may wait): how it ended
      runReady: 'El proyecto ya está corriendo y su vista previa se abrió en el navegador.',
      runNoPort: 'El proyecto arrancó, pero todavía no encontré su dirección para abrir la vista previa.',
      runFailed: 'El proyecto no arrancó. Podemos intentarlo otra vez.',
    },
    // The simulated call (no voice key, the web version, demos): Qubi's fixed lines
    // Same tone as the real Qubi's first pana greeting (electron/strings.js → voice.greetings.pana[0])
    sim: {
      greeting: (project) => `¡Aló! ¿Quién habla? … ¡Epa, pana! Aquí Qubi, viendo ${project}. ¿Qué vamos a construir hoy?`,
      anyProject: 'tu proyecto',
      building: (agent) => `¡Dale! Se lo pido a ${agent}. Mira el mapa, que lo vas a ver construir.`,
      busy: 'Tranquilo, pana, dame un momentico: todavía estamos terminando lo anterior.',
      noProject: 'Primero abre un proyecto y lo construimos juntos, ¿vale?',
      noAgent: 'Primero elige en el chat qué agente construye.',
      failed: 'Epa, no pude pedirlo. ¿Lo intentamos de otra forma?',
      project: (summary) => `Mira lo que veo. ${summary}`,
      fallback: 'Te escucho, pana. Dime qué quieres construir o cambiar, por ejemplo: «agrega una página de contacto».',
      going: '¡Voy pa\' allá!',
      back: '¡Listo, ya vuelvo!',
      askPermission: 'Te pido permiso primero, ¿vale?',
      denied: 'Tranquilo, no lo hago. ¿Qué más?',
      done: '¡Listo el pollo!',
    },
  },

  // "Qubi está fuera de conexión": how to connect a voice service for the call (docs/features/llamada/VOZ.md)
  voiceConnect: {
    title: 'Qubi está fuera de conexión',
    intro: 'Para hablar con Qubi en vivo, conecta un servicio de voz. Tu clave queda guardada y cifrada solo en este computador.',
    close: 'Cerrar',
    recommended: 'Recomendado',
    providers: { elevenlabs: 'ElevenLabs', grok: 'Grok Voice (xAI)' },
    login: {
      title: 'Iniciar sesión con ElevenLabs',
      description: 'Entra o crea tu cuenta en el navegador y pulsa «Authorize». Qubbot guarda la conexión por ti.',
      button: 'Iniciar sesión',
      progress: 'Abriendo tu navegador… autoriza y vuelve',
      cancel: 'Cancelar',
      done: (last4) => `Listo: ElevenLabs conectado •••• ${last4}`,
      errors: {
        cancelled: 'Cancelaste el inicio de sesión.',
        timeout: 'Pasaron 5 minutos sin respuesta. Inténtalo de nuevo.',
        'no-node': 'Para iniciar sesión hace falta Node.js en este computador. Puedes pegar tu clave en su lugar.',
        failed: 'No pude iniciar sesión con ElevenLabs. Puedes intentarlo de nuevo o pegar tu clave.',
      },
    },
    elevenlabsKey: {
      title: 'Pegar clave de ElevenLabs',
      description: 'Si ya tienes una clave de ElevenLabs, pégala aquí.',
      label: 'Clave de ElevenLabs',
      placeholder: 'Pega tu clave (sk_…)',
      save: 'Guardar',
      where: '¿Dónde la consigo?',
      team: 'Si te la pasó tu equipo, pégala aquí',
    },
    grokKey: {
      title: 'Usar Grok Voice (xAI)',
      description: 'Qubi habla con la voz de Grok usando tu clave de xAI.',
      label: 'Clave de xAI',
      placeholder: 'Pega tu clave (xai-…)',
      save: 'Guardar',
      where: '¿Dónde la consigo?',
      note: 'Necesita una clave de la API de xAI; la suscripción de Grok no sirve para esto',
    },
    simulated: {
      title: 'Probar sin voz',
      description: 'Una llamada de prueba: Qubi contesta con frases fijas y tú le escribes.',
      button: 'Probar',
    },
    state: {
      connected: (last4) => `Conectado •••• ${last4}`,
      notConnected: 'Sin conectar',
      remove: 'Quitar',
      saving: 'Guardando…',
      saved: 'Guardada',
    },
    call: 'Hablar con Qubi', // once a provider is ready
    errors: {
      shape: 'Esa clave no tiene el formato de este servicio. Revisa que la copiaste completa.',
      'no-keychain': 'Tu sistema no permite guardarla cifrada; no la guardé.',
      'weak-keychain': 'Tu sistema no puede guardarla cifrada: la usaré solo mientras Qubbot esté abierto.',
      failed: 'No pude guardar la clave.',
      link: 'No pude abrir ese enlace.',
    },
  },

  // Services the project uses and whether the person's agent can work with them (docs/features/servicios/README.md)
  services: {
    card: {
      title: 'Servicios del proyecto',
      intro: 'Tu proyecto usa estos servicios. Los que están fuera de conexión todavía no los puede usar tu agente.',
    },
    state: { connected: 'Conectado', disconnected: 'Fuera de conexión', unknown: 'Sin comprobar' },
    connect: 'Conectar',
    // The robot's short bubble when something is offline; names: ['Stripe', 'Vercel']
    bubble: (input) => {
      const names = [input].flat().filter(Boolean);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0];
      return names.length > 1
        ? `Este proyecto usa ${list}, y están fuera de conexión. ¿Los conectamos?`
        : `Este proyecto usa ${list} y está fuera de conexión. ¿Lo conectamos?`;
    },
    modal: {
      title: (name) => `Fuera de conexión: ${name}`,
      intro: (name) => `Tu agente todavía no puede trabajar con ${name}. Conéctalo de una de estas formas.`,
      unknown: (name) => `No pude comprobar si tu agente puede trabajar con ${name}. Si no lo has conectado, hazlo de una de estas formas.`,
      close: 'Cerrar',
    },
    tabs: { cli: 'Con su CLI', mcp: 'Con MCP para tu agente' },
    cliIntro: (name) => `Instala la herramienta de ${name} en tu computador e inicia sesión. Tu agente la usará desde ahí.`,
    mcpIntro: (agent) => `Agrega ${agent ? `a ${agent}` : 'a tu agente'} la conexión directa con este servicio.`,
    steps: { install: 'Instálalo', login: 'Inicia sesión' },
    agents: { claude: 'Claude Code', codex: 'Codex', grok: 'Grok', opencode: 'OpenCode' },
    copy: 'Copiar',
    copied: 'Copiado',
    openGuide: 'Abrir la guía',
    openMcp: 'Abrir la página del MCP',
    openDashboard: 'Abrir su panel',
    noMcp: 'Este servicio todavía no tiene una conexión MCP oficial. Usa su CLI.',
    noCommand: (agent) => `No hay un comando listo para ${agent}. Abre la página del MCP y sigue sus pasos.`,
    evidence: 'Lo encontré en',
    done: 'Ya lo conecté',
    later: 'Ahora no',
    checking: 'Comprobando…',
    stillOffline: (name) => `${name} sigue fuera de conexión. Revisa los pasos y vuelve a intentarlo.`,
    nowConnected: (name) => `¡Listo! ${name} quedó conectado.`,
  },

  // "Recorrido": a guided walk through a project the person does not know yet (models/tourSpec.js)
  tour: {
    chip: 'Recorrido del proyecto',
    menu: 'Recorrido',
    title: 'Recorrido del proyecto',
    analyzing: 'Mirando cómo está armado tu proyecto…',
    writing: 'Preparando la explicación…',
    stepOf: (n, total) => `Paso ${n} de ${total}`,
    prev: 'Anterior',
    next: 'Siguiente',
    exit: 'Salir',
    finish: 'Terminar',
    again: 'Repetir',
    ended: 'Recorrido terminado',
    narratedBy: (agent) => `Narrado por ${agent}`,
    automatic: 'Recorrido automático',
    flow: 'Por dónde pasa',
    ghost: 'Sin problemas',
    busy: 'Espera a que Qubi termine la reparación para hacer el recorrido.',
    empty: 'Este proyecto todavía está vacío. Cuando tenga archivos, te lo recorro.',
    chips: {
      open: (name) => `Abrir ${name}`,
      folder: (name) => `Ver ${name}`,
      ask: 'Preguntar',
    },
    askPrompt: (name) => `Acabo de llegar a este proyecto. ¿Qué debería entender primero de ${name}?`,
    // Architecture kinds (projectAnalyzer.js)
    kinds: {
      monolith: 'Una sola aplicación',
      monorepo: 'Varias partes en un mismo lugar',
      services: 'Varios servicios',
      library: 'Una librería',
      unknown: 'Proyecto',
    },
    unitKinds: { app: 'aplicación', package: 'pieza compartida', service: 'servicio' },
    // What a part is, by its first tag (folderTags.js)
    parts: {
      ui: 'Lo que la gente ve y toca: pantallas, botones y estilos.',
      scene3d: 'Lo que se dibuja en 3D.',
      logic: 'Las reglas: lo que pasa cuando alguien hace algo.',
      agent: 'Lo que habla con la inteligencia artificial.',
      desktop: 'La app de escritorio: la ventana y el acceso a la computadora.',
      server: 'El servidor: recibe pedidos y responde.',
      data: 'Donde se guarda y se ordena la información.',
      other: 'Una parte del proyecto.',
    },
    // Text when no agent narrates (or what it did not write). ctx comes from tourSpec.js
    script: {
      place: {
        title: 'Así está armado',
        bubble: '¡Hola! Te muestro el proyecto',
        vibe: {
          monolith: () => 'Es una sola aplicación: todo vive junto y se arranca de una vez. Eso la hace fácil de seguir.',
          monorepo: ({ count }) => `Es un monorepo: ${count} partes que viven en el mismo lugar y comparten piezas entre sí.`,
          services: ({ count }) => `Son ${count} servicios separados que trabajan juntos; cada uno se arranca por su cuenta.`,
          library: () => 'Es una librería: código pensado para que otras aplicaciones lo usen.',
          unknown: () => 'No encontré una forma conocida, así que te muestro lo más importante que hay.',
          empty: () => 'Este proyecto todavía está vacío.',
        },
        dev: {
          monolith: ({ stack, run }) => `Monolito${stack ? ` (${stack})` : ''}: una sola app${run ? `; se arranca con «${run}»` : ''}.`,
          monorepo: ({ count, units, manager }) => `Monorepo${manager ? ` con ${manager}` : ''}: ${count} paquetes (${units}).`,
          services: ({ count, units }) => `${count} servicios independientes: ${units}.`,
          library: ({ stack }) => `Librería${stack ? ` (${stack})` : ''}: exporta código, no tiene servidor propio.`,
          unknown: () => 'Sin una estructura conocida: recorro las carpetas principales.',
          empty: () => 'Proyecto vacío.',
        },
      },
      readme: {
        title: 'Empieza por el README',
        bubble: 'Aquí está la portada',
        say: ({ sections }) => `Es la portada del proyecto: dice qué hace y cómo arrancarlo.${sections ? ` Tiene secciones como ${sections}.` : ''}`,
      },
      guide: {
        title: ({ name }) => `Guía: ${name}`,
        bubble: 'Aquí explican cómo pensaron todo',
        say: () => 'El equipo escribió aquí cómo está pensado el proyecto. Vale la pena leerla después del README.',
      },
      part: {
        title: ({ name }) => name,
        bubble: ({ label }) => label,
        vibe: ({ what }) => what,
        dev: ({ what, path, kind }) => `${kind ? `${kind[0].toUpperCase()}${kind.slice(1)}` : 'Carpeta'} ${path}/: ${what.charAt(0).toLowerCase()}${what.slice(1)}`,
      },
      entry: {
        title: 'Aquí arranca todo',
        bubble: 'Esta es la puerta de entrada',
        vibe: ({ name }) => `«${name}» es lo primero que se ejecuta: desde aquí se enciende el resto.`,
        dev: ({ path, why }) => `Punto de entrada: ${path}${why ? ` (${why})` : ''}.`,
        why: { pkgMain: 'según package.json', pkgBin: 'comando de package.json', framework: 'página principal', name: 'por su nombre' },
      },
      tests: {
        title: 'Las pruebas',
        bubble: 'Esto revisa que nada se rompa',
        say: ({ count, runner }) => `${count === 1 ? 'Hay 1 prueba' : `Hay ${count} pruebas`} que revisan solas que todo funcione${runner ? ` (se corren con ${runner})` : ''}. Si cambias algo, córrelas.`,
      },
      usecase: {
        title: ({ label }) => `Caso de uso: ${label}`,
        bubble: ({ label }) => `Así funciona «${label}»`,
        say: ({ label, path, from }) => `${{ route: 'Cuando alguien pide', page: 'Cuando alguien abre la página de', command: 'Cuando alguien ejecuta' }[from] ?? 'Para'} «${label}», todo empieza en ${path}.`,
      },
      start: {
        title: 'Por dónde empezar',
        bubble: '¡Listo! Empieza por aquí',
        say: ({ doc, entry }) => [doc && `Lee primero ${doc}`, entry && `luego abre ${entry}`].filter(Boolean).join(' y ').replace(/^./, (c) => c.toUpperCase())
          .concat(doc || entry ? '. ' : '', 'Cuando algo no se entienda, pregúntame: te lo explico con tus palabras.'),
      },
      emptyStart: 'Cuando tenga archivos, vuelve a pedirme el recorrido.',
    },
  },

  shell: {
    brand: 'Qubbot',
    search: 'Buscar o hacer algo…',
    searchShortcut: '⌘K',
    closePanel: 'Cerrar el panel',
    menus: { file: 'Proyecto' },
    actions: {
      newProject: 'Nuevo proyecto',
      openProject: 'Abrir proyecto',
      closeProject: 'Cerrar proyecto',
      openRecent: 'Abrir reciente',
      noRecent: 'Sin proyectos recientes',
    },
    rail: { explorer: 'Explorador', risks: 'Riesgos', repairs: 'Reparaciones', servers: 'Servidores', agent: 'Conecta tu agente', map: 'Mapa 3D', git: 'Ramas de git', chat: 'Agente' },
    // Shown when hovering a rail button or a tab
    railInfo: {
      explorer: 'Las partes de tu proyecto con etiquetas y su semáforo.',
      risks: 'Lo que está en rojo o amarillo. Desde aquí Qubi lo repara.',
      repairs: 'Historial de lo que se reparó, lo que falta verificar y lo que falló.',
      servers: 'Lo que está escuchando en un puerto de tu computadora, y si tu red lo puede ver.',
      agent: 'Elige qué IA responde y conéctala desde tu editor.',
      map: 'Tu proyecto en 3D: lo que tiene problemas brilla en ámbar o rojo.',
      git: 'Tus ramas y commits, y si algún commit subió un secreto.',
      chat: 'Habla con el agente en palabras sencillas.',
    },
    tabInfo: {
      map: (folders, atRisk) => `${folders} carpetas · ${atRisk ? `${atRisk} en riesgo` : 'sin riesgos'}`,
    },
    recent: 'Recientes',
    explorerGuide: 'Guía de tu proyecto: qué hay en cada parte.',
    allFiles: 'Archivos sueltos',
    sidebar: {
      explorer: 'Explorador',
      risks: 'Riesgos',
      repairs: 'Reparaciones',
      servers: 'Servidores',
      agent: 'Conecta tu agente',
      supabase: 'Supabase',
      noProject: 'Abre un proyecto para ver sus carpetas.',
      noRisks: 'Ningún archivo en rojo o amarillo. ¡Bien!',
      risksSummary: (red, yellow) => `${red} en riesgo · ${yellow} por revisar`,
      openFolder: (name) => `Abrir ${name} en el mapa`,
    },
    // The security audit in the risks panel (docs/features/seguridad/README.md)
    audit: {
      label: 'Seguridad',
      again: 'Auditar de nuevo',
      auditing: 'Auditando…',
      never: 'Sin auditar todavía',
      when: (ago) => `Auditado ${ago}`,
      error: 'No pude auditar el proyecto. Prueba otra vez.',
      history: 'Cómo ha cambiado',
      causes: { open: 'Al abrir', audit: 'Auditoría', change: 'Cambio de archivos', repair: 'Reparación', accept: 'Revisado por ti' },
      lastChange: ({ before, after, fixed, worse }) => {
        const parts = [];
        if (fixed.length) parts.push(`${fixed.length} ${fixed.length === 1 ? 'arreglado' : 'arreglados'}`);
        if (worse.length) parts.push(`${worse.length} ${worse.length === 1 ? 'problema nuevo' : 'problemas nuevos'}`);
        const moved = before != null && before !== after ? `${before}% → ${after}%` : `${after}%`;
        return `Última auditoría: ${moved}${parts.length ? ` · ${parts.join(' · ')}` : ' · sin cambios'}`;
      },
      accept: 'Marcar como revisado',
      acceptTitle: 'Lo revisé y está bien así. Si el archivo cambia, se vuelve a revisar.',
    },
    // Servers listening on this computer (spec/001-running-servers.md)
    servers: {
      intro: 'Programas de tu computadora que esperan conexiones en un puerto. Se actualiza solo cada pocos segundos.',
      loading: 'Buscando servidores…',
      empty: 'No hay ningún servidor escuchando ahora.',
      error: 'No pude leer la lista de servidores.',
      summary: (total, exposed) => `${total === 1 ? '1 servidor' : `${total} servidores`} · ${exposed ? `${exposed} visibles en tu red` : 'ninguno visible en tu red'}`,
      local: 'Solo esta computadora',
      network: 'Visible en tu red',
      unknownProcess: 'Proceso desconocido',
      exposedReason: 'Cualquier equipo de tu red WiFi puede abrir este servidor. Si no hace falta, arráncalo solo en localhost (127.0.0.1).',
      exposedReasonTech: (address) => `Escucha en ${address || 'todas las interfaces'}: accesible desde la red local. Arráncalo con host 127.0.0.1 si no necesitas acceso desde otros equipos.`,
      open: 'Abrir',
      openTitle: (port) => `Abrir http://localhost:${port} en un navegador`,
      openWith: 'Abrir con',
      openDefault: 'Navegador predeterminado',
      openOther: 'Elegir otra app…',
      more: (port) => `Más opciones del puerto ${port}`,
      stop: 'Detener…',
      stopTitle: (port) => `Detener el servidor del puerto ${port} (te pide confirmación)`,
      stopped: (port) => `Listo: se detuvo el servidor del puerto ${port}.`,
      pause: 'Pausar',
      resume: 'Reanudar',
      resumeTitle: (port) => `Reanudar el servidor del puerto ${port}`,
      pausedChip: 'En pausa',
      pausedReason: 'Está congelado: no responde hasta que lo reanudes, y el puerto sigue ocupado.',
      paused: (port) => `El servidor del puerto ${port} quedó en pausa. Qubbot lo reanuda si se cierra.`,
      resumed: (port) => `El servidor del puerto ${port} volvió a correr.`,
      stoppedTitle: 'Detenidos desde Qubbot',
      stoppedChip: 'Detenido',
      stoppedAt: (time) => `a las ${time}`,
      restart: 'Reactivar…',
      restartTitle: (port) => `Reactivar el servidor del puerto ${port} dentro de Qubbot (te pide confirmación)`,
      restarted: (port) => `Iniciando el servidor del puerto ${port} dentro de Qubbot…`,
      managedChip: 'En Qubbot',
      managedTitle: 'Lo inició Qubbot: corre dentro de la app y se detiene al cerrarla. Su salida está en ⋯ › Ver salida.',
      showOutput: 'Ver salida',
      closeOutput: 'Cerrar la salida',
      noOutput: 'Todavía no escribió nada.',
      outputLabel: (port) => `Salida del servidor del puerto ${port}`,
      startingChip: 'Iniciando…',
      startingDetail: (port) => `esperando el puerto ${port}`,
      exitedChip: 'Se cerró solo',
      exitedDetail: (code, time) => (code == null ? `a las ${time}` : `código ${code} · a las ${time}`),
      exitedReason: 'Se cerró sin que lo detuvieras. Abre su salida (⋯ › Ver salida) para ver por qué.',
      cancelStart: 'Cancelar inicio',
      cancelStartTitle: (port) => `Cancelar el inicio del servidor del puerto ${port}`,
      cannotRestart: 'No se puede reactivar desde aquí: vuelve a arrancarlo desde tu terminal.',
      forget: 'Quitar de la lista',
      working: 'Esperando…',
      actionFailed: 'No se pudo completar la acción.',
      dismiss: 'Cerrar aviso',
      demo: 'Ejemplo',
      demoNote: 'Estos servidores son de ejemplo. En la app de escritorio ves los de tu computadora.',
    },
    status: {
      noProject: 'Sin proyecto',
      counts: (red, yellow, green) => `${red} en riesgo · ${yellow} por revisar · ${green} seguros`,
      agent: 'Agente en línea',
    },
  },

  // View switcher on the map
  stageTabs: { map: 'Mapa', git: 'Git' },

  chat: {
    agentName: 'Agente Qubbot',
    online: 'En línea',
    placeholder: 'Pregúntale al agente… (Enter envía, Shift+Enter salta línea)',
    placeholders: {
      vibe: 'Cuéntame qué necesitas, con tus palabras…',
      tech: 'Pregunta técnica: rutas, código, configuración… (Enter envía)',
    },
    // How the agent talks (agent/voice.json + agent/skills/)
    // Chat header: the connected agent's name, its model and effort (formal), or the demo / simulator
    header: {
      demo: { name: 'Agente de demostración', detail: 'Sin IA · respuestas de ejemplo' },
      sim: { name: 'Simulador', detail: 'Escenarios de prueba' },
      planModel: 'Modelo de tu plan',
      efforts: { low: 'Esfuerzo bajo', medium: 'Esfuerzo medio', high: 'Esfuerzo alto', xhigh: 'Esfuerzo muy alto', max: 'Esfuerzo máximo' },
    },
    voice: {
      label: 'Cómo te habla el agente',
      names: { vibe: 'Vibe', tech: 'Dev' },
      hints: {
        vibe: 'Vibe: palabras simples, comparaciones de la vida diaria y sin jerga.',
        tech: 'Dev: detalle técnico, rutas y fragmentos de código cortos.',
      },
      // Hover labels: what the button does, shown above it
      tips: {
        vibe: 'Vibe · te hablo simple, sin código',
        tech: 'Dev · te hablo técnico, con rutas y código',
      },
    },
    // "Mejorar mi mensaje" and the help while typing (renderer/viewmodels/composerViewModel.js)
    assist: {
      improve: 'Mejorar mi mensaje',
      improveTip: 'Mejorar mi mensaje · lo ordeno en pasos con su prueba para que el agente entienda qué quieres',
      improving: 'Ordenando tu mensaje…',
      undo: 'Deshacer',
      notices: {
        agent: 'Ordené tu mensaje en pasos, con la prueba primero. Revísalo y envíalo.',
        local: 'Lo ordené aquí mismo (sin el agente). Revísalo y envíalo.',
        empty: 'Escribe primero qué quieres; luego lo ordeno.',
      },
      hints: {
        short: 'Cuéntame un poco más: qué quieres que pase y dónde.',
        noTarget: (name) => (name ? `¿Te refieres a ${name}? Tócalo para agregarlo.` : 'Dime qué archivo: escribe @ y su nombre.'),
        secret: 'Parece una clave o contraseña. No la pegues aquí: dime solo dónde está.',
      },
      completionsLabel: 'Sugerencias para tu mensaje (Tab para elegir)',
      // Words that ask for an action on a file (to notice when the file is missing)
      actionWords: ['repara', 'arregla', 'corrige', 'revisa', 'audita', 'analiza', 'mira', 'cambia', 'mejora', 'explica', 'explícame', 'protege'],
      // The spec the message becomes, as the agent reads it (headings per mode)
      spec: {
        vibe: { objective: 'Qué quiero', problem: 'Por qué', scope: 'Dónde', constraints: 'Qué no tocar', tasks: 'Pasos', accept: 'Listo cuando', test: 'Primero la prueba', red: 'Antes (debe fallar)', green: 'Después (debe pasar)', refactor: 'Al final' },
        dev: { objective: 'Objetivo', problem: 'Problema', scope: 'Alcance', constraints: 'Restricciones', tasks: 'Tareas', accept: 'Acepta', test: 'TDD (RED → GREEN → REFACTOR)', red: 'RED', green: 'GREEN', refactor: 'REFACTOR' },
      },
      // Spec made here when no agent is connected
      local: {
        tasks: (target) => [
          { do: `Escribir una prueba que muestre el problema${target ? ` en ${target}` : ''}`, accept: 'La prueba falla antes del cambio' },
          { do: `Hacer el cambio más pequeño${target ? ` en ${target}` : ''} para que la prueba pase`, accept: 'La prueba pasa y las demás siguen pasando' },
          { do: 'Ordenar el código sin cambiar lo que hace', accept: 'Todas las pruebas siguen pasando' },
        ],
        red: 'Una prueba que hoy falla y muestra el problema',
        green: 'La misma prueba pasa con el cambio',
        refactor: 'El código queda ordenado y todas las pruebas pasan',
        constraints: ['No mostrar ni copiar claves o contraseñas', 'Cambiar solo lo necesario'],
      },
    },
    // What the orb in the agent's avatar says it is doing (screen readers)
    orbLabels: {
      thinking: 'Pensando…',
      writing: 'Escribiendo la respuesta…',
      working: 'Trabajando…',
      get_project: 'Mirando tu proyecto…',
      list_risks: 'Revisando los riesgos…',
      read_file: 'Leyendo un archivo…',
      write_file: 'Guardando un arreglo…',
      set_file_score: 'Actualizando el semáforo…',
      show_folder: 'Buscando la carpeta en el mapa…',
      run_command: 'Ejecutando un comando…',
      delete_file: 'Borrando un archivo…',
      subagent: 'Coordinando ayudantes…',
      repair: 'Arreglando un archivo…',
      improve: 'Ordenando tu mensaje…',
      connect: 'Probando la conexión…',
      approval: 'Esperando tu aprobación…',
    },
    thinking: 'Pensando…',
    // a long answer continues below what is on screen
    moreBelow: 'Ver el final ↓',
    reasoning: 'Cómo lo pensó',
    // Titles of the agent's cards when it gives none ("> [!riesgo]" ...)
    callouts: { danger: 'Riesgo', ok: 'Está bien', idea: 'Idea', step: 'Tu siguiente paso', info: 'Nota' },
    pin: 'Fijar el chat: el mapa le deja su espacio',
    unpin: 'Soltar el chat: vuelve a flotar sobre el mapa',
    resize: 'Arrastra para cambiar el ancho del chat',
    run: {
      tools: {
        get_project: 'Ver el proyecto',
        list_risks: 'Revisar los riesgos',
        read_file: 'Leer un archivo',
        write_file: 'Guardar un arreglo',
        set_file_score: 'Cambiar el semáforo',
        show_folder: 'Mostrar en el mapa',
        run_command: 'Ejecutar un comando',
        delete_file: 'Borrar un archivo',
      },
      tool: 'Usar una herramienta',
      subagent: (kind) => (kind ? `Subagente · ${kind}` : 'Subagente'),
      summary: (steps, subagents) => `${steps === 1 ? '1 paso' : `${steps} pasos`}${subagents ? ` · ${subagents === 1 ? '1 subagente' : `${subagents} subagentes`}` : ''}`,
      working: 'Trabajando…',
      queued: 'Esperando turno…',
      agentTitle: 'Agente',
      done: 'Listo',
      failed: 'Con error',
      seconds: (ms) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`),
      foot: ({ durationMs, turns, inputTokens, outputTokens }, format) =>
        `${format(durationMs)} · ${turns === 1 ? '1 turno' : `${turns} turnos`} · ${(inputTokens + outputTokens).toLocaleString('es')} tokens`,
      output: 'Lo que respondió',
      // A file change shown live on its step (electron/lineDiff.js)
      diff: {
        proposed: 'Cambio propuesto',
        applied: 'Cambio aplicado',
        rejected: 'No aprobado',
        created: 'Archivo nuevo',
        counts: (added, removed) => `+${added} −${removed}`,
        more: 'Hay más cambios: abre el archivo para verlos completos.',
      },
    },
    // Modo Vibe: what the agent does, told as short sentences (renderer/models/runStory.js)
    story: {
      running: {
        get_project: () => 'Mirando tu proyecto…',
        list_risks: () => 'Buscando lo que está en riesgo…',
        read_file: (n) => `Leyendo ${n}…`,
        write_file: (n) => `Guardando el arreglo en ${n}…`,
        set_file_score: (n) => `Poniendo el semáforo de ${n}…`,
        show_folder: (n) => `Abriendo ${n} en el mapa…`,
        run_command: (n) => `Ejecutando ${n}…`,
        delete_file: (n) => `Borrando ${n}…`,
      },
      done: {
        get_project: () => 'Miré tu proyecto',
        list_risks: () => 'Revisé lo que está en riesgo',
        read_file: (n) => `Leí ${n}`,
        write_file: (n) => `Guardé el arreglo en ${n}`,
        set_file_score: (n, color) => (color ? `Marqué ${n} en ${color}` : `Puse el semáforo de ${n}`),
        show_folder: (n) => `Te mostré ${n} en el mapa`,
        run_command: (n) => `Ejecuté ${n}`,
        delete_file: (n) => `Borré ${n} (hay copia)`,
      },
      // write_file of a file that did not exist
      created: (n) => `Creé ${n}`,
      // What the step was, for "No pude terminar: …"
      what: {
        get_project: () => 'mirar el proyecto',
        list_risks: () => 'revisar los riesgos',
        read_file: (n) => `leer ${n}`,
        write_file: (n) => `guardar ${n}`,
        set_file_score: (n) => `poner el semáforo de ${n}`,
        show_folder: (n) => `mostrar ${n}`,
        run_command: (n) => `ejecutar ${n}`,
        delete_file: (n) => `borrar ${n}`,
      },
      failed: (what) => `No pude terminar: ${what}`,
      skipped: (what) => `No cambié nada (${what}): solo me pediste entender`,
      unknown: { running: 'Usando una herramienta de Qubbot…', done: 'Usé una herramienta de Qubbot', what: 'un paso' },
      helper: (description) => `Un ayudante: ${description}`,
      aFile: 'un archivo',
      theProject: 'tu proyecto',
      levels: { green: 'verde', yellow: 'amarillo', red: 'rojo' },
      thinking: 'Pensando qué hacer…',
      writing: 'Escribiendo la respuesta…',
      awaiting: (name) => `Esperando tu aprobación para guardar ${name}…`,
      recap: { files: (n) => `Leí ${n === 1 ? '1 archivo' : `${n} archivos`}`, level: (n, color) => `${n} en ${color}`, fixes: (n) => `guardé ${n === 1 ? '1 arreglo' : `${n} arreglos`}`, created: (n) => `creé ${n === 1 ? '1 archivo' : `${n} archivos`}`, steps: (n) => (n === 1 ? '1 paso' : `${n} pasos`) },
      doneIn: (time) => `Listo en ${time}`,
      failedRun: 'No pudo terminar',
      // The same change, in plain words
      diff: {
        proposed: 'Lo que va a cambiar',
        applied: 'Ver lo que cambió',
        rejected: 'No se guardó',
        counts: (added, removed) => `${added === 1 ? '1 línea nueva' : `${added} líneas nuevas`} · ${removed === 1 ? '1 quitada' : `${removed} quitadas`}`,
      },
    },
    welcomeTitle: (project) => `¿Qué hacemos con ${project}?`,
    welcomeNoProject: '¿Qué hacemos hoy?',
    welcomeBody: 'Cuéntame tu idea o pídeme que revise tu proyecto. Te digo qué estoy haciendo y te explico cada problema con palabras simples.',
    prompts: ['Revisa mi proyecto y dime qué está en riesgo', 'Explícame el mapa con palabras simples', '¿Qué archivo debería arreglar primero?'],
    // Shown above the box to start writing right away (they fill the box, the person can edit and send)
    followUps: {
      vibe: ['¿Mi app es segura?', 'Explícamelo más simple', '¿Qué hago ahora?', '¿Qué archivo arreglo primero?', '¿Por qué esto es un riesgo?'],
      tech: ['Revisa los archivos en rojo', 'Audita este proyecto a fondo', '¿Qué secretos están expuestos?', 'Revisa la autenticación', 'Propón el arreglo con código'],
    },
    followUpsTitle: 'Sugerencias para escribir',
    auditPrompt: (path, reason) => `Audita \`${path}\`.${reason ? ` El mapa lo marca así: "${reason}".` : ''} Léelo y dime si el riesgo es real o una falsa alarma, por qué, y qué haría para arreglarlo. Si no es un riesgo, ponlo en verde en el semáforo.`,
    notInProject: (path) => `No encuentro "${path}" en este proyecto.`,
    // Next steps the agent suggests (chips under its answer)
    suggest: {
      repair: (name) => `Reparar ${name}`,
      audit: (name) => `Auditar ${name}`,
      locate: (name) => `Ver ${name} en el mapa`,
      open: (name) => `Abrir ${name}`,
    },
    // Map events shown as cards in the chat
    cards: {
      files: (n) => (n === 1 ? '1 archivo' : `${n} archivos`),
      folders: (n) => (n === 1 ? '1 subcarpeta' : `${n} subcarpetas`),
      levels: { red: 'en riesgo', yellow: 'a revisar', green: 'seguros' },
      folderHint: 'No tiene problemas. Su contenido está junto a la carpeta en el mapa.',
      folderHintRisk: 'Lo que brilla en ámbar o rojo tiene problemas. Está junto a la carpeta en el mapa: toca un archivo para ver el motivo.',
      folderEmpty: 'Todavía no tiene archivos.',
      seeRisks: 'Ver los riesgos',
      explainFolder: 'Explícame esta carpeta',
      explainFolderPrompt: (name) => `Explícame qué hay en la carpeta \`${name.replace(/\/$/, '')}\` y para qué sirve, con palabras simples.`,
      whatIsIt: '¿Qué es este archivo?',
      whatIsItPrompt: (path) => `¿Qué es \`${path}\` y para qué sirve en mi proyecto? Explícamelo con palabras simples.`,
      openBrowser: 'Abrir en el navegador',
      notReviewed: 'Nadie lo ha revisado todavía. Puedo revisarlo si quieres.',
      // Modo Vibe: what a file is, in plain words (renderer/models/fileOpen.js -> fileKind)
      kinds: {
        page: 'Una página web: lo que ve la gente al abrirla',
        styles: 'Colores, tamaños y formas de la pantalla',
        code: 'Instrucciones que hacen funcionar tu app',
        test: 'Una prueba que revisa que nada se rompa',
        settings: 'Ajustes de cómo se instala o se publica tu app',
        data: 'Datos guardados en una lista o tabla',
        text: 'Un texto con explicaciones',
        image: 'Una imagen',
        document: 'Un documento',
        script: 'Pasos que la computadora ejecuta sola',
        secret: 'Guarda claves o contraseñas',
        other: 'Un archivo del proyecto',
      },
      where: (place) => `En «${place}»`,
      short: { open: 'Abrir', ask: 'Explícamelo', audit: 'Revisar', repair: 'Reparar', locate: 'En el mapa' },
      reviewIt: 'Revisar este archivo',
      reveal: 'Mostrar en la carpeta',
      onMap: 'Ver en el mapa',
      openFailed: 'No pude abrir el archivo.',
      // The first lines of a file opened from the chat
      preview: {
        loading: 'Leyendo el archivo…',
        secret: 'Este archivo guarda claves o contraseñas: no lo muestro en el chat.',
        binary: 'Es una imagen u otro archivo que no es texto.',
        error: 'No pude leer el archivo.',
        more: (n) => (n === 1 ? '1 línea más' : `${n} líneas más`),
        label: (name) => `Primeras líneas de ${name}`,
      },
      changes: (n) => (n === 1 ? 'Se guardó un cambio' : `Se guardaron cambios en ${n} archivos`),
      changesMore: (n) => `y ${n} más`,
      audit: 'Auditar en el chat',
      source: 'Quién lo marcó',
    },
    more: 'Más opciones',
    menu: {
      open: 'Abrir el chat',
      connect: 'Conecta tu agente',
      editor: 'Conectar tu editor (MCP)',
      repairWorst: 'Reparar el riesgo más grave',
      history: 'Historial de reparaciones',
      mode: (tech) => (tech ? 'Hablar en modo Vibe' : 'Hablar en modo Dev'),
      newChat: 'Nueva conversación',
      // The redesigned menu: a header with the state, tiles with an icon, a foot
      working: 'Trabajando…',
      allGreen: 'Todo en verde',
      risk: (n) => `${n} en riesgo`,
      review: (n) => `${n} por revisar`,
      agentless: 'Agente de demostración',
      repairFile: (name) => `Reparar ${name}`,
      historyShort: 'Reparaciones',
      connectAgents: 'Conectar agentes',
      openShort: 'Abrir',
      modeShort: (tech) => (tech ? 'Modo Vibe' : 'Modo Dev'),
      trust: 'Confiar en esta carpeta',
      untrust: 'Dejar de confiar en esta carpeta',
    },
    connectors: 'Conexiones: conecta tu IA o tu editor',
    pickerTitle: 'Quién responde',
    pickerMore: 'Conectar desde tu editor…',
    // The agent menu of the composer (renderer/views/ui/agentPickerView.js)
    picker: {
      agent: 'Agente',
      demo: 'Demostración',
      demoNote: 'Sin IA',
      viaLogin: 'Con tu suscripción',
      viaKey: (last4) => `Con clave de API ··${last4}`,
      notConnected: 'Sin conectar',
      unknown: 'Por comprobar',
      connect: 'Conectar',
      connectHint: 'Conectar con tu suscripción o con una clave de API',
      login: 'Iniciar sesión con mi cuenta',
      useKey: 'Usar una clave de API',
      replaceKey: 'Cambiar la clave de API',
      removeKey: 'Quitar la clave guardada',
      keyLabel: (name) => `Clave de API de ${name}`,
      keyPlaceholder: { claude: 'Pega tu clave (sk-ant-…)', codex: 'Pega tu clave (sk-…)', grok: 'Pega tu clave (xai-…)' },
      saveKey: 'Guardar',
      keyNote: 'Se guarda cifrada en tu computadora y no se vuelve a mostrar.',
      keyErrors: {
        shape: 'Esa clave no tiene el formato de este servicio. Revisa que la copiaste completa.',
        'no-keychain': 'Tu sistema no permite guardarla cifrada; no la guardé.',
        unknown: 'Este agente no acepta claves de API.',
        failed: 'No pude guardar la clave.',
      },
      more: 'Más opciones',
      moreHint: (model, effort) => `${model} · ${effort}`,
      hub: 'Más formas de conectar…',
      others: 'Otros agentes',
      moreAgents: (n) => `Ver más agentes · ${n}`,
      external: { cursor: 'Cursor', kimi: 'Kimi', gemini: 'Gemini', qwen: 'Qwen Code', opencode: 'OpenCode' },
      fromApp: 'Desde su app',
      how: (file) => `Trabaja desde su propia app, usando solo las herramientas de Qubbot. Pega esto en ${file}:`,
      installHint: 'Si no lo tienes, instálalo con:',
      mcpOff: 'Abre un proyecto para poder conectarlo.',
      copy: 'Copiar',
      copied: 'Copiado',
      opencodeKeys: 'Usa la clave que guardes en Claude, ChatGPT o Grok.',
    },
    // Agent permissions (renderer/models/approvalModel.js, rules in electron/approval.js)
    permissions: {
      label: 'Permisos del agente',
      names: { manual: 'Manual', auto: 'Auto', bypass: 'Sin preguntar' },
      notes: {
        manual: 'Te pregunto antes de guardar cada cambio.',
        auto: 'Guardo solo los cambios simples. Te pregunto los delicados: instalación, publicación, scripts o borrar casi todo un archivo.',
        bypass: 'Guardo todo sin preguntarte. Siempre queda una copia para deshacer y nunca toco claves.',
      },
      status: (name) => `Cambios: ${name}`,
    },
    demo: 'Demo',
    inputLabel: 'Mensaje',
    send: 'Enviar',
    minimize: 'Minimizar',
    expand: 'Abrir',
    ariaLabel: 'Chat con el agente',
    toolUsed: (name) => ({
      get_project: 'Mirando tu proyecto…',
      list_risks: 'Revisando los archivos en riesgo…',
      read_file: 'Leyendo un archivo…',
      set_file_score: 'Actualizando el semáforo en el mapa…',
      show_folder: 'Mostrándote una carpeta en el mapa…',
    })[String(name).replace(/^(?:mcp__)?platanus(?:__|_)?(?:platanus_)?/, '')] ?? 'Usando una herramienta…',

    greeting: '¡Hola! 👋 Soy el agente de seguridad. Abre un proyecto para empezar.',
    projectReady: 'Listo, ya veo tu proyecto en el mapa. ¿Qué hacemos?',
    projectOpened: (name) => `Proyecto abierto: ${name}`,
    projectClosed: (name) => `Proyecto cerrado: ${name}`,
    // Sent to the agent before a question asked while the robot is on a place (the person does not see it)
    contextNote: ({ title, path }) => `(La persona tiene al robot de Qubbot en ${path ? `«${path}» (${title})` : `la plaza del proyecto «${title}»`}; si dice "aquí", se refiere a ese lugar.)`,
    // Sent to the agent before a question to understand (the person does not see it)
    explainNote: '(La persona solo quiere entender: explícalo con palabras simples. No cambies archivos ni propongas reparaciones, salvo que lo pida.)',
    // The place on top of the chat, on the question and on its answer
    focus: { label: 'El robot está en', about: 'Sobre', close: 'Dejar de hablar de este lugar', project: 'Todo el proyecto' },
    projectCreated: (name) => `Listo, creé «${name}» y está vacío 🌱\nCuéntame qué quieres construir y lo armamos juntos, de forma segura desde el primer archivo.`,
    projectCreateFailed: (error) => `No pude crear el proyecto: ${error}`,
    diskChanged: (paths) => `Cambios en disco: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? ` y ${paths.length - 3} más` : ''}`,

    chips: {
      openFolder: 'Abrir carpeta',
      suggestions: ['Escanear edificio', 'Ver accesos', 'Simular ataque'],
      vulnerability: ['Ver detalles', 'Corregir ahora'],
      fixNow: 'Corregir ahora',
    },

    folderOpened: ({ name, files: fileCount, folders: folderCount, counts }) => {
      const head = `📂 ${name} · ${files(fileCount)} · ${plural(folderCount, 'subcarpeta', 'subcarpetas')}`;
      if (!fileCount) return `${head}\n\nTodavía no tiene archivos.`;
      const summary = `🔴 ${counts.red} en riesgo · 🟡 ${counts.yellow} a revisar · 🟢 ${counts.green} seguros`;
      const hint = counts.red + counts.yellow
        ? 'Su contenido está junto a la carpeta en el mapa: lo que brilla tiene problemas. Haz clic en un archivo para ver el motivo.'
        : 'No tiene problemas. Su contenido está junto a la carpeta en el mapa.';
      return `${head}\n${summary}\n\n${hint}`;
    },
    fileSelected: ({ path, levelText, reason, source }) => `📄 ${path}\n${levelText} · ${reason}\n\n${source}`,
    tableExposed: (name, exposed) =>
      `<strong>⚠ Tabla ${name}: RLS desactivado</strong>\nColumnas expuestas: ${exposed}.\nCualquiera con la anon key puede leerlas.`,
    tableOk: (name, columnCount, keys) => `Tabla ${name} ✅\n${columnCount} columnas · claves: ${keys}\nRLS activo, sin problemas.`,
  },

  // Scripted agent (demo). Keywords are matched against the start of each word.
  connect: {
    title: 'Conecta tu agente',
    rail: 'Conecta tu agente',
    intro: 'Usa tu propia suscripción de IA. Qubbot no ve tus contraseñas ni claves: cada programa inicia sesión por su cuenta.',
    subscriptions: 'Tus suscripciones',
    none: 'No encontré Claude Code, Grok ni Codex instalados en esta computadora.',
    desktopOnly: 'Disponible en la app de escritorio.',
    scripted: 'Agente de demostración (sin IA)',
    use: 'Usar',
    inUse: 'En uso',
    login: 'Entrar',
    loggedIn: 'sesión iniciada',
    loggedOut: 'sin sesión',
    unknownLogin: 'sesión por comprobar',
    model: 'Modelo',
    planDefault: 'El de tu plan',
    effort: 'Cuánto piensa',
    efforts: { low: 'Rápido', medium: 'Equilibrado', high: 'Profundo', xhigh: 'Muy profundo', max: 'Máximo' },
    modelNotes: {
      plan: 'El que elige tu plan',
      best: 'El más capaz',
      deep: 'Profundo y preciso',
      balanced: 'Rápido y capaz',
      fast: 'El más rápido',
      newest: 'El más nuevo',
      fastPricey: 'Más rápido, gasta más',
      previous: 'Versión anterior',
    },
    effortHints: {
      low: 'Responde al instante. Ideal para preguntas cortas.',
      medium: 'Piensa un poco más antes de responder.',
      high: 'Revisa con calma: mejor para auditar.',
      xhigh: 'Análisis a fondo; tarda más.',
      max: 'Todo el razonamiento disponible. Lento y más caro para tu plan.',
    },
    fromEditor: 'Conéctalo desde tu editor',
    fromEditorIntro: 'Copia esto en tu herramienta para que trabaje con el mapa de Qubbot mientras la app está abierta.',
    mcpOff: 'El servidor local todavía no está listo.',
    mcpOn: (url) => `Servidor local: ${url}`,
    mcpPrivate: 'La dirección lleva una llave privada (oculta aquí). "Copiar" la incluye: no la compartas.',
    copy: 'Copiar',
    copied: 'Copiado',
    snippets: {
      claude: 'Claude Code (terminal)',
      cursor: 'Cursor (.cursor/mcp.json)',
      codex: 'Codex (~/.codex/config.toml)',
      gemini: 'Gemini CLI (~/.gemini/settings.json)',
      kimi: 'Kimi Code (~/.kimi-code/mcp.json)',
      qwen: 'Qwen Code (~/.qwen/settings.json)',
      opencode: 'OpenCode (opencode.json)',
    },
  },

  // "Conecta tu agente" panel: agents, comparing answers, the local MCP server and its activity
  hub: {
    agents: 'Tus agentes',
    version: (v) => (v ? `v${v.replace(/^v/, '')}` : ''),
    path: 'Ruta',
    test: 'Probar',
    testing: 'Probando…',
    testOk: (ms) => `Responde en ${(ms / 1000).toFixed(1)} s`,
    testFailed: 'No respondió',
    testHint: 'Envía un mensaje mínimo (usa unos pocos tokens de tu plan).',
    stats: ({ runs, tokens, lastUsedAt }) => {
      const t = tokens >= 1000 ? `${Math.round(tokens / 1000)} mil tokens` : `${tokens} tokens`;
      const when = lastUsedAt ? ` · ${strings.hub.ago(Date.now() - lastUsedAt)}` : '';
      return `${runs === 1 ? '1 respuesta' : `${runs} respuestas`} · ${t}${when}`;
    },
    never: 'Todavía no lo usaste',
    lastError: 'Último error',
    current: (model, effort) => `${model} · ${effort}`,
    compare: 'Comparar respuestas',
    compareIntro: 'Pregunta a dos agentes a la vez y compara lo que responden.',
    compareNone: 'Solo uno',
    server: 'Servidor local (MCP)',
    running: 'Encendido',
    stopped: 'Apagado',
    tools: 'Herramientas que ofrece',
    toolInfo: {
      get_project: 'Ve las carpetas y archivos del proyecto abierto.',
      list_risks: 'Lista los archivos en rojo o amarillo y por qué.',
      read_file: 'Lee un archivo (nunca secretos ni archivos de más de 200 KB).',
      write_file: 'Guarda un arreglo: siempre te pide permiso y guarda copia.',
      set_file_score: 'Cambia el semáforo de un archivo en el mapa.',
      show_folder: 'Te muestra una carpeta en el mapa.',
      run_command: 'Ejecuta un comando de la lista (instalar, probar, compilar…) dentro de tu proyecto; si puede cambiar algo, te pregunta.',
      delete_file: 'Borra un archivo guardando copia; te pregunta antes.',
    },
    activity: 'Actividad reciente',
    activityEmpty: 'Todavía ningún agente usó Qubbot.',
    ago: (ms) => {
      const s = Math.max(1, Math.round(ms / 1000));
      return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`;
    },
    testPrompt: 'Responde solo con la palabra: listo',
    compareLabel: (a, b) => `Comparando ${a} y ${b}`,
  },

  agent: {
    // The chat agent's own instructions live in agent/voice.json and agent/skills/ (not shown to people)
    liveStopped: (why) => `<strong>Tu agente se detuvo antes de terminar.</strong> ${why} Lo que alcanzó a decir queda arriba; puedes volver a preguntar.`,
    liveFailed: (why) => `<strong>No pude hablar con tu agente.</strong> ${why || 'Revisa en "Conecta tu agente" que la sesión esté iniciada.'}`,
    replies: [
      { keys: ['hola', 'buenas', 'hey'], text: '¡Hola! Soy el agente de seguridad del HQ. Puedo escanear el edificio, revisar accesos o explicarte una amenaza.' },
      { keys: ['escan', 'scan', 'revisa'], text: 'Escaneando la torre principal…\n\n✔ 18 ventanas monitoreadas\n✔ Antena: señal estable\n⚠ 1 puerto abierto en el anexo (servidor 2)\n\n¿Quieres que lo cierre?' },
      { keys: ['si', 'sí', 'cierra', 'ok', 'dale'], text: 'Listo, cerré el puerto del servidor 2 y dejé un registro del cambio. El edificio está en verde ✅' },
      { keys: ['acceso', 'login', 'entrada', 'puerta'], text: 'Últimos accesos a la puerta principal:\n• 09:12 — Ana (credencial válida)\n• 09:40 — Bot desconocido (bloqueado)\n• 10:05 — Luis (credencial válida)' },
      { keys: ['inyec', 'prompt', 'jailbreak'], text: 'Un prompt injection es cuando alguien esconde instrucciones dentro de un texto para que el modelo ignore sus reglas. Yo filtro esos mensajes antes de que lleguen al modelo.' },
      { keys: ['amenaza', 'ataque', 'riesgo'], text: 'Ahora mismo veo 0 ataques activos y 3 intentos bloqueados en la última hora. Nivel de riesgo: bajo 🟢' },
      { keys: ['gracias'], text: '¡Con gusto! Aquí sigo vigilando 👀' },
    ],
    fallback: 'Mmm, todavía estoy aprendiendo eso. Prueba con "escanear", "accesos" o "amenazas".',
    // the desktop with no agent connected: an honest answer instead of made-up results
    noAgent: 'Todavía no hay una IA conectada, así que no puedo revisar ni cambiar nada por mi cuenta. Conecta tu agente (Claude, Codex, Grok u OpenCode) y lo hago con datos reales de tu proyecto. Mientras tanto, los comandos de archivos y de git que escribas sí funcionan.',
    connectChip: 'Conectar mi agente',
    keywords: {
      fix: ['correg', 'corrig', 'corrij', 'arregl', 'soluc', 'fix', 'parche'],
      details: ['detalle', 'supabase', 'rls', 'vulnera'],
      attack: ['simula', 'ataca', 'hackea'],
    },
    vulnerability: {
      alert: '<strong>⚠ Vulnerabilidad detectada en Supabase</strong>\nLa tabla <b>users</b> tiene RLS (Row Level Security) desactivado. Cualquiera con la anon key puede leer correos y datos personales.\n\nEstoy viendo datos saliendo del nodo en rojo.\n\nHaz clic en el nodo de Supabase para ver tus tablas.',
      details: 'Detalles del hallazgo:\n• Tabla: public.users\n• Riesgo: CRÍTICO\n• Filas expuestas: 1.284\n• Petición sospechosa: GET /rest/v1/users?select=* desde 185.220.101.7\n\nRecomiendo activar RLS y crear una política para que cada usuario solo lea su propia fila.',
      fix: 'Aplicando corrección…\n\nALTER TABLE users ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "solo_su_fila" ON users\n  FOR SELECT USING (auth.uid() = id);\n\n✅ Listo. Bloqueé la IP sospechosa y el nodo vuelve a estar en verde.',
      nothingToFix: 'No hay nada que corregir ahora mismo, Supabase está en verde 🟢',
      attack: 'Ok, simulo un ataque contra el nodo de Supabase. Mira el mapa 👀',
      needsProject: 'Primero abre un proyecto para poder simular un ataque.',
    },
    files: {
      patterns: {
        openFolder: /^(abr[ei]r?|elegir|elige)\s+(una\s+)?carpeta$/i,
        mkdir: /^crea(r)?\s+(una\s+)?carpeta\s+(.+)$/i,
        write: /^crea(r)?\s+(un\s+)?archivo\s+(\S+)(?:\s+con\s+([\s\S]+))?$/i,
        remove: /^(borra|elimina)(r)?\s+(.+)$/i,
        list: /^(lista(r)?|ver|muestra(me)?)\s+(los\s+)?archivos$|^archivos$/i,
      },
      opened: (name) => `📂 Trabajando en "${name}".\nPrueba: "crea carpeta src" o "crea archivo src/app.js".`,
      notOpened: 'Ok, no abrí ninguna carpeta.',
      created: (path) => `📁 Carpeta creada: ${path}`,
      written: (path) => `📄 Archivo creado: ${path}`,
      removed: (path) => `🗑 Borrado: ${path}`,
      emptyFolder: 'La carpeta está vacía.',
      desktopOnly: 'Eso solo funciona dentro de la app de escritorio (npm start).',
      needsFolder: 'Primero elige una carpeta de trabajo: escribe "abrir carpeta".',
      failed: (error) => `<strong>⛔ No se pudo</strong>\n${error}`,
    },
    // Git commands understood in the chat. The phrasing is interpreted by models/gitIntent.js
    // (natural language → intent); these are only the replies.
    git: {
      help: 'Puedo ejecutar git con frases normales. Ejemplos:\n• "haz un commit que se llame arreglo login"\n• "deshaz el último commit" (rollback)\n• "reset al commit abc1234" (destructivo: necesito el SHA)\n• "crea una rama para pagos"\n• "cámbiate a main"',
      explain: {
        commit: 'Un commit es una foto guardada de tu proyecto. Dime "haz un commit que se llame ...".',
        rollback: 'Rollback (revert) crea un commit NUEVO que deshace otro, sin borrar el historial. Es seguro en equipo. Dime "deshaz el último commit".',
        reset: 'Reset mueve el proyecto a un commit anterior y descarta todo lo posterior. Es destructivo. Dime "reset al commit <sha>".',
        branch: 'Una rama es una línea paralela de trabajo para probar cosas sin tocar la principal. Dime "crea una rama para pagos".',
        diff: 'Rollback crea un commit nuevo que deshace otro: el historial se conserva. Reset mueve el historial hacia atrás y descarta cambios: es destructivo, úsalo solo en local.',
      },
      desktopOnly: 'Los comandos git solo funcionan dentro de la app de escritorio (npm start).',
      needsMessage:  'Escríbeme el mensaje del commit. Ejemplo: "haz commit con \"Fix login bug\""',
      needsSha:       'Necesito el SHA del commit (al menos 4 caracteres). Puedes hacer clic en un commit del mapa y usar el chip que aparece aquí.',
      needsBranchName: 'Escribe el nombre de la rama. Ejemplo: "crea rama feature/mi-funcion"',
      cancelled:      'Ok, no hice ningún cambio.',
      committed:   (msg) => `✅ Commit creado:\n"${msg}"`,
      reverted:    (sha) => `↩️ Revert aplicado al ${sha === 'HEAD' ? 'último commit' : `commit ${sha.slice(0, 7)}`}.\nSe creó un nuevo commit que deshace esos cambios.`,
      reset:       (sha) => `⏮ HEAD movido al commit ${sha.slice(0, 7)}.\nLos cambios no guardados fueron descartados.`,
      branchCreated: (name) => `🌿 Rama "${name}" creada y activada.`,
      checkedOut:    (target) => `🔀 Cambiado a "${target}".`,
      failed:        (err) => `<strong>⛔ Error git</strong>\n${err}`,
      // Chips shown in the chat when the user selects a commit on the map
      chipRevert:   (short) => `Rollback · ${short}`,
      chipReset:    (short) => `Reset al ${short}`,
      chipCopySha:  'Copiar SHA',
    },
  },
};
