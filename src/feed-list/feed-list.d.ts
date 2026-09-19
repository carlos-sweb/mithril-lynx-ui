// Ambient declaration for the ESM feed-list.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";
import type { ListAttrs } from "../list/list.js";

/** Imperative handle, filled in on mount. Pass a plain object as `listRef`. */
export interface FeedListRef {
  scrollTo(index: number, options?: { smooth?: boolean; offset?: number; alignTo?: "top" | "bottom" | "middle" }): Promise<{ code: number; data: unknown }>;
  /** Programmatically enters the refreshing state (native `autoStartRefresh`). No-op if `refreshOptions` is falsy. */
  startRefresh(): Promise<unknown>;
  /** Ends the refreshing state (native `finishRefresh`). Always call this once your reload settles, success or failure. */
  finishRefresh(): Promise<unknown>;
}

export interface FeedListRefreshOptions {
  enableRefresh: boolean;
  /** Rendered inside the native `<refresh-header>`. */
  headerContent?: unknown;
  onStartRefresh?(e: { triggeredBy: "startRefresh" | "drag" }): void;
  /** `offset` is in pixels once the header's real height has been measured; 0 before that. */
  onRefreshOffsetChange?(e: { offset: number; headerSize: number; isDragging: boolean }): void;
  /** `state`: 0 idle, 1 over-drag-release, 2 refreshing — passed through verbatim from native. */
  onRefreshStateChange?(e: { state: number }): void;
}

export interface FeedListAttrs<T = unknown> extends Omit<ListAttrs<T>, "listRef"> {
  /** Distinguishes this feed's exposure/refresh nodes from any other on the same page. @defaultValue "feedList" */
  listId?: string;
  /** `true` for a bare native pull-to-refresh with no header content, an options object for header content + callbacks, or omitted/`false` to disable refresh entirely. */
  refreshOptions?: boolean | FeedListRefreshOptions;
  /** A plain object to receive the imperative API on mount. */
  listRef?: Partial<FeedListRef>;
}

export declare const FeedList: Component<FeedListAttrs>;
