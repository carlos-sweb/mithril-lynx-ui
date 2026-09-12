# AGENTS.md

Guidance for AI agents working in this repo (`mithril-lynx-ui`, a component
library for `mithril-lynx` apps). Read this before writing or debugging any
component or demo code here.

## Runtime constraint: the Lynx main-thread JS engine is QuickJS, not V8

Component code (and the demo app) runs inside Lynx's main-thread JS engine,
which is QuickJS-based — **not** a browser or Node.js engine. Do not assume
full modern JS/Array/Object API coverage just because it works in tests
(`@rstest/core` + jsdom run on Node's V8, which is far more complete) or in
day-to-day editor tooling.

**Confirmed missing: `Array.prototype.at()`** (ES2022). Calling it throws a
generic `TypeError: not a function` at the call site — the native backtrace
gives almost no clue this is an API-support gap rather than a framework bug
(it just shows `at view (...)` or similar, with no deeper frame). This is
exactly what caused two real, previously-mysterious page-wide crashes in this
project (documented in `sortable.js`'s header and this project's memory):
tapping a Form field or completing a Sortable drag both eventually called
`someArray.at(-1)` in demo code to show "the last log entry" — fine on every
render until that array actually got its first item, at which point it
crashed, and because the crash happened mid-redraw it looked like the
*entire* page's interactivity had broken (even taps on long-stable, unrelated
components started failing afterward).

**Use `arr[arr.length - 1]` instead of `arr.at(-1)`.** More generally: negative-index generation on 
methods that support it via a plain SUBTRACTION (or that predate ES2022, like `.slice(-N)`, which IS 
fine and already used in this codebase) are safe; `.at()` specifically is not. If you reach for a newer 
Array/Object/String method you haven't seen used elsewhere in this codebase already, verify it against a 
real device build before assuming it works — the jsdom test suite will NOT catch this class of bug (it 
runs on Node's V8, and passed cleanly for the two bugs above).

## Verifying on a real device

This repo's own `demo/` + `demo-android/` is the way to catch this class of
bug at all:

1. `cd demo && npx rspeedy build --mode development` (unminified — gives
   readable stack traces via `adb logcat`; `--mode production` for a final
   sanity check once something works).
2. `cp demo/dist/main-thread.bundle demo-android/app/src/main/assets/main-thread.bundle`
3. `cd demo-android && ./gradlew installDebug`
4. `adb shell am force-stop com.carlossweb.mithrillynxui && adb shell am start -W com.carlossweb.mithrillynxui/.MainActivity`
5. Interact via `adb shell input tap/swipe ...`, inspect with
   `adb exec-out screencap -p`, and check `adb logcat -d | grep "not a function"`
   (or whatever error class you're chasing) after each interaction.

A passing `rstest` suite is necessary but not sufficient — it only proves the
logic is correct against a jsdom polyfill of Lynx's PAPI, not that every JS
API you used actually exists on the real engine.

## Other established project conventions

- Real source research before porting: read the actual published
  `@lynx-js/lynx-ui-*` package source (`npm pack`) before assuming what a
  component does from its name or docs — several components in this project
  turned out not to need Main Thread Scripting at all, contrary to the
  original plan's assumptions, once the real source was read.
- `scope.js`'s `createScope()` is this project's React-Context substitute;
  `useScope()` is only valid from a component's own `view()`, not from
  `oncreate`/`onupdate` (see that file's header for why and the workaround).
- See `README.md`'s "Native element interop" section for the other
  documented on-device traps (attribute stringification/booleans, opt-in
  xelement Maven artifacts, single-copy-of-mithril-lynx aliasing).
