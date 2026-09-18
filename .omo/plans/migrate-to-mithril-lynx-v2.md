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
