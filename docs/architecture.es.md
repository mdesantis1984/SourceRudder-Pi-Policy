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
  -> tool_call: clasifica la ruta visible, bloquea alternativas conocidas y registra SourceRudder
  -> tool_result: reinicia solo una huella SourceRudder exitosa que coincide
  -> session_shutdown: limpia el seguimiento local de la sesión
```

La extensión no crea herramientas, proveedores, clientes MCP, subprocesos ni
conexiones de red.

## Límite de clasificación

| Ruta | Decisión |
| --- | --- |
| `sourcerudder_*`, `mcp__sourcerudder*` o una llamada `mcp` que identifica explícitamente a SourceRudder | Permitida como SourceRudder. |
| Nombres nativos exactos `web_search`, `source_check`, `fetch_content`, `get_search_content`, `websearch`, `webfetch` | Bloqueados. |
| Ruta MCP identificable de investigación web que no sea SourceRudder | Bloqueada. |
| Capacidad ambigua, local/de código, Bash, memoria o MCP no relacionada | Fuera del bloqueo de investigación web. |

Una identidad explícita de servidor MCP extranjero tiene precedencia sobre un
nombre de herramienta con apariencia SourceRudder. La política deliberadamente
no transforma rutas ambiguas en un bloqueo amplio.

## Guarda de reintentos

El estado vive solo en la memoria de la extensión y se indexa por sesión de Pi
más una serialización estable del nombre de herramienta y entrada. Se permiten
once llamadas coincidentes sin resolver y se bloquea la duodécima. Un resultado
exitoso reinicia solo su huella coincidente. Resultados fallidos, ausentes, de
otra sesión, otra herramienta u otra entrada no la reinician. El cierre de sesión
elimina ese estado.

## Verificación y límites operativos

- `check:package` valida el manifiesto real de `npm pack`, el manifiesto de Pi,
  los archivos de runtime, el límite del MCP externo y la ausencia de artefactos
  locales prohibidos.
- `verify:installed` empaqueta, instala para producción e importa la entrada
  declarada en un directorio temporal mediante el loader TypeScript del
  repositorio. No llama a Pi, un modelo, un proveedor ni modifica configuración de Pi.
- La política no puede inspeccionar tráfico de red oculto dentro del proceso MCP
  externo de SourceRudder. Por eso no promete aislamiento de red ni disponibilidad
  de SourceRudder.

Consultá el [runbook](../RUNBOOK.es.md) para elegir alcance, reload, eliminación
y rollback.
