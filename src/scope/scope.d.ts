// Ambient declaration for the ESM scope.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril-runtime";

export interface Scope<T> {
  /** Renders its children, making `value` available to any descendant's useScope() call. */
  Provider: Component<{ value: T }>;
  /** Reads the nearest enclosing Provider's current value, or undefined if none is mounted. */
  useScope(): T | undefined;
}

export function createScope<T>(): Scope<T>;
