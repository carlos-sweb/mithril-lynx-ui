// Ambient declaration for the ESM presence.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril-runtime";

export declare const PresenceState: {
  readonly Initial: 0;
  readonly Entering: 1;
  readonly DelayedEntering: 2;
  readonly Entered: 3;
  readonly Leaving: 4;
  readonly Left: 5;
};

export type PresenceStateValue = 0 | 1 | 2 | 3 | 4 | 5;

/** The flags a caller reasons about, derived from the internal state. */
export interface PresenceStatus {
  entering: boolean;
  leaving: boolean;
  /** Entering or leaving — i.e. an animation should be running. */
  animating: boolean;
  open: boolean;
  closed: boolean;
}

export interface PresenceApi {
  status: PresenceStatus;
  /** The six animation/transition listeners the state machine needs. Spread onto the animated element. */
  animationAttrs: Record<string, () => void>;
}

export interface PresenceAttrs {
  /** Drives the whole machine: true enters, false leaves (and unmounts once the leave animation ends). */
  show?: boolean;
  /** Keep children mounted even while closed. */
  forceMount?: boolean;
  /** Defer the enter one extra beat, so content lays out before it animates. */
  enableDelay?: boolean;
  /** Stay "open" while leaving, so a group's children don't vanish early. */
  grouped?: boolean;
  /** Externally controlled state; pair with setPresenceState. */
  state?: PresenceStateValue;
  setPresenceState?: (state: PresenceStateValue) => void;
  /** Fires once the enter animation has finished. */
  onOpen?: () => void;
  /** Fires once the leave animation has finished and the content unmounted. */
  onClose?: () => void;
}

export interface PresenceContentAttrs {
  className?: string;
  style?: Record<string, string | number>;
}

export declare const Presence: Component<PresenceAttrs>;
export declare const PresenceContent: Component<PresenceContentAttrs>;

/** Reads the enclosing Presence's api, for hand-rolled animated parts. */
export declare function usePresence(): PresenceApi | undefined;
export declare function resolveAnimationStatus(
  state: PresenceStateValue,
  enableDelay?: boolean,
  grouped?: boolean,
): PresenceStatus;
export declare function presenceClasses(status: PresenceStatus, className?: string): string;
