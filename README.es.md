# Política SourceRudder para Pi

[English](README.md) · [Español](README.es.md)

Un paquete privado de Pi que dirige por defecto la investigación web visible al
MCP SourceRudder configurado por separado, con contingencia TUI de una ejecución
confirmada por una persona. No configura, inicia, incluye ni publica SourceRudder.

## Ruta rápida

1. Configurá y verificá el MCP de SourceRudder por separado antes de instalar este paquete.
2. En este repositorio, ejecutá `npm ci --ignore-scripts` y `npm run check`.
3. Instalalo globalmente con `pi install /absolute/path/to/pi-sourcerudder-policy` y luego ejecutá `/reload` en Pi.
4. Confirmá que `npm run verify:installed` informa carga con el runtime instalado
   y smoke asíncrono de consentimiento offline. No instala ni llama a modelos/proveedores.

Para una instalación por proyecto y el procedimiento de eliminación, consultá el
[runbook](RUNBOOK.es.md). El diseño del runtime está en la
[arquitectura](docs/architecture.es.md).

## Límite aplicado

| Ruta visible de herramientas de Pi | Comportamiento |
| --- | --- |
| Ruta directa de SourceRudder, MCP genérico o MCP con espacio de nombres | Permitida y registrada. |
| `web_search`, `source_check`, `fetch_content`, `get_search_content`, `websearch`, `webfetch` | Denegada sin UI; solo tras un error de SourceRudder puede una confirmación TUI local permitir esa invocación. |
| Ruta MCP identificable de búsqueda web o fetch que no sea SourceRudder | Mismo rechazo con redirección y contingencia de una ejecución solo tras un fallo. |
| Todas las herramientas de los servidores MCP exactos `playwright` o `browserbase` | Fuera de la confirmación de investigación de ESTA extensión. |
| Búsqueda local/de código y capacidades MCP no relacionadas | No las bloquea esta política. |

La exclusión MCP de navegador cubre selección de pestañas (incluido `index: 0`),
snapshots, navegación, click/fill, evaluación y operaciones desconocidas o de investigación.
Las rutas MCP genéricas y con espacio de nombres requieren identidades exactas
consistentes; namespaces ajenos, imitaciones y alias contradictorios no obtienen exención.
Los permisos de seguridad/cuenta siguen siendo independientes. La investigación
protegida restante mantiene SourceRudder-first y la misma contingencia de una ejecución.

Cada turno de agente recibe un bloque de instrucciones SourceRudder-first,
marcado con un sentinel. Los bloques de política completos previos se reemplazan
sin eliminar texto de sistema ajeno del host.

### La guarda 11/12

Para una sesión y una huella canónica de herramienta/entrada SourceRudder, se
permiten once llamadas sin resolver y se bloquea la duodécima. Solo un
`tool_result` exitoso de Pi que coincida limpia esa huella. Eventos de resultado
con error, no coincidentes o ausentes permanecen sin resolver.

## Rutas invocables de SourceRudder

Usá las herramientas declaradas `mcp__sourcerudder__<tool>`: `search_web`,
`search_doc_oficial`, `search_github`, `search_github_issue`, `search_github_pr`,
`search_stackoverflow`, `search_reddit`, `search_news`, `fetch_url`,
`fetch_and_extract`, `deep_research`. Si no están declaradas, usá codemode
`tools.mcp__sourcerudder__<tool>({...})` con el mismo sufijo y argumentos.
Las herramientas nativas no son alias de SourceRudder.

`web_search`, `websearch` y `source_check` redirigen a
`mcp__sourcerudder__search_web` (documentación: `mcp__sourcerudder__search_doc_oficial`;
GitHub: `mcp__sourcerudder__search_github`). `fetch_content`, `webfetch` y
`get_search_content` redirigen a `mcp__sourcerudder__fetch_url` o
`mcp__sourcerudder__fetch_and_extract`.

Un resultado SourceRudder exitoso limpia la elegibilidad para consentimiento,
incluso con otra huella de la misma sesión. Resultados ausentes o no coincidentes
no la habilitan. Los hooks de inicio/cambio/fork/tree/cierre y compactación la
reinician; resultados anteriores al reinicio no la restauran. La guarda 11/12 es independiente.

## ONE EXECUTION, no un permiso reutilizable

La investigación rechazada por el clasificador se deniega sin preguntar, con
una herramienta SourceRudder de reemplazo y `[policy_denial=sourcerudder_first]`.
Solo cuando el último `tool_result` SourceRudder correlacionado de la sesión tiene
`isError: true` puede abrir una confirmación TUI local que muestra herramienta, IDs de llamada/padre, operación, JSON canónico
completo, destino/cwd y motivo de rechazo. Aprobar puede divulgar esos argumentos
al destino/proveedor. Solo `true` explícito permite esa ejecución. RPC, print,
JSON y llamadas sin UI se deniegan (incluso con `hasUI: true`); campos o flags de
aprobación del modelo no tienen autoridad. SourceRudder y los MCP de navegador
conocidos nunca requieren confirmación de investigación.

- No hay desactivación global, cambio automático de proveedor ni permisos persistidos/reutilizables.
- Cancelación, timeout, excepción de UI, abort, mutación, cambio de sesión/contexto
  y replay deniegan. Cada invocación o reintento necesita ID nuevo y aprobación
  humana nueva, incluso tras éxito, error, timeout o rechazo de un hook posterior.
- Se congelan la entrada original y el evento antes del despacho. Herramientas que
  mutan su entrada pueden fallar tras entrar: sin rollback, compatibilidad universal ni reintento automático.
- Diálogos serializados: plazo de 30 segundos incluida la cola, ocho pendientes,
  4096 IDs sin expulsión por runtime y 256 registros de auditoría. JSON demasiado
  grande o no representable sin pérdida se deniega, no se trunca; controles escapados.
- Auditoría solo en memoria: estado e ID opaco, sin argumentos, texto del diálogo,
  cwd privado ni huellas. Una UI defectuosa retiene su turno hasta terminar.

La evidencia de despacho real cubre pares Pi/agent-core `0.85.1` (loop del modelo;
APIs directas/anidadas ausentes) y `1.0.3` (modelo, directo y anidado al estilo
codemode). El peer comodín no prueba versiones desconocidas. Herramientas falsas
no prueban Chrome autenticado ni disponibilidad de SourceRudder.

## Alcance de instalación

| Alcance | Comando | Efecto |
| --- | --- | --- |
| Global | `pi install /absolute/path/to/pi-sourcerudder-policy` | Escribe en la configuración de usuario de Pi y deja disponible el paquete para sesiones que usan esa configuración. |
| Proyecto | `pi install -l /absolute/path/to/pi-sourcerudder-policy` | Escribe `.pi/settings.json`; Pi carga paquetes de proyecto faltantes al iniciar solo después de confiar en el proyecto. |

El descubrimiento global no modifica otros repositorios. El descubrimiento por
proyecto no modifica otros proyectos. Agentes, skills y subagentes están
cubiertos solo cuando sus llamadas visibles se ejecutan mediante el runtime de Pi
que resolvió este paquete; otro proceso o workspace de Pi necesita su propia
instalación global o de proyecto aplicable.

## Límites y seguridad

- SourceRudder ya debe estar configurado; su servidor MCP es una dependencia externa.
- La extensión ve eventos de herramientas de Pi, no tráfico de red oculto dentro de ese proceso MCP externo.
- No promete aislamiento de red ni bloquea Bash o capacidades no relacionadas.
- La validación usa el packlist de npm y un tar en memoria, rechazando tests, ODD,
  metadatos locales, scripts, workflows, lockfiles y `node_modules`, sin escribir
  cachés ni artefactos del paquete.

## Referencias para operar

- [Runbook](RUNBOOK.es.md): instalación, reload, verificación, eliminación y rollback.
- [Arquitectura](docs/architecture.es.md): manifiesto, flujo de runtime y límites de aplicación.
- [Licencia MIT](LICENSE)
