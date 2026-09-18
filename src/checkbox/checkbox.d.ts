// Ambient declaration for the ESM checkbox.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

/** State handed to a scoped-slot child. */
export interface CheckboxRenderProps {
  checked: boolean;
  indeterminate: boolean;
}

export interface CheckboxAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Supplying this makes the Checkbox controlled; `defaultChecked` is then ignored. */
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  /** Tri-state. Tapping an indeterminate Checkbox resolves it to checked, it does not toggle. */
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  /** Extra raw <view> attributes, forwarded to the underlying Button's root. */
  checkboxProps?: Record<string, unknown>;
}

export interface CheckboxIndicatorAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Render children even when neither checked nor indeterminate. Defaults to false. */
  forceMount?: boolean;
}

export declare const Checkbox: Component<CheckboxAttrs>;
export declare const CheckboxIndicator: Component<CheckboxIndicatorAttrs>;
