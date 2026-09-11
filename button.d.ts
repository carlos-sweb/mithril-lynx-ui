// Ambient declaration for the ESM button.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

/** State handed to a scoped-slot child (a function passed as the single child). */
export interface ButtonRenderProps {
  /** Pressed AND interactive — false whenever `disabled` is true. */
  active: boolean;
  disabled: boolean;
}

export interface ButtonAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Defaults to false. When true the button never activates and never fires onClick. */
  disabled?: boolean;
  onClick?: () => void;
  /** Extra raw <view> attributes, spread onto the root element (lynx-ui's `buttonProps`). */
  buttonProps?: Record<string, unknown>;
}

export declare const Button: Component<ButtonAttrs>;
