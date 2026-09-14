import { setupApp } from "mithril-lynx/main-thread";
import app from "./drawer-lab.js";

// Same reasoning as main-thread.ts: no background.ts, nothing to sync.
setupApp({ root: app.root, enableBackgroundSync: false });
