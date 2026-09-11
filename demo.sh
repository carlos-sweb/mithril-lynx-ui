#!/usr/bin/env bash
# Build the gallery bundle, drop it into the demo host's assets, install and
# launch it on the connected device. The one command used to verify every
# component on real hardware (project plan, Phase 9).
set -euo pipefail
cd "$(dirname "$0")"

npm --prefix demo run build
mkdir -p demo-android/app/src/main/assets
cp demo/dist/main-thread.bundle demo-android/app/src/main/assets/main-thread.bundle

(cd demo-android && ./gradlew --quiet installDebug)

adb shell am force-stop com.carlossweb.mithrillynxui
adb shell am start -W -n com.carlossweb.mithrillynxui/.MainActivity | grep -E "TotalTime|LaunchState"
