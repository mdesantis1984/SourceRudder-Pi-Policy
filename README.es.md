# Política SourceRudder para Pi

[English](README.md) · [Español](README.es.md)

Un paquete privado de Pi que mantiene las llamadas visibles de investigación web
sobre una ruta MCP de SourceRudder configurada por separado. Empaqueta el runtime
de política existente; no configura, inicia, incluye ni publica SourceRudder.

## Ruta rápida

1. Configurá y verificá el MCP de SourceRudder por separado antes de instalar este paquete.
2. En este repositorio, ejecutá `npm ci --ignore-scripts` y `npm run check`.
3. Instalalo globalmente con `pi install /absolute/path/to/pi-sourcerudder-policy` y luego ejecutá `/reload` en Pi.
4. Confirmá que `npm run verify:installed` informa una entrada de extensión
   empaquetada, instalada para producción y cargable. Esta verificación no invoca
   un modelo ni un proveedor.

Para una instalación por proyecto y el procedimiento de eliminación, consultá el
[runbook](RUNBOOK.es.md). El diseño del runtime está en la
[arquitectura](docs/architecture.es.md).

## Límite aplicado

| Ruta visible de herramientas de Pi | Comportamiento |
| --- | --- |
| Ruta directa de SourceRudder, MCP genérico o MCP con espacio de nombres | Permitida y registrada. |
| `web_search`, `source_check`, `fetch_content`, `get_search_content`, `websearch`, `webfetch` | Bloqueada sin aprobación ni ruta alternativa. |
| Ruta MCP identificable de búsqueda web o fetch que no sea SourceRudder | Bloqueada. |
| Búsqueda local/de código y capacidades MCP no relacionadas | No las bloquea esta política. |

Cada turno de agente recibe un bloque de instrucciones SourceRudder-first,
marcado con un sentinel. Los bloques de política completos previos se reemplazan
sin eliminar texto de sistema ajeno del host.

### La guarda 11/12

Para una sesión y una huella canónica de herramienta/entrada SourceRudder, se
permiten once llamadas sin resolver y se bloquea la duodécima. Solo un
`tool_result` exitoso de Pi que coincida limpia esa huella. Eventos de resultado
con error, no coincidentes o ausentes permanecen sin resolver.

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
- La validación del paquete rechaza tests, ODD, metadatos locales, scripts, workflows,
  lockfiles y `node_modules` dentro del tarball npm.

## Referencias para operar

- [Runbook](RUNBOOK.es.md): instalación, reload, verificación, eliminación y rollback.
- [Arquitectura](docs/architecture.es.md): manifiesto, flujo de runtime y límites de aplicación.
- [Licencia MIT](LICENSE)
