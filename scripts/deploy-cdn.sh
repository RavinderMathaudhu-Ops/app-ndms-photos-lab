#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Azure Front Door Premium Deployment — Private Link to Blob Storage
# Shared profile for all OCIO microsites
# ─────────────────────────────────────────────────────────────
# Prerequisites:
#   1. az login (authenticated)
#   2. PIM: Activate Owner/Contributor on OCIO-OPS-APPServices
#   3. Correct subscription: az account set -s 19fdddbe-...
#
# Network: All resources use Private Endpoints (PEP/VNet).
# Front Door Premium connects to blob storage via Private Link.
# CDN Classic (Standard_Microsoft) is deprecated — new profiles
# must use Front Door Standard or Premium.
# ─────────────────────────────────────────────────────────────

set -e
export MSYS_NO_PATHCONV=1

RG="rg-ocio-microsites-eus2-01"
CDN_PROFILE="cdn-ociomicro-premium-eus2-01"
STORAGE_ACCOUNT="stociomicroeus201"
STORAGE_RID="/subscriptions/19fdddbe-e7b0-4d2c-aa4d-509a0ab6af96/resourceGroups/rg-ocio-microsites-eus2-01/providers/Microsoft.Storage/storageAccounts/stociomicroeus201"
CONTAINER="aspr-photos"

echo "=== Step 1: Create shared Front Door Premium profile ==="
echo "  (Premium required for Private Link origins)"
az afd profile create \
  --profile-name "$CDN_PROFILE" \
  --resource-group "$RG" \
  --sku Premium_AzureFrontDoor

echo ""
echo "=== Step 2: Create ASPR Photos endpoint ==="
az afd endpoint create \
  --endpoint-name cdn-asprphotos \
  --profile-name "$CDN_PROFILE" \
  --resource-group "$RG"

echo ""
echo "=== Step 3: Create origin group ==="
az afd origin-group create \
  --origin-group-name og-asprphotos \
  --profile-name "$CDN_PROFILE" \
  --resource-group "$RG" \
  --probe-request-type HEAD \
  --probe-protocol Https \
  --probe-interval-in-seconds 120 \
  --sample-size 4 \
  --successful-samples-required 3 \
  --additional-latency-in-milliseconds 50

echo ""
echo "=== Step 4: Create origin with Private Link to blob storage ==="
az afd origin create \
  --origin-name origin-blob-asprphotos \
  --origin-group-name og-asprphotos \
  --profile-name "$CDN_PROFILE" \
  --resource-group "$RG" \
  --host-name "${STORAGE_ACCOUNT}.blob.core.windows.net" \
  --origin-host-header "${STORAGE_ACCOUNT}.blob.core.windows.net" \
  --http-port 80 \
  --https-port 443 \
  --priority 1 \
  --weight 1000 \
  --enabled-state Enabled \
  --enforce-certificate-name-check true \
  --enable-private-link true \
  --private-link-resource "$STORAGE_RID" \
  --private-link-location eastus2 \
  --private-link-request-message "Front Door CDN for ASPR Photos renditions" \
  --private-link-sub-resource-type blob

echo ""
echo "=== Step 5: Create route (HTTPS only, HTTP->HTTPS redirect) ==="
az afd route create \
  --route-name route-asprphotos \
  --endpoint-name cdn-asprphotos \
  --profile-name "$CDN_PROFILE" \
  --resource-group "$RG" \
  --origin-group og-asprphotos \
  --origin-path "/aspr-photos" \
  --supported-protocols Https Http \
  --https-redirect Enabled \
  --forwarding-protocol HttpsOnly \
  --patterns-to-match "/renditions/*" \
  --link-to-default-domain Enabled

echo ""
echo "=== Step 6: Verify ==="
HOSTNAME=$(az afd endpoint show \
  --endpoint-name cdn-asprphotos \
  --profile-name "$CDN_PROFILE" \
  --resource-group "$RG" \
  --query "hostName" -o tsv)

echo ""
echo "=================================================="
echo "  Front Door Premium deployed!"
echo "  Endpoint: https://${HOSTNAME}"
echo "=================================================="
echo ""
echo "IMPORTANT: Approve the Private Link connection!"
echo "  1. Azure Portal -> Storage Account -> stociomicroeus201"
echo "  2. Networking -> Private endpoint connections"
echo "  3. Find the pending connection from Front Door and APPROVE it"
echo ""
echo "Then set the env var:"
echo "  IMAGE_CDN_URL=https://${HOSTNAME}"
echo ""
echo "Add to Azure App Service config:"
echo "  az webapp config appsettings set --name app-aspr-photos --resource-group $RG \\"
echo "    --settings IMAGE_CDN_URL=https://\${HOSTNAME}"
