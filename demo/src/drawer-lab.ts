import m from "mithril";
import shim from "mithril-lynx";
import { DrawerBackdrop, DrawerContent, DrawerRoot, DrawerView } from "mithril-lynx-ui/drawer";

import "./drawer-lab.css";

// Minimal isolation harness for investigating drawer.js's own animation —
// a single plain <text> trigger (not DrawerTrigger/Button, to remove any
// press-state visuals from the picture), a white page, and nothing else on
// screen. DrawerRoot is used in CONTROLLED mode here (not the uncontrolled
// default) so this file owns `open` directly — the same open/close call
// sites the real gallery uses, just without a second component (Button) in
// between.

const state = { open: false };

function setOpen(next: boolean) {
  state.open = next;
  shim.redraw();
}

const Root = {
  view: () =>
    m("view", { class: "luna-light Lab" }, [
      m("text", { class: "Lab-trigger", ontap: () => setOpen(true) }, "Abrir drawer"),

      m(
        DrawerRoot,
        { show: state.open, onShowChange: setOpen },
        m(DrawerView, {}, [
          m(DrawerBackdrop, { transition: true }),
          m(DrawerContent, { className: "ui-drawer-content", transition: true }, [
            m("text", { class: "Lab-title" }, "Drawer"),
            m("text", { class: "Lab-trigger", ontap: () => setOpen(false) }, "Cerrar"),
          ]),
        ]),
      ),
    ]),
};

export default { Root, root: () => m(Root) };
