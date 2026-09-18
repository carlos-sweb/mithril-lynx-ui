// Ambient declaration for the ESM form.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

export interface FormApi {
  getValue(name: string): unknown;
  getAllValues(): Record<string, unknown>;
  /** Internal — seeds a field's starting value. Never call from application code. */
  registerField(name: string, initialValue: unknown): void;
  onChanged(name: string, value: unknown): void;
  unregisterField(name: string): void;
  submit(): void;
}

/** Only valid from view(), same as scope.js's own useScope(). */
export declare function useForm(): FormApi;

export interface FormRootAttrs {
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void;
  /** Not called for a FormField's own initial registration — only for real, later changes. */
  onChanged?: (values: Record<string, unknown>) => void;
}

interface FormFieldCommonAttrs {
  className?: string;
  style?: Record<string, string | number>;
  name: string;
  onChanged?: (value: unknown) => void;
}

export type FormFieldAttrs =
  | (FormFieldCommonAttrs & { as: "Input" | "TextArea"; placeholder?: string; maxLength?: number })
  | (FormFieldCommonAttrs & { as: "Checkbox" | "Switch"; disabled?: boolean })
  | (FormFieldCommonAttrs & { as: "RadioGroupRoot" });

export interface FormSubmitButtonAttrs {
  className?: string;
  style?: Record<string, string | number>;
  disabled?: boolean;
  /** Called after the form's own internal submit logic, with the full form data. */
  onSubmit?: (values: Record<string, unknown>) => void;
}

export declare const FormRoot: Component<FormRootAttrs>;
export declare const FormField: Component<FormFieldAttrs>;
export declare const FormSubmitButton: Component<FormSubmitButtonAttrs>;
