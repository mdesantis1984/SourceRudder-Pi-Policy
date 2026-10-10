# Arquitectura

[English](architecture.md) · [Español](architecture.es.md) · [Runbook](../RUNBOOK.es.md)

Política SourceRudder para Pi es un paquete de extensión pequeño sobre el
dominio de política existente. Gobierna eventos de herramientas visibles de Pi;
SourceRudder sigue siendo un servidor MCP externo configurado por separado.

## Límite del paquete

`package.json` declara el manifiesto documentado de Pi:

```json
{
  "pi": { "extensions": ["./src/index.ts"] }
}
```

Pi carga la entrada de extensión TypeScript mediante su loader de extensiones. El
paquete no tiene dependencias de runtime ni un servidor MCP incluido. Su
compatibilidad como peer de runtime con Pi usa intencionalmente el comodín `*`:
Pi incluye esta API central para extensiones y la suministra al instalar el
paquete. Los tests de desarrollo fijan exactamente
`@earendil-works/pi-coding-agent` en `0.85.1` para reproducibilidad y requieren
Node.js `>=22.19.0`, como esa release de Pi.

## Flujo de runtime

```text
Turno de agente de Pi
  -> before_agent_start: preserva texto del host y agrega un bloque de política
  -> tool_call: clasifica; permite MCP de navegador/local; registra SourceRudder; redirige investigación rechazada sin UI salvo elegibilidad por fallo
  -> confirmación: reserva ID -> serializa TUI -> verifica identidad -> congela ORIGINAL -> consume
  -> tool_result: correlaciona resultado; actualiza elegibilidad; reinicia huella exitosa coincidente
  -> shutdown/before switch/fork/tree/compact: reinicia elegibilidad; revoca confirmaciones pendientes
  -> start/tree/compact: reinicia elegibilidad; vincula manager/sesión vigentes y epoch nuevo
```

La extensión no crea herramientas, proveedores, clientes MCP, subprocesos ni
conexiones de red.

## Límite de clasificación

| Ruta | Decisión |
| --- | --- |
| `sourcerudder_*`, `mcp__sourcerudder*` o una llamada `mcp` que identifica explícitamente a SourceRudder | Permitida como SourceRudder. |
| Nombres nativos exactos `web_search`, `source_check`, `fetch_content`, `get_search_content`, `websearch`, `webfetch` | Denegados sin UI; confirmación TUI local nueva solo tras un error SourceRudder. |
| Ruta MCP identificable de investigación web que no sea SourceRudder | Mismo rechazo con redirección y confirmación solo tras un fallo. |
| Todas las herramientas de MCP de navegador exactos (`playwright`, `browserbase`) | Fuera de la confirmación de investigación de ESTA extensión. |
| Capacidad ambigua, local/de código, Bash, memoria o MCP no relacionada | Fuera del bloqueo de investigación web. |

Una identidad explícita de servidor MCP extranjero tiene precedencia sobre un
nombre de herramienta con apariencia SourceRudder. La política deliberadamente
no transforma rutas ambiguas en un bloqueo amplio.

La exclusión de todo el MCP de navegador valida el servidor del namespace y cada
alias `server`, `serverName` y `mcpServer` antes de clasificar SourceRudder.
Deben coincidir en la identidad exacta del navegador (sin distinguir mayúsculas);
conflictos, namespaces ajenos y límites malformados se rechazan. Las imitaciones
no obtienen exención. No hay allowlist de herramientas ni entradas de operación:
selección de pestañas (incluido `index: 0`), snapshots, navegación, click/fill,
evaluación y operaciones desconocidas o de investigación quedan fuera de esta confirmación.
Los permisos de seguridad/cuenta siguen siendo independientes. La investigación
protegida restante mantiene SourceRudder-first con elegibilidad solo tras un fallo;
las protecciones del consentimiento y la guarda de reintentos no cambian. La actualización elimina el bloque exacto
previo de confirmación con navegador limitado y los anteriores bloques propios,
preservando texto ajeno del host.

## Guía invocable y redirecciones

El bloque Pi activo nombra rutas declaradas `mcp__sourcerudder__<tool>`:
`search_web`, `search_doc_oficial`, `search_github`, `search_github_issue`,
`search_github_pr`, `search_stackoverflow`, `search_reddit`, `search_news`,
`fetch_url`, `fetch_and_extract`, `deep_research`. Sin herramientas declaradas,
usá codemode `tools.mcp__sourcerudder__<tool>({...})`.

`web_search`/`websearch`/`source_check` redirigen a `mcp__sourcerudder__search_web`
(documentación: `mcp__sourcerudder__search_doc_oficial`; GitHub:
`mcp__sourcerudder__search_github`). `fetch_content`/`webfetch`/`get_search_content`
redirigen a `mcp__sourcerudder__fetch_url` o `mcp__sourcerudder__fetch_and_extract`.
Las rutas MCP alternativas identificables usan la misma guía de búsqueda/fetch.
Se reemplaza también el bloque Pi completo anterior que siempre preguntaba;
la guía legacy de OpenCode no cambia.

## Límite de consentimiento ONE EXECUTION

`src/one-shot-consent.ts` gestiona consentimiento efímero, no un almacén de permisos.
Solo entran llamadas rechazadas con elegibilidad por fallo: errores de la guarda
nunca ofrecen override. Sin elegibilidad se devuelve ruta de reemplazo y
`[policy_denial=sourcerudder_first]` sin invocar el helper de consentimiento.

La elegibilidad pertenece a la sesión y solo cambia con resultados SourceRudder
correlacionados recién resueltos (misma sesión, ID, herramienta y huella de entrada).
`isError: true` la habilita; éxito la limpia independientemente de la huella.
Resultados ausentes/no coincidentes no cambian nada. Los errores conservan estado
de reintento sin resolver y protección del ID pendiente, pero se marcan resueltos
para impedir replay del resultado. Cada hook existente de inicio/cambio/fork/tree/
cierre/compactación reinicia la elegibilidad y avanza un epoch; resultados
pendientes anteriores no pueden habilitar consentimiento. No se registra desactivación global, cambio automático de proveedor,
permiso invocable por modelo ni argumento/flag de aprobación. RPC, print, JSON,
modo ausente y sin UI deniegan incluso con `hasUI: true`. Solo `true` explícito
de la TUI local puede permitir una llamada.

El diálogo muestra herramienta, IDs de llamada/padre, operación, JSON canónico
completo, destino/cwd, motivo del rechazo y consecuencias de divulgación para ONE
EXECUTION. Se escapan controles. JSON sin pérdida rechaza ciclos, getters, campos
ocultos/símbolos, prototipos no planos, arrays dispersos, números no finitos, cero
negativo y exceso de capacidad; entradas grandes se deniegan, no se truncan.

El vínculo captura ID de sesión, manager vigente, epoch, cwd, herramienta, ID de
llamada, ID padre, referencia/JSON canónico y señal. Tras esperar el diálogo todo
debe coincidir. Revocar aborta closures antiguos; una discrepancia de manager/sesión
deniega y revoca, nunca reactiva silenciosamente. Solo el ciclo de vida establece
el reemplazo. Navegación cancelada o compactación fallida queda revocada hasta un
evento start/tree/compact nuevo o reload. Cancelación/timeout/excepción de UI/abort,
mutación y replay siempre deniegan.

Los IDs se reservan sincrónicamente antes de checks (incluso intentos rechazados),
se consumen antes de permitir y nunca se reabren tras éxito, error, timeout o rechazo
de hook posterior. Cada invocación necesita ID y confirmación nuevos. Límites:
ocho diálogos pendientes, 30 segundos incluida la cola, 4096 IDs sin expulsión por
runtime, JSON de profundidad 32/4096 nodos y presupuesto de 8192 caracteres de
visualización. Cancelar devuelve rechazo inmediatamente pero retiene el turno
hasta que termine la UI real; una UI defectuosa no reemplaza otro diálogo. Sin
reintento automático ni permiso guardado.

La confirmación congela profundamente entrada ORIGINAL y evento, no una copia:
los hooks posteriores no pueden cambiar propiedades ni reasignar entrada/nombre/ID/padre.
Herramientas que mutan su entrada pueden fallar tras entrar: sin rollback ni promesa
de compatibilidad universal. `test/dispatch-contract.test.ts` prueba helper de
producción Y hooks completos con despacho/runner reales y herramientas falsas.
La evidencia cubre pares Pi/agent-core `0.85.1` (loop del modelo; directo/anidado
ausentes) y `1.0.3` (modelo/directo/anidado, con IDs padre al estilo codemode).
Versiones no caracterizadas fallan el test; peer comodín oficial y dev pin anterior
se conservan. No prueba navegador/autenticación real ni tráfico externo oculto.

La auditoría conserva hasta 256 estados/IDs opacos en memoria; sin argumentos,
texto del diálogo, cwd privado ni huellas. La correlación efímera de resultados
usa referencias congeladas acotadas por el límite de IDs y se limpia al revocar;
no se persiste ni se expone como auditoría.

## Guarda de reintentos

El estado vive solo en la memoria de la extensión y se indexa por sesión de Pi
más una serialización estable del nombre de herramienta y entrada. Se permiten
once llamadas coincidentes sin resolver y se bloquea la duodécima. Un resultado
exitoso reinicia solo su huella coincidente. Resultados fallidos, ausentes, de
otra sesión, otra herramienta u otra entrada no la reinician. El cierre de sesión
elimina ese estado.

## Verificación y límites operativos

- `check:package` usa packlist/Arborist de npm instalado y tar en memoria (12 archivos,
  incluido el helper de consentimiento), validando el manifiesto de Pi,
  los archivos de runtime, el límite del MCP externo y la ausencia de artefactos
  locales prohibidos.
- `verify:installed` usa el loader de Pi de desarrollo ya instalado y el loader
  TypeScript del repositorio para hooks y smoke asíncrono de modos/consentimiento.
  No instala dependencias, escribe tarball, llama a modelos/proveedores ni modifica
  configuración de Pi. No demuestra una instalación nueva de producción.
- La política no puede inspeccionar tráfico de red oculto dentro del proceso MCP
  externo de SourceRudder. Por eso no promete aislamiento de red ni disponibilidad
  de SourceRudder.

Consultá el [runbook](../RUNBOOK.es.md) para elegir alcance, reload, eliminación
y rollback.
