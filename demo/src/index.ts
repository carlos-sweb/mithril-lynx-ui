import m from "mithril";
import shim from "mithril-lynx";
import { nativeBool } from "mithril-lynx-ui/native";

import { Button } from "mithril-lynx-ui/button";
import { Checkbox, CheckboxIndicator } from "mithril-lynx-ui/checkbox";
import { Radio, RadioGroup, RadioIndicator } from "mithril-lynx-ui/radio-group";
import { Draggable } from "mithril-lynx-ui/draggable";
import { DialogBackdrop, DialogClose, DialogContent, DialogRoot, DialogTrigger, DialogView } from "mithril-lynx-ui/dialog";
import { FormField, FormRoot, FormSubmitButton } from "mithril-lynx-ui/form";
import { Input, TextArea } from "mithril-lynx-ui/input";
import { InputOTP, InputOTPSlot } from "mithril-lynx-ui/input-otp";
import { LazyComponent } from "mithril-lynx-ui/lazy-component";
import { List } from "mithril-lynx-ui/list";
import type { ListRef } from "mithril-lynx-ui/list";
import { FeedList } from "mithril-lynx-ui/feed-list";
import type { FeedListRef } from "mithril-lynx-ui/feed-list";
import { SheetBackdrop, SheetClose, SheetContent, SheetHandle, SheetRoot, SheetTrigger, SheetView } from "mithril-lynx-ui/sheet";
import type { SheetSide } from "mithril-lynx-ui/sheet";
import { PopoverArrow, PopoverBackdrop, PopoverContent, PopoverPositioner, PopoverRoot, PopoverTrigger } from "mithril-lynx-ui/popover";
import type { PopoverPlacement } from "mithril-lynx-ui/popover";
import { Presence, PresenceContent } from "mithril-lynx-ui/presence";
import { SliderIndicator, SliderRoot, SliderThumb, SliderTrack } from "mithril-lynx-ui/slider";
import { SortableItem, SortableRoot } from "mithril-lynx-ui/sortable";
import { SwipeAction } from "mithril-lynx-ui/swipe-action";
import { Swiper } from "mithril-lynx-ui/swiper";
import type { SwiperRef } from "mithril-lynx-ui/swiper";
import { Switch, SwitchThumb, SwitchTrack } from "mithril-lynx-ui/switch";

import "./style.css";

// Gallery root. One section per shipped component (project plan, Phase 9),
// plus Phase 0's two smoke tests: do Luna's CSS tokens resolve through the
// real mithril-lynx/plugin pipeline, and does the native <overlay> element
// mount through the shim's generic element path.

type Theme = "luna-dark" | "luna-light";

const state = {
  theme: "luna-dark" as Theme,
  overlayOpen: false,
  notifications: true,
  terms: false,
  // A tri-state checkbox: `indeterminate` is owned by the app, never by the
  // component (lynx-ui has no defaultIndeterminate either). Tapping reports
  // "resolved to checked" and it's the owner's job to clear the flag — which
  // is exactly what makes the state visibly move.
  partial: true,
  partialChecked: false,
  plan: "mensual",
  taps: 0,
  card: false,
  presenceLog: [] as string[],
  lazyLog: [] as string[],
  formLog: [] as string[],
  formSubmitted: null as Record<string, unknown> | null,
  nombre: "",
  notas: "",
  drag: { x: 0, y: 0 },
  volume: 0.4,
  range: [0.2, 0.7] as [number, number],
  swipeItems: ["Correo de bienvenida", "Recordatorio de pago", "Nueva actualización"],
  swipeLog: [] as string[],
  sortableItems: [
    { id: "1", label: "Preparar reporte" },
    { id: "2", label: "Revisar PRs" },
    { id: "3", label: "Responder correos" },
    { id: "4", label: "Planificar sprint" },
  ],
  sortLog: [] as string[],
  dialogLog: [] as string[],
  otpValue: "",
  otpLog: [] as string[],
  listItems: Array.from({ length: 40 }, (_, i) => ({ id: String(i), label: `Elemento ${i + 1}` })),
  listLog: [] as string[],
  feedItems: Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: `Publicación ${i + 1}` })),
  feedRefreshing: false,
  feedLoadCount: 0,
  feedLog: [] as string[],
  sheetSide: "bottom" as SheetSide,
  sheetLog: [] as string[],
  popoverPlacement: "bottom" as PopoverPlacement,
  popoverLog: [] as string[],
  swiperItems: ["Uno", "Dos", "Tres", "Cuatro"],
  swiperIndex: 0,
  swiperLog: [] as string[],
};

// Filled in on mount by <Input>; the Mithril stand-in for useImperativeHandle.
const nombreRef: Record<string, () => Promise<unknown>> = {};
// Filled in on mount by <List>.
const listRef: Partial<ListRef> = {};
// Filled in on mount by <FeedList>.
const feedListRef: Partial<FeedListRef> = {};
// Filled in on mount by <Swiper>.
const swiperRef: Partial<SwiperRef> = {};

const TOKENS = [
  { name: "--canvas", modifier: "canvas" },
  { name: "--paper", modifier: "paper" },
  { name: "--primary", modifier: "primary" },
  { name: "--secondary", modifier: "secondary" },
  { name: "--neutral", modifier: "neutral" },
  { name: "--content", modifier: "content" },
];

const PLANS = [
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

function section(title: string, ...children: m.Children[]) {
  return [m("text", { class: "SectionTitle" }, title), ...children];
}

function label(text: string) {
  return m("text", { class: "Row-label" }, text);
}

function row(...children: m.Children[]) {
  return m("view", { class: "Row" }, children);
}

/** A row that lives in a mapped list, so it carries the key instead of its children. */
function keyedRow(key: string, ...children: m.Children[]) {
  return m("view", { class: "Row", key }, children);
}

function DemoButton(text: string, variant: string, attrs: Record<string, unknown> = {}) {
  return m(
    Button,
    Object.assign({ className: `ui-button ${variant}` }, attrs),
    m("text", { class: "ui-button-label" }, text),
  );
}

function sectionTheme() {
  return section(
    "TEMA · OVERLAY",
    row(
      DemoButton(state.theme === "luna-dark" ? "Tema claro" : "Tema oscuro", "ui-button--secondary", {
        onClick: () => {
          state.theme = state.theme === "luna-dark" ? "luna-light" : "luna-dark";
          shim.redraw();
        },
      }),
      DemoButton("Abrir overlay", "", {
        onClick: () => { state.overlayOpen = true; shim.redraw(); },
      }),
    ),
  );
}

const Root: m.Component = {
  view() {
    // <page> is overflow:hidden in Lynx and never scrolls itself, so a
    // gallery that outgrows the viewport needs an explicit <scroll-view>
    // (see lynx-api-docs elements/scroll-view.md). The <overlay> below
    // deliberately stays OUTSIDE it: overlay renders against its own
    // screen-sized surface, and nesting it in the scroll context would put
    // it in the wrong reference frame.
    return m("view", { class: `Page ${state.theme}` }, [
      m("scroll-view", { "scroll-orientation": "vertical", class: "Scroll" }, [
      m("view", { class: "ScrollContent" }, [
      m("text", { class: "Title" }, "mithril-lynx-ui"),
      m("text", { class: "Subtitle" }, `Galería de componentes · ${state.theme}`),

      ...section(
        "BUTTON",
        row(
          DemoButton("Primario", "", { onClick: () => { state.taps++; shim.redraw(); } }),
          DemoButton("Secundario", "ui-button--secondary"),
        ),
        row(
          DemoButton("Ghost", "ui-button--ghost"),
          DemoButton("Deshabilitado", "", { disabled: true }),
        ),
        m("text", { class: "Row-note" }, `Taps en "Primario": ${state.taps}`),
      ),

      ...section(
        "SWITCH",
        row(
          m(
            Switch,
            {
              className: "ui-switch",
              checked: state.notifications,
              onChange: (v: boolean) => { state.notifications = v; shim.redraw(); },
            },
            m(SwitchTrack, { className: "ui-switch-track" }, m(SwitchThumb, { className: "ui-switch-thumb" })),
          ),
          label(state.notifications ? "Notificaciones activadas" : "Notificaciones apagadas"),
        ),
        row(
          m(
            Switch,
            { className: "ui-switch", disabled: true, defaultChecked: true },
            m(SwitchTrack, { className: "ui-switch-track" }, m(SwitchThumb, { className: "ui-switch-thumb" })),
          ),
          label("Deshabilitado"),
        ),
      ),

      ...section(
        "CHECKBOX",
        row(
          m(
            Checkbox,
            {
              className: "ui-checkbox",
              checked: state.terms,
              onChange: (v: boolean) => { state.terms = v; shim.redraw(); },
            },
            m(CheckboxIndicator, { className: "ui-checkbox-indicator" }, [
              m("text", { class: "ui-checkbox-indicator-mark" }, "✓"),
            ]),
          ),
          label("Acepto los términos"),
        ),
        row(
          m(
            Checkbox,
            {
              className: "ui-checkbox",
              indeterminate: state.partial,
              checked: state.partialChecked,
              onChange: (v: boolean) => {
                state.partialChecked = v;
                state.partial = false;
                shim.redraw();
              },
            },
            m(CheckboxIndicator, { className: "ui-checkbox-indicator" }, [
              m("text", { class: "ui-checkbox-indicator-mark" }, state.partial ? "–" : "✓"),
            ]),
          ),
          label(
            state.partial
              ? "Indeterminado (al tocar queda marcado)"
              : state.partialChecked
                ? "Resuelto a marcado"
                : "Desmarcado",
          ),
        ),
      ),

      ...section(
        "RADIO GROUP",
        m(
          RadioGroup,
          {
            value: state.plan,
            onValueChange: (v: string) => { state.plan = v; shim.redraw(); },
          },
          PLANS.map((plan) =>
            keyedRow(
              plan.value,
              m(
                Radio,
                { className: "ui-radio", value: plan.value },
                m(RadioIndicator, { className: "ui-radio-indicator" }),
              ),
              label(plan.label),
            ),
          ),
        ),
      ),

      ...section(
        "FOUNDATIONS · LUNA TOKENS",
        m(
          "view",
          { class: "Swatches" },
          TOKENS.map((token) =>
            m("view", { class: "Swatch", key: token.name }, [
              m("view", { class: `Swatch-chip Swatch-chip--${token.modifier}` }),
              m("text", { class: "Swatch-label" }, token.name),
            ]),
          ),
        ),
      ),

      ...section(
        "SLIDER",
        m("text", { class: "Row-note" }, `volumen: ${Math.round(state.volume * 100)}%`),
        m(
          SliderRoot,
          {
            className: "SliderRow",
            value: state.volume,
            onValueChange: (v: number | [number, number]) => { state.volume = v as number; shim.redraw(); },
          },
          m(SliderTrack, { className: "ui-slider-track" }, [
            m(SliderIndicator, { className: "ui-slider-indicator" }),
            m(SliderThumb, { className: "ui-slider-thumb" }),
          ]),
        ),
        m(
          "text",
          { class: "Row-note" },
          `rango: ${Math.round(state.range[0] * 100)}% – ${Math.round(state.range[1] * 100)}%`,
        ),
        m(
          SliderRoot,
          {
            className: "SliderRow",
            value: state.range,
            onValueChange: (v: number | [number, number]) => { state.range = v as [number, number]; shim.redraw(); },
          },
          m(SliderTrack, { className: "ui-slider-track" }, [
            m(SliderIndicator, { className: "ui-slider-indicator" }),
            m(SliderThumb, { className: "ui-slider-thumb", index: 0 }),
            m(SliderThumb, { className: "ui-slider-thumb", index: 1 }),
          ]),
        ),
      ),

      ...section(
        "DRAGGABLE",
        m("view", { class: "DragTrack" }, [
          m(
            Draggable,
            {
              className: "ui-draggable DragHandle",
              // "immediate" rather than the longpress default, so the demo
              // reacts to a plain swipe.
              trigger: "immediate",
              allowedDirection: "all",
              minTranslateX: 0,
              maxTranslateX: 200,
              minTranslateY: 0,
              maxTranslateY: 0,
              onDragging: (t: { x: number; y: number }) => { state.drag = t; shim.redraw(); },
            },
            m("text", { class: "DragHandle-label" }, "arrástrame"),
          ),
        ]),
        m("text", { class: "Row-note" }, `x: ${Math.round(state.drag.x)}px (tope 200)`),
      ),

      ...section(
        "SWIPE ACTION",
        m(
          "text",
          { class: "Row-note" },
          state.swipeItems.length === 0
            ? "(sin elementos — recarga para reiniciar la demo)"
            : `${state.swipeItems.length} elemento(s) — desliza una fila a la izquierda`,
        ),
        m(
          "view",
          { class: "SwipeList" },
          state.swipeItems.map((label) =>
            m(SwipeAction, {
              key: label,
              className: "SwipeRow",
              estimatedActionAreaSize: 72,
              displayArea: m("view", { class: "SwipeRow-display" }, m("text", { class: "SwipeRow-label" }, label)),
              actionArea: m("text", { class: "SwipeRow-actionLabel" }, "Eliminar"),
              onSwipeStart: () => { state.swipeLog.push(`inicio: ${label}`); shim.redraw(); },
              onAction: () => {
                state.swipeItems = state.swipeItems.filter((item) => item !== label);
                state.swipeLog.push(`eliminado: ${label}`);
                shim.redraw();
              },
            }),
          ),
        ),
        m(
          "text",
          { class: "Row-note" },
          state.swipeLog.length === 0 ? "sin eventos aún" : state.swipeLog.slice(-3).join(" · "),
        ),
      ),

      // SORTABLE was disabled here for a while (not deleted) after mounting
      // any real SortableItem/Draggable instance appeared to corrupt
      // something that then made SwipeAction's own redraw crash on its next
      // swipe. Root-caused (2026-09-12) as the same `Array.prototype.at()`
      // gap that broke FORM below: this section's own `sortLog.at(-1)`
      // — only reachable once a drag actually completes — was the real
      // crash, not a core mithril-lynx bug (see sortable.js's header and
      // AGENTS.md). Fixed and re-verified end to end on device (drag to
      // reorder, then swipe-delete a SwipeAction row on the same page,
      // both clean) — re-enabled for real.
      ...section(
        "SORTABLE",
        m("text", { class: "Row-note" }, "mantén presionado y arrastra para reordenar"),
        m(
          "view",
          { class: "SortableList" },
          m(SortableRoot, {
            data: state.sortableItems.map((item) => ({ getSortingKey: () => item.id, dataItem: item })),
            onSortStart: () => { state.sortLog.push("inicio de arrastre"); shim.redraw(); },
            // SortableRoot's declared type is Component<SortableRootAttrs<unknown>>
            // (Mithril's Component type doesn't preserve a call-site generic), so
            // the callback's own item shape is asserted here rather than inferred.
            onSortEnd: (sorted: unknown[]) => {
              state.sortableItems = (sorted as { dataItem: { id: string; label: string } }[]).map((d) => d.dataItem);
              state.sortLog.push(`orden: ${state.sortableItems.map((i) => i.label).join(" › ")}`);
              shim.redraw();
            },
            children: (item: { getSortingKey: () => string; dataItem: unknown }) =>
              m(
                SortableItem,
                { className: "ui-sortable SortableRow", sortingKey: item.getSortingKey() },
                m("text", { class: "SortableRow-label" }, (item.dataItem as { label: string }).label),
              ),
          }),
        ),
        m(
          "text",
          { class: "Row-note" },
          state.sortLog.length === 0 ? "sin eventos aún" : state.sortLog[state.sortLog.length - 1],
        ),
      ),

      ...section(
        "INPUT · TEXTAREA",
        m(Input, {
          className: "ui-input",
          placeholder: "Tu nombre",
          maxLength: 20,
          value: state.nombre,
          inputRef: nombreRef,
          onInput: (v: string) => { state.nombre = v; shim.redraw(); },
        }),
        // Controlled: what shows below can only track what was typed if the
        // round trip through state actually works.
        m(
          "text",
          { class: "Row-note" },
          state.nombre === "" ? "(vacío)" : `valor: "${state.nombre}" · ${state.nombre.length}/20`,
        ),
        row(
          DemoButton("Enfocar", "ui-button--secondary", {
            onClick: () => { void nombreRef.focus?.(); },
          }),
          DemoButton("Limpiar", "ui-button--ghost", {
            onClick: () => { state.nombre = ""; shim.redraw(); },
          }),
        ),
        m(TextArea, {
          className: "ui-textarea",
          placeholder: "Notas (multilínea)",
          maxLines: 4,
          onInput: (v: string) => { state.notas = v; shim.redraw(); },
        }),
        m("text", { class: "Row-note" }, `notas: ${state.notas.length} caracteres`),
      ),

      ...section(
        "PRESENCE",
        row(
          DemoButton(state.card ? "Ocultar tarjeta" : "Mostrar tarjeta", "", {
            onClick: () => { state.card = !state.card; shim.redraw(); },
          }),
        ),
        // The leave animation is why the card is still mounted after `show`
        // goes false — that is the whole contract Presence exists for.
        m(
          Presence,
          {
            show: state.card,
            onOpen: () => { state.presenceLog.push("onOpen"); shim.redraw(); },
            onClose: () => { state.presenceLog.push("onClose"); shim.redraw(); },
          },
          m(PresenceContent, { className: "PresenceCard ui-presence-scale" }, [
            m("text", { class: "PresenceCard-title" }, "Tarjeta animada"),
            m(
              "text",
              { class: "PresenceCard-text" },
              "Entra y sale con animación; Presence la mantiene montada hasta que la de salida termina.",
            ),
          ]),
        ),
        m(
          "text",
          { class: "Row-note" },
          state.presenceLog.length === 0 ? "sin eventos aún" : state.presenceLog.join(" · "),
        ),
      ),

      ...section(
        "LAZY COMPONENT",
        m("text", { class: "Row-note" }, "el contenido de abajo se carga al hacer scroll hasta aquí"),
        m(
          LazyComponent,
          {
            pid: "lazy-demo-1",
            scene: "gallery",
            className: "ui-lazy-component LazyBox",
            estimatedStyle: { width: "100%", height: "72px" },
            onAppear: () => { state.lazyLog.push("cargado (una vez)"); shim.redraw(); },
          },
          m("view", { class: "LazyBox-content" }, m("text", { class: "LazyBox-text" }, "Contenido cargado de forma perezosa")),
        ),
        m("text", { class: "Row-note" }, "con unmountOnExit: se descarga otra vez al salir de pantalla"),
        m(
          LazyComponent,
          {
            pid: "lazy-demo-2",
            scene: "gallery",
            className: "ui-lazy-component LazyBox",
            estimatedStyle: { width: "100%", height: "72px" },
            unmountOnExit: true,
            onAppear: () => { state.lazyLog.push("apareció (unmountOnExit)"); shim.redraw(); },
            onDisappear: () => { state.lazyLog.push("descargado (unmountOnExit)"); shim.redraw(); },
          },
          m("view", { class: "LazyBox-content" }, m("text", { class: "LazyBox-text" }, "Este se descarga al salir")),
        ),
        m(
          "text",
          { class: "Row-note" },
          state.lazyLog.length === 0 ? "sin eventos aún" : state.lazyLog.slice(-3).join(" · "),
        ),
      ),

      ...section(
        "FORM",
        m(
          FormRoot,
          {
            initialValues: { plan: "mensual" },
            onChanged: (v: Record<string, unknown>) => { state.formLog.push(JSON.stringify(v)); shim.redraw(); },
            onSubmit: (v: Record<string, unknown>) => { state.formSubmitted = v; shim.redraw(); },
          },
          [
            m(FormField, { as: "Input", name: "nombre", className: "ui-input", placeholder: "Tu nombre" }),
            row(
              m(FormField, { as: "Checkbox", name: "terminos", className: "ui-checkbox" }, m(CheckboxIndicator, { className: "ui-checkbox-indicator" }, m("text", { class: "ui-checkbox-indicator-mark" }, "✓"))),
              label("Acepto los términos"),
            ),
            row(
              m(FormField, { as: "Switch", name: "boletin", className: "ui-switch" }, [m(SwitchTrack, { className: "ui-switch-track" }, m(SwitchThumb, { className: "ui-switch-thumb" }))]),
              label("Recibir boletín"),
            ),
            m(FormField, { as: "RadioGroupRoot", name: "plan" }, [
              row(m(Radio, { className: "ui-radio", value: "mensual" }, m(RadioIndicator, { className: "ui-radio-indicator" })), label("Mensual")),
              row(m(Radio, { className: "ui-radio", value: "anual" }, m(RadioIndicator, { className: "ui-radio-indicator" })), label("Anual")),
            ]),
            row(m(FormSubmitButton, { className: "ui-button" }, m("text", { class: "ui-button-label" }, "Enviar"))),
          ],
        ),
        // `.at(-1)` (ES2022), not `[len-1]`, was the ORIGINAL page-wide crash
        // here: the Lynx main-thread QuickJS engine doesn't implement
        // Array.prototype.at, so the very first call — only reachable once
        // formLog actually has an entry, i.e. only after a real field change
        // — threw "TypeError: not a function" INSIDE this Root.view() call,
        // which broke that entire redraw (and looked, from a tap on ANY
        // other component afterward, like the whole page had broken).
        // Confirmed via mithril-lynx core's own callHook (temporarily
        // instrumented to dump the throwing hook's identity): the crashing
        // vnode had tagKeys=["view"], thisLength=0 and attrs=undefined —
        // uniquely matching this Root component itself (recreated via a bare
        // `Vnode(rootComponent)` on every redraw, which is why attrs is
        // undefined here specifically). SORTABLE's own now-disabled section
        // below had the exact same `.at(-1)` pattern on `sortLog` — likely
        // the same root cause, not necessarily the separate core bug its
        // header describes; worth re-checking before assuming that one is
        // still real.
        m("text", { class: "Row-note" }, state.formLog.length === 0 ? "sin cambios aún" : state.formLog[state.formLog.length - 1]),
        m("text", { class: "Row-note" }, state.formSubmitted == null ? "sin enviar aún" : `enviado: ${JSON.stringify(state.formSubmitted)}`),
      ),

      ...section(
        "DIALOG",
        m(
          DialogRoot,
          {
            onOpen: () => { state.dialogLog.push("onOpen"); shim.redraw(); },
            onClose: () => { state.dialogLog.push("onClose"); shim.redraw(); },
          },
          [
            m(DialogTrigger, { className: "ui-button" }, m("text", { class: "ui-button-label" }, "Abrir diálogo")),
            m(DialogView, {}, [
              m(DialogBackdrop, { className: "ui-dialog-backdrop", transition: true }),
              m(DialogContent, { className: "ui-dialog-content", transition: true }, [
                m("text", { class: "PresenceCard-title" }, "¿Confirmas la acción?"),
                m(
                  "text",
                  { class: "PresenceCard-text" },
                  "El backdrop y el contenido animan como un solo grupo — ambos deben terminar antes de que onClose se dispare.",
                ),
                row(
                  m(DialogClose, { className: "ui-button ui-button--secondary" }, m("text", { class: "ui-button-label" }, "Cancelar")),
                  m(DialogClose, { className: "ui-button" }, m("text", { class: "ui-button-label" }, "Confirmar")),
                ),
              ]),
            ]),
          ],
        ),
        m("text", { class: "Row-note" }, state.dialogLog.length === 0 ? "sin eventos aún" : state.dialogLog.join(" · ")),
      ),

      ...section(
        "INPUT OTP",
        m(
          InputOTP,
          {
            className: "ui-input-otp",
            length: 4,
            onChange: (v: string) => { state.otpValue = v; state.otpLog.push(`onChange: ${v}`); shim.redraw(); },
            onComplete: (v: string) => { state.otpLog.push(`onComplete: ${v}`); shim.redraw(); },
          },
          [0, 1, 2, 3].map((i) => m(InputOTPSlot, { key: i, index: i, className: "ui-input-otp-slot" })),
        ),
        m("text", { class: "Row-note" }, `valor: ${state.otpValue || "(vacío)"}`),
        m("text", { class: "Row-note" }, state.otpLog.length === 0 ? "sin eventos aún" : state.otpLog[state.otpLog.length - 1]),
      ),

      ...section(
        "LIST",
        // A fixed height, not `100%`/unbounded: this List is itself a
        // natively-scrolling element nested inside the page's own outer
        // <scroll-view> — without a bounded height it would either collapse
        // to zero or fight the outer scroll for the gesture.
        m(List, {
          className: "ListBox",
          style: { width: "100%", height: "260px" },
          items: state.listItems,
          mainAxisGap: 1,
          listRef: listRef,
          renderItem: (item: { id: string; label: string }) =>
            m("view", { class: "ListRow" }, m("text", { class: "ListRow-label" }, item.label)),
          itemKey: (item: { id: string; label: string }) => item.id,
        }),
        row(
          DemoButton("Ir al final", "ui-button--secondary", {
            onClick: () => { void listRef.scrollTo?.(state.listItems.length - 1, { smooth: true }); },
          }),
          DemoButton("Agregar", "ui-button--ghost", {
            onClick: () => {
              state.listItems = [...state.listItems, { id: String(state.listItems.length), label: `Elemento ${state.listItems.length + 1}` }];
              shim.redraw();
            },
          }),
        ),
        m("text", { class: "Row-note" }, `${state.listItems.length} elementos — desliza dentro del recuadro para probar el reciclado nativo`),
      ),

      ...section(
        "FEED LIST",
        m("text", { class: "Row-note" }, "arrastra hacia abajo para refrescar (nativo); desplázate hasta el final para cargar más"),
        m(FeedList, {
          className: "ListBox",
          style: { width: "100%", height: "260px" },
          items: state.feedItems,
          mainAxisGap: 1,
          listId: "demoFeed",
          listRef: feedListRef,
          refreshOptions: {
            enableRefresh: true,
            headerContent: m(
              "view",
              { class: "FeedRefreshHeader" },
              m("text", { class: "FeedRefreshHeader-text" }, state.feedRefreshing ? "Actualizando…" : "Suelta para actualizar"),
            ),
            onStartRefresh: () => {
              state.feedRefreshing = true;
              state.feedLog.push("onStartRefresh");
              shim.redraw();
              // Simulated network reload — real usage would fetch here and
              // call finishRefresh() from that promise's own resolution.
              //
              // Appended, deliberately NOT prepended: core mithril-lynx's
              // createList() (list.js) only diffs a count INCREASE as new
              // items at the END (setItemCount has no notion of where items
              // logically moved) — confirmed on device, prepending here
              // left the already-bound first cell showing its OLD content
              // instead of the new item. A real app hitting this needs
              // either append-only feeds or a core list.js enhancement for
              // arbitrary insert positions; out of scope for this component.
              setTimeout(() => {
                state.feedItems = [...state.feedItems, { id: `new-${Date.now()}`, label: "Publicación nueva" }];
                state.feedRefreshing = false;
                state.feedLog.push("finishRefresh");
                shim.redraw();
                void feedListRef.finishRefresh?.();
              }, 800);
            },
          },
          onLoadMore: () => {
            state.feedLog.push("onLoadMore");
            shim.redraw();
            setTimeout(() => {
              state.feedLoadCount += 1;
              const base = state.feedItems.length;
              state.feedItems = [
                ...state.feedItems,
                ...Array.from({ length: 5 }, (_, i) => ({ id: String(base + i), label: `Publicación ${base + i + 1}` })),
              ];
              // Demo cap so "no hay más" is actually reachable in the gallery.
              if (state.feedLoadCount >= 2) void feedListRef.changeHasMoreStatus?.(false);
              shim.redraw();
            }, 600);
          },
          loadMoreFooter: () => m("view", { class: "ui-feed-list-footer" }, m("text", { class: "ui-feed-list-footer-text" }, "Cargando más…")),
          noMoreDataFooter: () => m("view", { class: "ui-feed-list-footer" }, m("text", { class: "ui-feed-list-footer-text" }, "No hay más publicaciones")),
          renderItem: (item: { id: string; label: string }) =>
            m("view", { class: "ListRow" }, m("text", { class: "ListRow-label" }, item.label)),
          itemKey: (item: { id: string; label: string }) => item.id,
        }),
        row(
          DemoButton("Actualizar manualmente", "ui-button--secondary", {
            // A real finger's drag-then-release on the header is the normal
            // trigger, but a nested scroll-view inside this gallery page
            // competes with <refresh>'s own touch handling for the SAME
            // gesture (confirmed on device: an ADB-simulated pull from the
            // box's very top edge scrolled the OUTER page instead of
            // reaching <refresh>'s pull detection) — this button exercises
            // the exact same imperative path (native autoStartRefresh)
            // without depending on winning that gesture-priority race.
            onClick: () => { void feedListRef.startRefresh?.(); },
          }),
        ),
        m("text", { class: "Row-note" }, state.feedLog.length === 0 ? "sin eventos aún" : state.feedLog.slice(-3).join(" · ")),
      ),

      ...section(
        "SHEET",
        row(
          ...(["bottom", "top", "left", "right"] as SheetSide[]).map((side) =>
            DemoButton(side, side === state.sheetSide ? "" : "ui-button--secondary", {
              onClick: () => { state.sheetSide = side; shim.redraw(); },
            }),
          ),
        ),
        m(
          SheetRoot,
          {
            side: state.sheetSide,
            onOpen: () => { state.sheetLog.push("onOpen"); shim.redraw(); },
            onClose: () => { state.sheetLog.push("onClose"); shim.redraw(); },
          },
          [
            m(SheetTrigger, { className: "ui-button" }, m("text", { class: "ui-button-label" }, "Abrir sheet")),
            m(SheetView, {}, [
              m(SheetBackdrop, { className: "ui-sheet-backdrop", transition: true }),
              m(
                SheetContent,
                {
                  className: "ui-sheet-content",
                  transition: true,
                  innerStyle: state.sheetSide === "left" || state.sheetSide === "right" ? { width: "260px", height: "100%" } : { width: "100%" },
                },
                [
                  state.sheetSide === "bottom" || state.sheetSide === "top"
                    ? m("view", { style: { display: "flex", "justify-content": "center", "margin-bottom": "12px" } }, m(SheetHandle, {}))
                    : null,
                  m("text", { class: "PresenceCard-title" }, "Arrástrame para cerrar"),
                  m(
                    "text",
                    { class: "PresenceCard-text" },
                    `Entra desde "${state.sheetSide}". Arrastra hacia el borde de cierre o toca el fondo.`,
                  ),
                  row(m(SheetClose, { className: "ui-button" }, m("text", { class: "ui-button-label" }, "Cerrar"))),
                ],
              ),
            ]),
          ],
        ),
        m("text", { class: "Row-note" }, state.sheetLog.length === 0 ? "sin eventos aún" : state.sheetLog.join(" · ")),
      ),

      ...section(
        "POPOVER",
        row(
          ...(["top", "bottom", "left", "right"] as PopoverPlacement[]).map((placement) =>
            DemoButton(placement, placement === state.popoverPlacement ? "" : "ui-button--secondary", {
              onClick: () => { state.popoverPlacement = placement; shim.redraw(); },
            }),
          ),
        ),
        m(
          PopoverRoot,
          {
            onOpen: () => { state.popoverLog.push("onOpen"); shim.redraw(); },
            onClose: () => { state.popoverLog.push("onClose"); shim.redraw(); },
          },
          [
            m(PopoverBackdrop, {}),
            m(PopoverTrigger, { className: "ui-button" }, m("text", { class: "ui-button-label" }, "Abrir popover")),
            m(
              PopoverPositioner,
              { placement: state.popoverPlacement, placementOffset: 8 },
              [
                m(PopoverContent, { className: "ui-popover-content", transition: true }, [
                  m("text", { class: "PresenceCard-text" }, `Posicionado: ${state.popoverPlacement}`),
                ]),
                m(PopoverArrow, { size: 8, color: "var(--paper, #fff)" }),
              ],
            ),
          ],
        ),
        m("text", { class: "Row-note" }, state.popoverLog.length === 0 ? "sin eventos aún" : state.popoverLog.join(" · ")),
      ),

      ...section(
        "SWIPER",
        m(Swiper, {
          className: "ui-swiper",
          items: state.swiperItems,
          itemWidth: 280,
          itemHeight: 140,
          containerWidth: 280,
          duration: 300,
          swiperRef,
          onChange: (index: number) => { state.swiperIndex = index; shim.redraw(); },
          onSwipeStart: () => { state.swiperLog.push("start"); shim.redraw(); },
          onSwipeEnd: () => { state.swiperLog.push("end"); shim.redraw(); },
          renderItem: (item: string, index: number) =>
            m(
              "view",
              { style: { width: "100%", height: "100%", display: "flex", "align-items": "center", "justify-content": "center", "background-color": index % 2 === 0 ? "#e0e0e0" : "#5b5b5b" } },
              m("text", { class: "PresenceCard-title", style: { color: index % 2 === 0 ? "#000" : "#fff" } }, item),
            ),
        }),
        row(
          DemoButton("Anterior", "ui-button--secondary", { onClick: () => swiperRef.swipePrev?.() }),
          DemoButton("Siguiente", "ui-button--secondary", { onClick: () => swiperRef.swipeNext?.() }),
        ),
        m("text", { class: "Row-note" }, `Índice: ${state.swiperIndex + 1} / ${state.swiperItems.length}`),
        m("text", { class: "Row-note" }, state.swiperLog.length === 0 ? "sin eventos de swipe aún" : state.swiperLog.slice(-3).join(" · ")),
      ),

      ...sectionTheme(),
      ]),
      ]),
      // <overlay> takes no layout space where it's authored and renders its
      // first child against a screen-sized surface. `visible` drives it;
      // binddismissoverlay keeps our state in sync with a native dismissal.
      m(
        "overlay",
        {
          // Not a plain boolean — see nativeBool()'s header.
          visible: nativeBool(state.overlayOpen),
          binddismissoverlay: () => { state.overlayOpen = false; shim.redraw(); },
        },
        m("view", { class: "Overlay-scrim" }, [
          m("view", { class: "Overlay-panel" }, [
            m("text", { class: "Overlay-title" }, "Native <overlay>"),
            m(
              "text",
              { class: "Overlay-text" },
              "Renderizado sobre la página por el camino genérico de elementos del shim — sin portal.",
            ),
            DemoButton("Cerrar", "", {
              onClick: () => { state.overlayOpen = false; shim.redraw(); },
            }),
          ]),
        ]),
      ),
    ]);
  },
};

export default { Root, root: () => m(Root) };
