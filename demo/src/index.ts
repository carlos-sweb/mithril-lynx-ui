import m from "mithril";
import shim from "mithril-lynx";

import { Button } from "mithril-lynx-ui/button";
import { Checkbox, CheckboxIndicator } from "mithril-lynx-ui/checkbox";
import { Radio, RadioGroup, RadioIndicator } from "mithril-lynx-ui/radio-group";
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
  plan: "mensual",
  taps: 0,
};

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

function DemoButton(text: string, variant: string, attrs: Record<string, unknown> = {}) {
  return m(
    Button,
    Object.assign({ className: `ui-button ${variant}` }, attrs),
    m("text", { class: "ui-button-label" }, text),
  );
}

const Root: m.Component = {
  view() {
    return m("view", { class: `Page ${state.theme}` }, [
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
            { className: "ui-checkbox", indeterminate: true },
            m(CheckboxIndicator, { className: "ui-checkbox-indicator" }, [
              m("text", { class: "ui-checkbox-indicator-mark" }, "–"),
            ]),
          ),
          label("Indeterminado (al tocar queda marcado)"),
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
            row(
              m(
                Radio,
                { className: "ui-radio", value: plan.value, key: plan.value },
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
      ),

      // <overlay> takes no layout space where it's authored and renders its
      // first child against a screen-sized surface. `visible` drives it;
      // binddismissoverlay keeps our state in sync with a native dismissal.
      m(
        "overlay",
        {
          visible: state.overlayOpen,
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
