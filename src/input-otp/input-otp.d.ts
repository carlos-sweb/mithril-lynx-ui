// Ambient declaration for the ESM input-otp.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

export type InputOTPInputType = "alphabetic" | "numeric" | "alphanumeric";

export interface InputOTPRenderProps {
  value: string;
  length: number;
  inputType: InputOTPInputType;
  focused: boolean;
  complete: boolean;
  disabled: boolean;
  invalid: boolean;
}

export interface InputOTPSlotRenderProps {
  index: number;
  char?: string;
  /** True only for the one slot that shows the fake caret. */
  focused: boolean;
  filled: boolean;
  complete: boolean;
  disabled: boolean;
  invalid: boolean;
}

/** Imperative handle, filled in on mount. Pass a plain object as `inputRef`. */
export interface InputOTPRef {
  focus(): Promise<void>;
  blur(): Promise<void>;
  /** Unsupported characters are discarded. In controlled mode this only requests the change via onChange. */
  setValue(value: string): Promise<void>;
  clear(): Promise<void>;
  getValue(): string;
}

export interface InputOTPAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Positive integer; invalid values fall back to 6. @defaultValue 6 */
  length?: number;
  /** @defaultValue "numeric" */
  inputType?: InputOTPInputType;
  /** Controlled value. Characters outside inputType are discarded. */
  value?: string;
  /** Initial value in uncontrolled mode. */
  defaultValue?: string;
  /** Focus the hidden input after mounting. @defaultValue false */
  autoFocus?: boolean;
  /** @defaultValue false */
  disabled?: boolean;
  /** Exposes the ui-invalid variant and the render props' `invalid` flag. @defaultValue false */
  invalid?: boolean;
  /** InputOTPSlot children, or a function receiving the field state. InputOTP does not create slots automatically. */
  children?: unknown | ((state: InputOTPRenderProps) => unknown);
  onChange?: (value: string) => void;
  /** Fires once, when the value transitions from incomplete to complete. */
  onComplete?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** A plain object to receive the imperative API on mount. */
  inputRef?: Partial<InputOTPRef>;
  /** Extra raw attributes spread onto the hidden native input. */
  inputProps?: Record<string, unknown>;
}

export interface InputOTPSlotAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Zero-based index into the enclosing InputOTP's value. */
  index: number;
  /** Custom slot content — a function receives the slot state. Omit for the default character + fake-caret rendering. */
  children?: unknown | ((state: InputOTPSlotRenderProps) => unknown);
}

export declare const InputOTP: Component<InputOTPAttrs>;
export declare const InputOTPSlot: Component<InputOTPSlotAttrs>;

/** Reads the enclosing InputOTP's render props — for custom slot content built outside InputOTPSlot. */
export declare function useInputOTPContext(): InputOTPRenderProps;
