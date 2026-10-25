# Documentación de funciones

Cada función de Qubbot tiene su página en `docs/features/<nombre>/README.md`: cómo se usa, sus estados, sus reglas de seguridad, los archivos que la componen y cómo probarla. La spec de cada una (qué tiene que hacer y por qué) está en `spec/`.

| Función | Documentación | Spec | Rama |
|---|---|---|---|
| Servidores | [features/running-servers](features/running-servers/README.md) | [001-running-servers](../spec/001-running-servers.md) | `feature/server` |
| Gestos con la mano (mover, girar, acercar con dos manos, elegir quieto) | [features/hand-gestures](features/hand-gestures/README.md) | [003-hand-gestures](../spec/003-hand-gestures.md) | `feature/hand-gestures` |
| Control sin manos (ojos con lupa o cabeza, para personas con discapacidad física) | [features/hands-free](features/hands-free/README.md) | [004-hands-free-control](../spec/004-hands-free-control.md) | `feature/hand-gestures` |
| Editor de archivos | [features/file-editor](features/file-editor/README.md) | — | `feature/file-viewer` |
| Robot guía de proyectos nuevos | [features/welcome-robot](features/welcome-robot/README.md) | [diseño](superpowers/specs/2026-10-24-welcome-stack-picker-design.md) | `develop` |
| Conectar mi cuenta (Supabase) | [features/connect-accounts](features/connect-accounts/README.md) | — | `develop` |
