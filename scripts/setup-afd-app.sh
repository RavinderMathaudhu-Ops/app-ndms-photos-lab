#!/bin/bash
# =============================================================================
# Azure Front Door — Route App Service behind AFD (Premium)
# =============================================================================
# Puts ONLY app-aspr-photos behind AFD. No impact on other apps on the plan.
#
# Prerequisites:
#   - az CLI logged in with sufficient permissions
#   - PIM role activated if needed
#   - Front Door profile cdn-ociomicro-premium-eus2-01 already exists
#
# Run from Git Bash on Windows with MSYS_NO_PATHCONV=1 prefix on each command
# =============================================================================

set -euo pipefail

RG="rg-ocio-microsites-eus2-01"
AFD_PROFILE="cdn-ociomicro-premium-eus2-01"
SUBSCRIPTION="19fdddbe-e7b0-4d2c-aa4d-509a0ab6af96"
APP_NAME="app-aspr-photos"
ENDPOINT_NAME="cdn-asprphotos-app"
OG_NAME="og-asprphotos-app"
ORIGIN_NAME="origin-app-asprphotos"
ROUTE_NAME="route-app-asprphotos"
LOCATION="eastus2"

echo "=== Step 1: Get Front Door Profile ID (needed for access restriction) ==="
AFD_ID=$(MSYS_NO_PATHCONV=1 az afd profile show \
  --resource-group "$RG" \
  --profile-name "$AFD_PROFILE" \
  --query "frontDoorId" -o tsv)
echo "Front Door ID: $AFD_ID"

echo ""
echo "=== Step 2: Create Origin Group for App Service ==="
MSYS_NO_PATHCONV=1 az afd origin-group create \
  --resource-group "$RG" \
  --profile-name "$AFD_PROFILE" \
  --origin-group-name "$OG_NAME" \
  --probe-request-type GET \
  --probe-protocol Https \
  --probe-interval-in-seconds 30 \
  --probe-path "/api/health" \
  --sample-size 4 \
  --successful-samples-required 3 \
  --additional-latency-in-milliseconds 50

echo ""
echo "=== Step 3: Create Origin with Private Link to App Service ==="
MSYS_NO_PATHCONV=1 az afd origin create \
  --resource-group "$RG" \
  --profile-name "$AFD_PROFILE" \
  --origin-group-name "$OG_NAME" \
  --origin-name "$ORIGIN_NAME" \
  --host-name "${APP_NAME}.azurewebsites.net" \
  --origin-host-header "${APP_NAME}.azurewebsites.net" \
  --http-port 80 \
  --https-port 443 \
  --priority 1 \
  --weight 1000 \
  --enable-private-link true \
  --private-link-resource "/subscriptions/${SUBSCRIPTION}/resourceGroups/${RG}/providers/Microsoft.Web/sites/${APP_NAME}" \
  --private-link-location "$LOCATION" \
  --private-link-request-message "AFD origin for ASPR Photos app" \
  --private-link-sub-resource-type "sites"

echo ""
echo "=== Step 4: Create AFD Endpoint ==="
MSYS_NO_PATHCONV=1 az afd endpoint create \
  --resource-group "$RG" \
  --profile-name "$AFD_PROFILE" \
  --endpoint-name "$ENDPOINT_NAME" \
  --enabled-state Enabled

echo ""
echo "=== Step 5: Create Route (all traffic → App Service) ==="
MSYS_NO_PATHCONV=1 az afd route create \
  --resource-group "$RG" \
  --profile-name "$AFD_PROFILE" \
  --endpoint-name "$ENDPOINT_NAME" \
  --route-name "$ROUTE_NAME" \
  --origin-group "$OG_NAME" \
  --supported-protocols Https \
  --https-redirect Enabled \
  --patterns-to-match "/*" \
  --forwarding-protocol HttpsOnly \
  --link-to-default-domain Enabled

echo ""
echo "=== Step 6: Enable WAF with managed ruleset ==="
# Create WAF policy
MSYS_NO_PATHCONV=1 az network front-door waf-policy create \
  --resource-group "$RG" \
  --name "wafAsprPhotos" \
  --sku Premium_AzureFrontDoor \
  --mode Prevention

# Add OWASP 3.2 managed ruleset
MSYS_NO_PATHCONV=1 az network front-door waf-policy managed-rules add \
  --resource-group "$RG" \
  --policy-name "wafAsprPhotos" \
  --type Microsoft_DefaultRuleSet \
  --version "2.1" \
  --action Block

# Add bot protection ruleset
MSYS_NO_PATHCONV=1 az network front-door waf-policy managed-rules add \
  --resource-group "$RG" \
  --policy-name "wafAsprPhotos" \
  --type Microsoft_BotManagerRuleSet \
  --version "1.0" \
  --action Block

# Get WAF policy ID
WAF_ID=$(MSYS_NO_PATHCONV=1 az network front-door waf-policy show \
  --resource-group "$RG" \
  --name "wafAsprPhotos" \
  --query "id" -o tsv)

# Associate WAF policy with the endpoint's security policy
MSYS_NO_PATHCONV=1 az afd security-policy create \
  --resource-group "$RG" \
  --profile-name "$AFD_PROFILE" \
  --security-policy-name "secpol-asprphotos-app" \
  --domains "/subscriptions/${SUBSCRIPTION}/resourceGroups/${RG}/providers/Microsoft.Cdn/profiles/${AFD_PROFILE}/afdEndpoints/${ENDPOINT_NAME}" \
  --waf-policy "$WAF_ID"

echo ""
echo "=== Step 7: Lock down App Service to AFD-only traffic ==="
MSYS_NO_PATHCONV=1 az webapp config access-restriction add \
  --resource-group "$RG" \
  --name "$APP_NAME" \
  --priority 100 \
  --rule-name "AllowFrontDoor" \
  --service-tag AzureFrontDoor.Backend \
  --http-header x-azure-fdid="$AFD_ID"

# Deny all other traffic (default deny is implicit once a rule exists)
echo ""
echo "============================================================"
echo "DONE! Next steps:"
echo "============================================================"
echo ""
echo "1. APPROVE PRIVATE LINK CONNECTION:"
echo "   Azure Portal → App Service (app-aspr-photos)"
echo "   → Networking → Private Endpoint connections → Approve"
echo ""
echo "2. TEST via AFD endpoint:"
echo "   https://${ENDPOINT_NAME}-<hash>.a01.azurefd.net/api/health"
echo "   (Get exact URL from: az afd endpoint show -g $RG --profile-name $AFD_PROFILE --endpoint-name $ENDPOINT_NAME --query hostName -o tsv)"
echo ""
echo "3. VERIFY direct access is blocked:"
echo "   https://${APP_NAME}.azurewebsites.net should return 403"
echo ""
echo "4. (Optional) ADD CUSTOM DOMAIN:"
echo "   az afd custom-domain create --resource-group $RG --profile-name $AFD_PROFILE --custom-domain-name photos-aspr --host-name photos.aspr.hhs.gov --certificate-type ManagedCertificate"
echo ""
