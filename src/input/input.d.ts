// Ambient declaration for the ESM input.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

/** Imperative handle, filled in on mount. Pass a plain object as `inputRef`.
 * Backed by mithril-lynx's element methods: no `id` needed. */
export interface InputRef {
  focus(): Promise<unknown>;
  blur(): Promise<unknown>;
  /** Sets the text through the element's `value` (sent with the next patch). */
  setValue(value: string): Promise<void>;
  getValue(): Promise<{ value: string; selectionStart: number; selectionEnd: number; isComposing?: boolean }>;
  setSelectionRange(start: number, end: number): Promise<unknown>;
}

export interface FieldAttrs {
  id?: string;
  className?: string;
  style?: Record<string, string | number>;
  placeholder?: string;
  /** Defaults to false. Adds `ui-readonly` alongside the native attribute. */
  readonly?: boolean;
  /** Defaults to 140, matching lynx-ui. */
  maxLength?: number;
  confirmType?: "send" | "search" | "go" | "next" | "done";
  inputFilter?: string;
  /** Defaults to true. */
  showSoftInputOnFocus?: boolean;
  /** Controlled value: sent to the native editor (setValue) whenever it differs from what the field holds. `null` clears it. Omit for uncontrolled. */
  value?: string;
  /** Initial value for an uncontrolled field; ignored once `value` is supplied. */
  defaultValue?: string;
  onInput?: (value: string, selectionStart: number, selectionEnd: number, isComposing: boolean) => void;
  onFocus?: (value: string) => void;
  onBlur?: (value: string) => void;
  onConfirm?: (value: string) => void;
  onSelectionChange?: (selectionStart: number, selectionEnd: number) => void;
  /** A plain object to receive the imperative API on mount. */
  inputRef?: Partial<InputRef>;
  /** Extra raw attributes spread onto the native element. */
  inputProps?: Record<string, unknown>;
}

export interface InputAttrs extends FieldAttrs {
  /** Native keyboard type. Defaults to "text". */
  type?: "text" | "number" | "digit" | "email" | "tel" | "password";
}

export interface TextAreaAttrs extends FieldAttrs {
  maxLines?: number;
}

export declare const Input: Component<InputAttrs>;
export declare const TextArea: Component<TextAreaAttrs>;
