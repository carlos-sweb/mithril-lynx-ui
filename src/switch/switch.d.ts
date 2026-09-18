// Ambient declaration for the ESM switch.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril-runtime";

/** State handed to a scoped-slot child, and read by SwitchTrack/SwitchThumb. */
export interface SwitchRenderProps {
  checked: boolean;
  /** Pressed AND interactive — false whenever `disabled` is true. */
  active: boolean;
  disabled: boolean;
}

export interface SwitchAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Supplying this makes the Switch controlled; `defaultChecked` is then ignored. */
  checked?: boolean;
  /** Initial state in uncontrolled mode. Defaults to false. */
  defaultChecked?: boolean;
  /** Defaults to false. When true the Switch never activates and never toggles. */
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  /** Extra raw <view> attributes, spread onto the root element (lynx-ui's `switchProps`). */
  switchProps?: Record<string, unknown>;
}

export interface SwitchPartAttrs {
  className?: string;
  style?: Record<string, string | number>;
}

export declare const Switch: Component<SwitchAttrs>;
export declare const SwitchTrack: Component<SwitchPartAttrs>;
export declare const SwitchThumb: Component<SwitchPartAttrs>;
