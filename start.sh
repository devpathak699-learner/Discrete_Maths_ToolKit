#!/usr/bin/env bash
# macOS / Linux launcher for the Node.js version.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js was not found on this computer."
  echo "  Install it from https://nodejs.org/ and run this script again."
  echo
  exit 1
fi

echo "Starting the Discrete Math Toolkit..."
exec node server.js --open
