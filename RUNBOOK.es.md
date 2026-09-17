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
documentación y el empaquetado, la instalación de producción y la carga de la
extensión en un directorio temporal. No cambia la configuración de Pi ni invoca
un modelo/proveedor.

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

   Señal esperada: `verify-installed: PASS ...`. Ejecuta `npm pack` con scripts
deshabilitados, instala el tarball con dependencias de producción en un directorio
temporal e importa la entrada de extensión declarada mediante el loader de
TypeScript de este repositorio.

2. En una sesión de Pi recargada, verificá que SourceRudder ya esté disponible a
   través de su configuración MCP separada. Las instrucciones inyectadas deben
   dirigir la investigación web a SourceRudder.
3. Confirmá que las herramientas nativas conocidas de investigación se rechazan y
   que las herramientas locales/de código siguen disponibles. No lo tomes como
   una inspección de tráfico de red.
4. Para una herramienta/entrada SourceRudder idéntica en una sesión, se permiten
   once llamadas sin resolver y se bloquea la duodécima. Un resultado exitoso que
   coincida limpia solo esa huella de sesión.

La extensión no incluye ni prueba la conectividad de SourceRudder. Un harness
local exitoso demuestra empaquetado y carga, no disponibilidad del MCP externo.

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
