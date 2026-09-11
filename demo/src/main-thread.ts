import { setupApp } from "mithril-lynx/main-thread";
import app from "./index.js";

// This gallery has no business logic and no network calls, so there's no
// sibling background.ts and nothing to sync across threads —
// enableBackgroundSync: false keeps setupApp from wiring a channel to a
// background bundle that doesn't exist. (indicadores-app leaves it on
// precisely because it does fetch from there.)
setupApp({ root: app.root, enableBackgroundSync: false });
