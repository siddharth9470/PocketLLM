#!/usr/bin/env bash
# Assemble a signed release APK for sideloading on a physical device.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/android"

./gradlew assembleRelease

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
echo ""
echo "Release APK ready:"
ls -lh "$APK"
