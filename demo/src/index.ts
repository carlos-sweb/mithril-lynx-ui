import m from "mithril";
import shim from "mithril-lynx";
import { nativeBool } from "mithril-lynx-ui/native";

import { Button } from "mithril-lynx-ui/button";
import { Checkbox, CheckboxIndicator } from "mithril-lynx-ui/checkbox";
import { Radio, RadioGroup, RadioIndicator } from "mithril-lynx-ui/radio-group";
import { Draggable } from "mithril-lynx-ui/draggable";
import { Input, TextArea } from "mithril-lynx-ui/input";
import { LazyComponent } from "mithril-lynx-ui/lazy-component";
import { Presence, PresenceContent } from "mithril-lynx-ui/presence";
import { SliderIndicator, SliderRoot, SliderThumb, SliderTrack } from "mithril-lynx-ui/slider";
import { SortableItem, SortableRoot } from "mithril-lynx-ui/sortable";
import { SwipeAction } from "mithril-lynx-ui/swipe-action";
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
};

// Filled in on mount by <Input>; the Mithril stand-in for useImperativeHandle.
const nombreRef: Record<string, () => Promise<unknown>> = {};

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

      // SORTABLE is disabled here, not deleted: mounting any real
      // SortableItem/Draggable instance on this page — even a single one,
      // even completely untouched — corrupts something that then makes
      // SwipeAction's OWN redraw crash on its next swipe, the exact same
      // "TypeError: not a function inside a later view()" signature already
      // confirmed for Sortable's own gestures. Confirmed by bisection: with
      // `data: []` (SortableRoot mounted, zero items) SwipeAction is fine;
      // with any items mounted, SwipeAction breaks. So this isn't just "not
      // device-verified" — right now it actively regresses an
      // already-shipped, working component just by sharing the page with
      // it. Re-enable only once the core bug documented in sortable.js's
      // header is actually fixed.
      ...(false ? section(
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
          state.sortLog.length === 0 ? "sin eventos aún" : state.sortLog.at(-1),
        ),
      ) : []),

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
