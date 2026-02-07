#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Run Photo Management Migration via Kudu Command API
# ─────────────────────────────────────────────────────────────
# Azure SQL is VNet-restricted. This script uploads and runs
# the migration from inside the App Service via Kudu.
#
# Prerequisites:
#   1. az login (authenticated)
#   2. PIM: Activate role on OCIO-OPS-APPServices
# ─────────────────────────────────────────────────────────────

set -e

APP="app-aspr-photos"
KUDU="https://${APP}.scm.azurewebsites.net"
SCRIPT="migrate-photo-mgmt.js"
SCRIPT_PATH="scripts/${SCRIPT}"

echo "=== Step 1: Clean /tmp on App Service ==="
az rest --method POST --uri "${KUDU}/api/command" \
  --body "{\"command\": \"rm -rf /tmp/node_modules /tmp/package-lock.json /tmp/package.json /tmp/${SCRIPT}\", \"dir\": \"/tmp\"}" \
  --resource "https://management.azure.com/"

echo "=== Step 2: Install tedious in /tmp ==="
az rest --method POST --uri "${KUDU}/api/command" \
  --body '{"command": "npm init -y && npm install tedious", "dir": "/tmp"}' \
  --resource "https://management.azure.com/"

echo "=== Step 3: Upload migration script via Kudu VFS ==="
TOKEN=$(az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)
curl -s -X PUT "${KUDU}/api/vfs/tmp/${SCRIPT}" \
  -H "If-Match: *" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@${SCRIPT_PATH}" \
  -H "Authorization: Bearer ${TOKEN}"

echo ""
echo "=== Step 4: Copy from /home/tmp to /tmp ==="
az rest --method POST --uri "${KUDU}/api/command" \
  --body "{\"command\": \"cp /home/tmp/${SCRIPT} /tmp/${SCRIPT}\"}" \
  --resource "https://management.azure.com/"

echo "=== Step 5: Run migration ==="
RESULT=$(az rest --method POST --uri "${KUDU}/api/command" \
  --body "{\"command\": \"node ${SCRIPT}\", \"dir\": \"/tmp\"}" \
  --resource "https://management.azure.com/" \
  -o json)

echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Output','(no output)'))" 2>/dev/null || echo "$RESULT"

echo ""
echo "=== Done ==="
