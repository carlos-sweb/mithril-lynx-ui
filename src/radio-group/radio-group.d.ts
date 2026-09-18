// Ambient declaration for the ESM radio-group.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril-runtime";

/** State handed to a RadioGroup scoped-slot child. */
export interface RadioGroupRenderProps {
  value: string | null;
  disabled: boolean;
}

export interface RadioGroupAttrs {
  /** Supplying this makes the group controlled; `defaultValue` is then ignored. */
  value?: string | null;
  defaultValue?: string | null;
  /** Disables every Radio in the group. */
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}

export interface RadioAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Identifies this Radio within its group. Selected when it equals the group's value. */
  value: string;
  /** Disables this Radio only; the group's own `disabled` also applies. */
  disabled?: boolean;
  /** Extra raw <view> attributes, forwarded to the underlying Button's root. */
  radioProps?: Record<string, unknown>;
}

export interface RadioIndicatorAttrs {
  className?: string;
  style?: Record<string, string | number>;
  forceMount?: boolean;
}

/** Renders no element of its own — pure coordination around its children. */
export declare const RadioGroup: Component<RadioGroupAttrs>;
export declare const Radio: Component<RadioAttrs>;
export declare const RadioIndicator: Component<RadioIndicatorAttrs>;
