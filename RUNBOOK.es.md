# Runbook de Política SourceRudder para Pi

[English](RUNBOOK.md) · [Español](RUNBOOK.es.md) · [Resumen](README.es.md)

Usá este procedimiento para habilitar o eliminar el paquete local de Pi sin
cambiar la configuración de SourceRudder. SourceRudder ya debe estar configurado
y funcionando correctamente.

## Operación rápida

```sh
npm ci --ignore-scripts
npm run check
pi install /absolute/path/to/pi-sourcerudder-policy
```

En la sesión de Pi objetivo, ejecutá:

```text
/reload
```

`npm run check` debe pasar antes de instalar. Ejecuta typecheck, tests de
política, la revisión del manifiesto empaquetado, la validación bilingüe de la
documentación y carga la extensión mediante el loader de Pi ya instalado con
fixtures asíncronos de modos/consentimiento. El manifiesto se comprueba mediante
packlist de npm y tar en memoria: no instala, cambia configuración de Pi ni invoca modelos/proveedores.

## Elegí el alcance de instalación

| Necesidad | Comando | Implicación operativa |
| --- | --- | --- |
| Aplicar a la configuración de usuario | `pi install /absolute/path/to/pi-sourcerudder-policy` | Pi escribe la configuración de usuario; el paquete queda disponible para sesiones que usan esa configuración. |
| Aplicar solo a este repositorio | `pi install -l /absolute/path/to/pi-sourcerudder-policy` | Pi escribe `.pi/settings.json`; el descubrimiento del paquete de proyecto ocurre al iniciar después de confiar en el proyecto. |

Usá un solo alcance salvo que necesites ambos intencionalmente. Una entrada de
proyecto gana sobre la misma identidad de paquete global. El alcance global no
modifica todos los repositorios y el de proyecto no llega a otros workspaces.

Agentes, skills y subagentes heredan el límite solo cuando sus llamadas visibles
se ejecutan en el runtime de Pi que resolvió este paquete. Un proceso, una
configuración de usuario o un workspace de proyecto separado requiere su propia
decisión de instalación.

## Verificá el comportamiento instalado

1. Ejecutá el harness del repositorio:

   ```sh
   npm run verify:installed
   ```

   Señal esperada: `verify-installed: PASS ...`. Usa el loader TypeScript del
repositorio y el loader de Pi de desarrollo ya instalado. Verifica hooks registrados,
aprobación/replay/cierre TUI asíncronos y rechazo RPC/print/JSON. El check del paquete
valida por separado los 12 archivos permitidos con packlist de npm y tar en memoria,
sin escribir cachés ni artefactos. Esto no prueba
una instalación nueva de producción.

2. En una sesión de Pi recargada, verificá que SourceRudder ya esté disponible a
   través de su configuración MCP separada. Las instrucciones inyectadas deben
   dirigir la investigación web a SourceRudder.
3. Confirmá que las herramientas nativas conocidas se deniegan sin aprobación TUI
   local nueva y que las locales/de código siguen disponibles. No ejecutes
   investigación real para este smoke ni lo tomes como inspección de tráfico.
4. Para una herramienta/entrada SourceRudder idéntica en una sesión, se permiten
   once llamadas sin resolver y se bloquea la duodécima. Un resultado exitoso que
   coincida limpia solo esa huella de sesión.

Todas las herramientas de los servidores MCP exactos `playwright` y `browserbase`
están fuera de la confirmación de investigación de ESTA extensión, incluida selección
de pestañas con `index: 0`, snapshots, navegación, click/fill, evaluación y operaciones
desconocidas o de investigación. Las rutas genéricas y con espacio de nombres requieren
identidades exactas consistentes; namespaces ajenos y alias contradictorios se rechazan.
Los permisos de seguridad/cuenta siguen siendo independientes. La investigación protegida
restante mantiene SourceRudder-first y la confirmación TUI separada explicada abajo.
Los tests locales no prueban conectividad real, Chrome autenticado ni activación actual.

La extensión no incluye ni prueba la conectividad de SourceRudder. Un harness
local exitoso demuestra empaquetado y carga, no disponibilidad del MCP externo.

## Smoke TUI temporal sin red (dirigido por el padre)

Para esta activación, el preflight resolvió el paquete instalado de usuario directamente
al código del repositorio con Pi `1.0.3`. No hace falta reinstalar, copiar ni editar
settings; no existe `.pi/settings.json` de proyecto. El registro no prueba la carga activa.

1. Tras checks/revisión, la **persona** ejecuta `/reload` en la TUI objetivo.
   `.pi/extensions/one-shot-policy-smoke.ts` temporal se carga automáticamente desde
   el proyecto de confianza. En `session_start` consulta `pi.getAllTools()` antes de
   registrar tres herramientas distintas; rechaza colisiones sin sustituir herramientas.
   Carga e inicio no ejecutan herramientas. Detené el smoke si falla la carga o falta
   la confirmación esperada.
2. Llamá `policy_smoke_status` con `{}`: esperá `executions: 0`, `disabled: false`.
   Llamá **solo** la herramienta falsa `mcp__policy_smoke__web_search` con exactamente
   `{"sample":"local-only-no-network"}`. La persona **rechaza** el diálogo de
   producción ONE EXECUTION; el estado debe seguir en **0**.
3. Nueva invocación con **ID nuevo** y la misma entrada fija. La persona **aprueba**
   esa llamada falsa exacta mostrada en la TUI; esperá respuesta LOCAL fija y estado
   **1**. Datos de aprobación enviados por el modelo no otorgan permiso.
4. Otra invocación con **ID nuevo**, misma entrada. Debe aparecer un diálogo nuevo;
   la persona lo **rechaza**. Estado **1**. Nunca reintentes automáticamente.
5. Solo tras activar la política actualizada, el padre puede inspeccionar Chrome real
   con `mcp__playwright__browser_get_config` `{}` y `mcp__playwright__browser_tabs`
   `{"action":"list"}` como check limitado de conectividad, no como alcance de la exclusión.
   Las acciones de navegador requieren permisos independientes de seguridad/cuenta;
   esta implementación no autoriza llamadas reales ni ejecuta investigación rechazada.
6. Llamá `policy_smoke_disable` `{}` para ocultar solo las tres herramientas del fixture
   mediante nuevo registro con `exposure: "hidden"` y retirar solo sus nombres activos.
   No desactiva la política. El padre elimina el fixture temporal **y el test acoplado
   `test/smoke-fixture.test.ts`**, luego la persona ejecuta un segundo `/reload`.
   Eliminar sin reload no descarga las definiciones; reload con el archivo presente
   crearía un fixture/contador nuevo. Confirmá que sus nombres ya no están y que
   la política de producción sigue activa.

Es un recurso efímero de test, no una capacidad distribuida: la lista del paquete
sigue en 12 archivos y excluye `.pi` y tests. El fixture solo mantiene un contador en
memoria limitado a tres ejecuciones exitosas y devuelve texto local fijo. No realiza
acciones de red/navegador/archivos/procesos, delega herramientas ni implementa consentimiento.
Estado es solo lectura; desactivar solo retira sus propias definiciones, sin autoeliminarse.
Los mocks deterministas del consentimiento de producción prueban conteos `0/1/1`,
**no confirmación humana real**. Diálogo TUI real y disponibilidad de Chrome siguen
sin probar hasta observar este procedimiento dirigido por el padre.

## Respondé a la confirmación ONE EXECUTION

1. Preferí SourceRudder. Una alternativa rechazada solo puede pedir confirmación
   en la TUI local; RPC, print, JSON y sin UI deniegan, incluso con `hasUI`.
2. Leé herramienta, IDs de llamada/padre, operación, argumentos canónicos completos,
   destino/cwd y motivo del rechazo. Aprobar puede contactar al proveedor/destino
   y divulgar esos argumentos. Entradas demasiado grandes o no representables
   se deniegan antes de preguntar; los controles de terminal se escapan.
3. Aprobá solo esa ejecución o rechazá. No hay permiso permanente, desactivación
   global, permiso invocable por modelo, flag de aprobación ni cambio automático de proveedor.
4. Cada reintento tras éxito, error, timeout o rechazo de hook posterior necesita
   ID nuevo y confirmación nueva. Abort, cancelación, excepción de UI, mutación de
   identidad/entrada o cambio de sesión/contexto deniegan; sin reintento automático.

Los diálogos se serializan, tienen plazo de 30 segundos incluida la cola y hasta
ocho pendientes. Los IDs se reservan antes de permitir/denegar y nunca se expulsan
(4096 por runtime); agotar capacidad deniega. La auditoría conserva hasta 256
estados e IDs opacos en memoria, nunca argumentos, texto del diálogo, cwd privado
ni huellas. Una UI que ignora cancelación retiene su turno hasta terminar: recargá
el runtime en vez de reintentar automáticamente. Navegación cancelada o compactación
fallida deja revocado el consentimiento hasta un evento real start/tree/compact
nuevo o reload. Un contexto antiguo de cierre no lo reactiva.

Entrada y evento originales se congelan profundamente antes de permitir. Una
herramienta que muta su entrada puede fallar tras entrar, sin rollback ni
compatibilidad universal. Los tests de despacho real cubren Pi/agent-core `0.85.1`
(loop del modelo; directo/anidado ausentes) y `1.0.3` (modelo/directo/anidado con
IDs al estilo codemode). Prueban que un hook posterior no ejecuta variantes no
aprobadas, no Chrome autenticado ni compatibilidad con versiones desconocidas.
La guarda SourceRudder 11/12 sigue independiente y no admite override por consentimiento.

## Reload y eliminación

Después de cambiar el registro del paquete, ejecutá `/reload` en la sesión de Pi
afectada o iniciá Pi de nuevo. Para eliminar el paquete, usá el alcance
correspondiente:

```sh
pi remove /absolute/path/to/pi-sourcerudder-policy
pi remove -l /absolute/path/to/pi-sourcerudder-policy
```

Luego ejecutá `/reload` o iniciá una sesión nueva de Pi. `pi remove` cambia la
configuración de Pi; los checks del repositorio y el harness instalado no.

## Rollback

1. Eliminá el paquete del alcance donde lo instalaste.
2. Recargá o reiniciá la sesión de Pi afectada.
3. Confirmá que el paquete ya no aparece en `pi list` y que la guía y los bloques
   de herramientas de la política no están presentes en turnos nuevos.
4. Dejá intacto el MCP SourceRudder configurado por separado, salvo que su propio
   procedimiento operativo indique un cambio.

El rollback elimina solo esta capa de empaquetado y política. No restaura ni
modifica configuración MCP externa, comportamiento de red, credenciales de
usuario, agentes, skills ni subagentes fuera del alcance de Pi seleccionado.

## Recordatorio de límite

Pi puede evaluar llamadas de herramientas visibles. No puede inspeccionar tráfico
de red oculto dentro del proceso MCP externo de SourceRudder. La política no es
aislamiento de red; no bloquea Bash ni capacidades MCP no relacionadas. Consultá
la [arquitectura](docs/architecture.es.md) para el límite exacto del runtime.
