#!/bin/bash
# AppImage wrapper — fixes SUID sandbox issue
HERE="$(dirname "$(readlink -f "${0}")")"
export ELECTRON_DISABLE_SANDBOX=1
exec "${HERE}/smshub-desktop" --no-sandbox "$@"
