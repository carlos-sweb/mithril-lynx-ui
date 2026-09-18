# Plan — migrating mithril-lynx-ui from mithril-lynx v1 to v2

> Estado (2026-09-18): **Plan inicial, investigación de F0 pendiente. Nada implementado todavía.**
> Decisión del usuario: reemplazar `mithril-lynx/navigation` (v1) por algo con la
> ergonomía de `mithril-lynx/route` (v2) en el demo de esta librería. Se determinó
> que eso requiere migrar la librería entera a v2 primero, ya que v1 y v2 son dos
> pipelines de render incompatibles (no se puede usar `route` de v2 montando
> componentes construidos sobre el shim de v1). El usuario confirmó explícitamente
> que quiere encarar esto como proyecto propio, multi-sesión.

## 0. Por qué esto no es "cambiar el import"

`mithril-lynx-ui` está construido enteramente sobre `mithril-lynx` v1:
`mithril` real (no `mithril-runtime`), `shim.renderToPage()`/main-thread-owned
mode (Mithril corre y difa directamente contra elementos PAPI reales, en el
mismo hilo). `mithril-lynx` v2 es una arquitectura distinta: Mithril SIEMPRE
corre en el hilo **background**, contra un fake-DOM, y el hilo main-thread
solo re-aplica patches — nunca ejecuta vista. Son dos árboles de vnodes de
identidades de módulo distintas (`mithril` vs `mithril-runtime`) corridos por
motores de diff distintos; no se pueden mezclar componentes de uno usando el
router del otro.

**El problema real no es superficial**: `mithril-lynx` v2's propio README ya
documenta que gestos, refs imperativas y list virtualization "deliberately
not carried over (yet)" — y no es solo que falte tiempo de portarlos, es que
la arquitectura de v1 en la que están construidos **asume acceso síncrono al
handle nativo real**, algo que ya no existe donde corre la vista en v2 (el
hilo background nunca tiene un handle real — el elemento PAPI real solo
existe en el main thread, creado después por `apply-patch.js` al re-aplicar
el patch).

## 1. Qué necesita realmente cada primitiva de v1 (leído el código real, no supuesto)

| Archivo v1 | Líneas | Qué hace | ¿Depende del hilo? |
|---|---|---|---|
| `element.js` | 83 | `wrapElement(node)` — `setStyleProperty(ies)`, `setAttribute`, `querySelector(All)`, `animate`/`play`/`pause`/`cancelAnimation`, `invoke(method, params)`. Todo opera sobre `node._handle` directamente vía llamadas PAPI globales (`__SetInlineStyles`, `__SetAttribute`, `__QuerySelector`, `__ElementAnimate`, `__InvokeUIMethod`). | **Sí** — asume `_handle` real, disponible sincrónicamente donde corre la vista. |
| `gesture.js` | 117 | `createGesture(node, options)` — registra un gesture detector nativo (`__SetGestureDetector`) sobre `node._handle`, con callbacks invocados same-thread. | **Sí** — mismo problema, y los callbacks del gesto los invoca native EN el hilo donde se registró el handle. |
| `list.js` | 185 | `createList(parentNode, options)` — recycler nativo (`__CreateList`/`componentAtIndex`/`enqueueComponent`), renderiza el contenido de cada celda con **su propia instancia de Mithril** (`shim()`), independiente del árbol principal. | **Sí**, y además necesita una segunda instancia de render corriendo en el mismo hilo que el handle. |
| `src/worklet-runtime.js` | 82 | Sustituto mínimo de `@lynx-js/react`'s runtime de worklets — native invoca callbacks de gesto por `_wkltId` vía `globalThis.runWorklet`, no llamando la función directo. | No depende del hilo en sí, pero solo tiene sentido junto a `gesture.js`. |
| `background.js`'s `createRef()` (v1, ~15 líneas) | — | El ÚNICO primitivo de v1 que YA es cross-thread: `lynx.createSelectorQuery().select(selector).invoke({method, params, success, fail}).exec()` — funciona desde el hilo background hoy mismo, sin handle directo. | No — este es el patrón a generalizar. |

**Conclusión de F0 (parcial, ya confirmada)**: el modelo a portar a v2 no es
`element.js`/`gesture.js`'s acceso directo — es `background.js`'s
`createRef()`, generalizado para cubrir lo que `element.js` cubre hoy
(estilos, atributos, animate, invoke) y, más incierto, lo que `gesture.js`
necesita (registrar un detector Y recibir sus callbacks cross-thread).

## 2. Qué componentes de mithril-lynx-ui dependen de qué (grep real, 2026-09-18)

| Primitivo v1 | Usado por | Cuántos |
|---|---|---|
| `mithril-lynx/element` (`wrapElement`) | draggable, input, feed-list, list, popover, slider, sheet, swipe-action, swiper | 9 |
| `mithril-lynx/gesture` (`createGesture`) | sheet, swipe-action, swiper | 3 |
| `mithril-lynx/list` (`createList`) | list (feed-list lo usa indirectamente vía list) | 1 directo, 2 con feed-list |
| Ninguno de los tres (directo NI transitivo) | scope, button, switch, checkbox, radio-group, presence, dialog, lazy-component, layout | **9** |
| Bloqueados TRANSITIVAMENTE (import relativo a un componente bloqueado, aunque ellos mismos no toquen element/gesture/list) | drawer (→sheet), form (→input), input-otp (→input), sortable (→draggable) | 4 |

> **Corrección (2026-09-18)**: la primera versión de esta tabla contó 12
> "libres" sin calcular el cierre transitivo de los imports relativos —
> `drawer.js` importa `sheet.js` (bloqueado), `form.js` e `input-otp.js`
> importan `input.js` (bloqueado), `sortable.js` importa `draggable.js`
> (bloqueado). Recalculado programáticamente (script en el historial de
> commits): el conjunto real, libre de toda dependencia directa o
> transitiva, es **9**, no 12.

O sea: **9 de 24 componentes no necesitan nada de esto** — pueden portarse a
v2 sin resolver ninguna de las preguntas de arquitectura de abajo (de 22
componentes totales, no 24 — scope y lazy-component no eran contados en el
"24" original). Los otros 13 (draggable, feed-list, input, list, popover,
slider, sheet, swipe-action, swiper, drawer, form, input-otp, sortable)
están bloqueados — 9 de forma directa (usan
`wrapElement`/`createGesture`/`createList`), 4 de forma transitiva
(drawer/form/input-otp/sortable) — hasta que F0-real resuelva el punto 3.

## 3. Preguntas de F0 sin resolver todavía (investigación, no implementación)

1. ~~¿`lynx.createSelectorQuery()` cubre todo lo que `element.js` necesita?~~
   **RESUELTO (2026-09-18), leyendo `@lynx-js/types/types/background-thread/nodes-ref.d.ts`
   real**: `NodesRef` (lo que devuelve `.select(selector)`) YA expone
   `animate()`, `playAnimation()`, `pauseAnimation()`, `cancelAnimation()`,
   `setNativeProps()` e `invoke()` — casi 1:1 con `wrapElement()`'s propia
   superficie. `setNativeProps()` es el candidato directo para
   `setStyleProperty(ies)`/`setAttribute` (falta confirmar la forma exacta
   del objeto que espera, no está tipado más allá de `Record<string, any>`).
   No hay un `querySelector(All)` encadenado desde un `NodesRef`, pero
   `SelectorQuery.select(selector)`/`.selectAll(selector)` ya cubre selección
   por selector compuesto (ej. `"#foo .bar"`) sin necesitar encadenar. **Esto
   reduce el riesgo de la migración significativamente**: el nuevo
   `mithril-lynx/element` de v2 puede ser un wrapper fino y casi mecánico
   sobre `lynx.createSelectorQuery()`, no una reinvención.
2. **Gestos son el caso más difícil**: `__SetGestureDetector` necesita un
   handle real, y sus callbacks los invoca native EN el hilo del handle — o
   sea, en v2, en el main thread, que NUNCA ejecuta código de app. Esto no es
   "wrappear una llamada async", es un protocolo nuevo de dos vías: el
   background thread pide "registrame un gesto en el nodo X", el main thread
   lo hace, y cuando native invoca el callback, el main thread tiene que
   reenviar ESE evento de vuelta al background thread (similar a como
   `channel.js` ya reenvía taps hoy, pero con más frecuencia — un pan puede
   disparar `onUpdate` en cada frame). Necesita medir el costo de ese
   round-trip antes de asumir que es viable para algo tan sensible a
   latencia como un drag.
3. **Lists son el caso más grande**: `componentAtIndex` es un callback
   SÍNCRONO que native espera resuelto ya — no hay forma de "preguntarle al
   background thread y esperar" sin bloquear native. Probablemente necesita
   que el background thread mantenga PRE-renderizado un buffer de celdas
   (como React Native's `VirtualizedList` hace) en vez de responder on-demand
   — un diseño genuinamente distinto al de v1, no un port.
4. ¿Vale la pena portar TODO, o dejar Draggable/Sortable/Slider/SwipeAction/
   Sheet/Popover/Swiper/List/FeedList/Input's ref-dependent bits como
   "v1-only" por ahora y mover solo los 12 componentes sin dependencia de
   estas primitivas a v2 primero, como entrega incremental? (Recomendado,
   dado el tamaño de las preguntas 2 y 3 — pero es decisión del usuario.)

## 4. Próximos pasos propuestos (orden, no fechas)

- **F0.1**: Leer `@lynx-js/types`' declaración completa de
  `SelectorQuery`/`NodesRef` para responder la pregunta 1 con evidencia, no
  suposición.
- **F0.2**: Prototipo mínimo, sin dispositivo (rstest + jsdom-PAPI): un
  `mithril-lynx/element` de v2 que resuelva `setStyleProperty`/`setAttribute`
  vía el selector-query bridge, para al menos uno de los 9 componentes que
  dependen de `wrapElement` (candidato: `input.js`, el más simple de los 9).
- **F0.3**: Decisión explícita del usuario sobre la pregunta 4 — ¿portamos
  incremental (12 componentes primero, gestos/listas quedan pendientes) o
  bloqueamos todo hasta resolver 2 y 3?
- Recién después de F0: fase de portado componente por componente, mismo
  orden de dificultad que ya se usó para construir la librería sobre v1 (ver
  la memoria del proyecto) — no hay razón para reordenar esa secuencia.

## 5. Lo que NO cambia con esta migración

El propio `internal/native.js` de esta librería (22 líneas, `nativeBool()`)
no depende de ningún primitivo de v1 en absoluto — es solo una coerción de
tipos, portable sin cambios. La reorganización de carpetas (commit
`f5b838a`) tampoco necesita revertirse ni rehacerse: la estructura por
componente sirve igual de bien para código v1 o v2.

## 6. Ejecución de los 9 — hallazgos reales (2026-09-18)

Migrados y verdes: `scope`, `button`, `switch`, `checkbox`, `radio-group`,
`layout`, `dialog`, `presence`, `lazy-component` (ver commits de esta
sesión en ambos repos). Un harness de test nuevo
(`test/v2-harness.ts`) monta cada componente contra el `renderApp()` +
`createPatchApplier` REALES de v2 (no un mock) — mismo nivel de rigor que
v1 siempre exigió en este proyecto.

**Bugs reales de `mithril-lynx` v2 encontrados y arreglados en el camino**
(ninguno visible antes porque el propio test suite de v2 nunca ejercitó
estos paths — ver commits en `mithril-lynx-v2`, versión subió de 2.0.2 a
2.3.0):
1. `LynxText` nunca inicializaba `_text` — `nodeValue` leía `undefined`
   hasta la primera actualización (no afectaba el render real, solo la
   introspección externa).
2. `LynxFragment`/`LynxContainerNode` no exponían `childNodes` —
   CUALQUIER componente con más de un hijo top-level (un patrón
   extremadamente común) crasheaba en `render.js`'s `createFragment`.
3. **El más grande**: `updateStyle()` de Mithril limpia el style ANTES de
   aplicar un objeto, incluso en un elemento recién creado que nunca tuvo
   estilos — y v2 tenía eso marcado como "F3 TODO, no implementado" sin
   condición. Cualquier componente con `style: {...}` (no un string, no
   `undefined`) crasheaba en su primer render. Arreglado rastreando si
   alguna vez se seteó una propiedad real (`_styleEverSet`) antes de
   emitir el clear-all.
4. Se agregaron 3 exports públicos nuevos a v2, necesarios para que un
   paquete separado pueda testear de verdad contra él: `mithril-lynx/
   mount-redraw` (redraw async fuera de un event handler — lo necesitan
   `presence.js`/`dialog.js`), `mithril-lynx/testing` (polyfill +
   `createPatchApplier`, mismo motivo que v1 ya tenía `mithril-lynx/
   testing`), y `getHandle(id)` en el applier (para leer estilos/clases
   aplicados vía el `__papiCalls` global que instala el polyfill de v1).

**Diferencia real de convención v1 vs v2, no un bug**: v1's `LynxStyleProxy`
CAMELIZA toda key de estilo antes de llegar al PAPI nativo (acepta
`"font-size"` o `fontSize`, unifica a camelCase). v2's `fake-dom.js` hace
lo CONTRARIO — normaliza a dash-case. Un componente escrito con estilos en
dash-case literal (como `layout.js` casi en su totalidad) funciona igual en
ambos; un test/consumidor que lea el estilo aplicado de vuelta tiene que
saber cuál convención está mirando. No se tocó v2 para "arreglar" esto —
dash-case es lo que su propio diseño ya documentaba como intencional.

**`internal/press.js` se bifurcó**: `press-v2.js` es la versión sin
`shim.redraw()` explícito (v2 auto-redibuja después de cualquier evento;
v1 no, por eso v1 SÍ necesita el redraw manual ahí). `press.js` (v1) sigue
sirviendo a los componentes todavía no migrados (`sheet.js` por ahora).

**El error real de esta ejecución — dependencia INVERSA, no calculada en
el plan original**: el análisis de "9 sin dependencia" solo miró qué
importa CADA componente candidato (dependencia hacia adelante). Nunca
miró la dirección contraria: ¿qué componentes TODAVÍA EN v1 dependen de
uno de los 9? `sheet.js`/`popover.js` (ambos bloqueados, sin migrar)
importan `presence.js` y `button.js` — dos de los "9 libres". Migrar
`presence.js` completo rompió `sheet.test.ts`/`popover.test.ts` (15 tests)
en silencio: `presence.js` ahora llama `mithril-lynx/mount-redraw`'s
`redraw()`, que es un no-op total cuando el árbol lo monta el shim de v1
(nunca hay un `renderApp()` de v2 registrado) — la animación nunca
avanzaba, no un error, un freeze silencioso.

`button.js`/`scope.js` sí resultaron seguros de compartir tal cual sin
bifurcar (confirmado empíricamente: `form.test.ts`/`input-otp.test.ts`,
que consumen `button.js`/`checkbox.js`/`switch.js`/`radio-group.js`/
`scope.js` migrados desde código todavía-v1, siguen pasando) — ninguno
de los dos llama ninguna función de redraw explícita, así que mezclar
vnodes de `mithril` real con componentes cuyo `view()` interno usa
`mithril-runtime` no importa: el diff de Mithril solo mira la FORMA del
vnode (`tag`/`attrs`/`children`), no de qué módulo `m()` salió. El
problema es específicamente cualquier función que LLAME a un mecanismo
de redraw hardcodeado a una versión — no la mezcla de módulos en sí.

**Arreglado bifurcando SOLO `presence.js`** (no `button.js`/`scope.js`,
que no lo necesitan): `presence-v2.js` es la copia real usada por
`dialog.js` (el único consumidor migrado), con `mithril-runtime` +
`mount-redraw` + `press-v2.js`. `presence.js` volvió a ser exactamente
el original v1 (real `mithril` + `shim.redraw()` vía el alias
`mithril-lynx-v1`), sigue sirviendo a `sheet.js`/`popover.js`. Suite
completa reverificada: **217/217, en los 24 archivos, v1 y v2 mezclados
correctamente**.

**Lección para cualquier migración incremental futura de un módulo
compartido**: antes de migrar un módulo consumido por MÁS de un
llamador, listar TODOS sus consumidores (no solo los que ya se planea
migrar) y verificar si el módulo llama algo versionado (una función de
redraw, un evento, un mecanismo de hilo) — si no llama nada así, es
seguro compartirlo tal cual; si sí, bifurcar antes de migrar, no
después de que un test lo delate.
