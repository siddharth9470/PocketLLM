#!/usr/bin/env bash
# Rebuild Android native modules (op-sqlite, llama.rn, etc.) for all ABIs.
# Use when you see: "Base module not found. Did you do a pod install/clear the gradle cache?"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Cleaning stale Android native build artifacts..."

rm -rf \
  "$ROOT/node_modules/@op-engineering/op-sqlite/android/.cxx" \
  "$ROOT/node_modules/@op-engineering/op-sqlite/android/build" \
  "$ROOT/node_modules/llama.rn/android/.cxx" \
  "$ROOT/node_modules/llama.rn/android/build" \
  "$ROOT/android/app/build" \
  "$ROOT/android/build"

cd "$ROOT/android"
./gradlew clean :op-engineering_op-sqlite:externalNativeBuildDebug :app:assembleDebug

echo "Native rebuild complete. Install with: npm run android"
