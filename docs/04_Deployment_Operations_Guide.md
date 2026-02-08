# Deployment & Operations Guide

**ASPR Photo Repository Application**

| Field | Value |
|---|---|
| System Name | ASPR Photo Repository |
| Document Version | 2.0 |
| Last Updated | 2026-02-07 |
| Owner | HHS ASPR / Leidos |

---

## 1. Overview

### 1.1 System Summary

The ASPR Photo Repository is a Next.js 16 web application deployed on Azure App Service behind Azure Front Door Premium. It provides secure photo upload capabilities for ASPR incident response field teams and a full-featured admin dashboard for photo management, tagging, bulk operations, and review. The system uses Azure SQL Database for metadata storage, Azure Blob Storage for photo files with multi-rendition CDN delivery, and Azure Front Door with WAF for edge security and caching.

### 1.2 Deployment Model

```
GitHub (main branch)
       │
       ▼ (push trigger)
GitHub Actions CI/CD
       │
       ├── npm ci
       ├── npm run build (standalone)
       ├── Upload artifact (.next/standalone + static + public)
       │
       ▼
Azure Front Door Premium (WAF + CDN)
       │
       ├── cdn-asprphotos-app endpoint
       │      └── Private Link → App Service (app-aspr-photos, Linux Node.js 22)
       │
       └── cdn-asprphotos endpoint
              └── Private Link → Blob Storage (stociomicroeus201)
                                        │
Azure VNet ─────────────────────────────┤
       ├── Private Endpoint → Azure SQL Database (Entra ID managed identity)
       ├── Private Endpoint → Azure Blob Storage (connection string)
       ├── Private Endpoint → Azure Key Vault (ASPRPHOTOS-- prefixed secrets)
       └── Private Endpoint → App Service (SCM for deploy)
```

### 1.3 Architecture Overview

| Component | Azure Resource | Purpose |
|---|---|---|
| CDN / WAF | Azure Front Door Premium (cdn-ociomicro-premium-eus2-01) | Edge security, caching, SSL termination |
| WAF Policy | wafAsprPhotos | OWASP 3.2 + Bot Manager, Prevention mode |
| Web Application | App Service (app-aspr-photos, Linux) | Hosts Next.js standalone server |
| Database | Azure SQL Database | 8 tables + 1 view for photos, sessions, tags, audit |
| File Storage | Azure Blob Storage (stociomicroeus201) | aspr-photos container (originals + renditions) |
| Secrets | Azure Key Vault (kv-ociomicro-eus2-01) | ASPRPHOTOS-- prefixed secrets |
| Identity | System-assigned Managed Identity | Passwordless SQL and Key Vault access |
| Network | Azure VNet + Private Endpoints | Isolates all backend resources |

---

## 2. Prerequisites

### 2.1 Azure Resources

| Resource | Required | Notes |
|---|---|---|
| Azure Subscription | Yes | OCIO-OPS-APPServices (19fdddbe-e7b0-4d2c-aa4d-509a0ab6af96) |
| Resource Group | Yes | rg-ocio-microsites-eus2-01 |
| App Service Plan | Yes | Linux, Node.js 22 |
| Azure SQL Server | Yes | With Entra ID admin configured |
| Azure SQL Database | Yes | Single database |
| Storage Account | Yes | General purpose v2, with aspr-photos container |
| Key Vault | Yes | kv-ociomicro-eus2-01 (shared across microsites) |
| Front Door Premium | Yes | cdn-ociomicro-premium-eus2-01 (shared profile) |
| VNet | Yes | With private endpoint subnets |

### 2.2 Local Development Requirements

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 22.x LTS | Runtime |
| npm | 10.x+ | Package manager |
| Git | Latest | Version control |
| Azure CLI | Latest | Azure resource management |
| GitHub CLI (gh) | Latest | CI/CD and repository management |

---

## 3. Environment Configuration

### 3.1 Required Environment Variables

| Variable | Description | Example | Required |
|---|---|---|---|
| `JWT_SECRET` | Secret key for JWT signing | (32+ random chars) | Yes |
| `ADMIN_TOKEN` | Admin authentication token | (32+ random chars) | Yes |
| `SQL_SERVER` | Azure SQL server hostname | `server.database.windows.net` | Yes |
| `SQL_DATABASE` | Database name | `aspr-photos-db` | Yes |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob Storage connection string | `DefaultEndpointsProtocol=https;...` | Yes |
| `IMAGE_CDN_URL` | Front Door CDN base URL for blob renditions | `https://cdn-asprphotos-gkfzbjf6fpf3azcw.a01.azurefd.net` | Yes |

### 3.2 OIDC Identity Provider Variables

| Variable | Description | Required |
|---|---|---|
| `AUTH_SECRET` | Auth.js session encryption secret (32+ random chars) | Yes (for SSO) |
| `AZURE_AD_CLIENT_ID` | Entra ID app registration client ID | Yes (for SSO) |
| `AZURE_AD_CLIENT_SECRET` | Entra ID app registration client secret | Yes (for SSO) |
| `AZURE_AD_TENANT_ID` | HHS Entra ID tenant ID | Yes (for SSO) |
| `LOGINGOV_CLIENT_ID` | Login.gov OIDC client ID | For Login.gov |
| `LOGINGOV_PRIVATE_KEY` | Login.gov `private_key_jwt` PEM key | For Login.gov |
| `IDME_CLIENT_ID` | ID.me OIDC client ID | For ID.me |
| `IDME_CLIENT_SECRET` | ID.me OIDC client secret | For ID.me |

### 3.3 Optional Environment Variables

| Variable | Description | Default |
|---|---|---|
| `SQL_USERNAME` | SQL username (dev only) | N/A (uses Entra ID in production) |
| `SQL_PASSWORD` | SQL password (dev only) | N/A (uses Entra ID in production) |
| `IMAGE_SIGNING_KEY` | HMAC key for signed URLs | Falls back to JWT_SECRET |
| `NODE_ENV` | Runtime environment | `production` on App Service |

### 3.4 Key Vault Secret Management

All runtime secrets are stored in Azure Key Vault with the `ASPRPHOTOS--` prefix (shared KV across microsites):

| Key Vault Secret Name | Maps To |
|---|---|
| `ASPRPHOTOS--JWT-SECRET` | JWT_SECRET |
| `ASPRPHOTOS--ADMIN-TOKEN` | ADMIN_TOKEN |
| `ASPRPHOTOS--AUTH-SECRET` | AUTH_SECRET |
| `ASPRPHOTOS--AZURE-AD-CLIENT-SECRET` | AZURE_AD_CLIENT_SECRET |

**Workflow for updating secrets:**
1. PIM activate privileged role
2. Enable Key Vault public access (disabled by default)
3. Add or update secrets via Azure CLI or Portal
4. Disable Key Vault public access
5. Restart App Service to pick up new values

### 3.5 Setting Environment Variables in Azure

```bash
# Via Azure CLI
MSYS_NO_PATHCONV=1 az webapp config appsettings set \
  --resource-group rg-ocio-microsites-eus2-01 \
  --name app-aspr-photos \
  --settings \
    JWT_SECRET="@Microsoft.KeyVault(SecretUri=...)" \
    ADMIN_TOKEN="@Microsoft.KeyVault(SecretUri=...)" \
    SQL_SERVER="server.database.windows.net" \
    SQL_DATABASE="aspr-photos-db" \
    AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=..." \
    IMAGE_CDN_URL="https://cdn-asprphotos-gkfzbjf6fpf3azcw.a01.azurefd.net"
```

---

## 4. Azure Front Door Setup

### 4.1 Shared CDN Profile

The Front Door Premium profile is shared across all OCIO microsites:

| Property | Value |
|---|---|
| Profile Name | cdn-ociomicro-premium-eus2-01 |
| SKU | Premium_AzureFrontDoor |
| Front Door ID | 91523752-5871-42ed-9e27-031fc6f5eb86 |

### 4.2 Blob CDN Endpoint (Photo Renditions)

| Property | Value |
|---|---|
| Endpoint | cdn-asprphotos |
| Hostname | cdn-asprphotos-gkfzbjf6fpf3azcw.a01.azurefd.net |
| Origin Group | og-asprphotos |
| Origin | origin-blob-asprphotos → stociomicroeus201.blob.core.windows.net |
| Origin Type | Private Link to Blob Storage (sub-resource: `blob`) |
| Route | route-asprphotos, pattern `/renditions/*`, HTTPS-only |

### 4.3 App CDN Endpoint (Application)

| Property | Value |
|---|---|
| Endpoint | cdn-asprphotos-app |
| Hostname | cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net |
| Origin Group | og-asprphotos-app |
| Origin | origin-app-asprphotos → app-aspr-photos.azurewebsites.net |
| Origin Type | Private Link to App Service |
| Route | route-app-asprphotos, pattern `/*`, HTTPS-only |

### 4.4 WAF Policy

| Property | Value |
|---|---|
| Policy Name | wafAsprPhotos |
| Mode | Prevention |
| Managed Rules | Microsoft_DefaultRuleSet 2.1 (OWASP CRS 3.2), Microsoft_BotManagerRuleSet 1.1 |
| Security Policy | secpol-asprphotos-app → cdn-asprphotos-app endpoint |

### 4.5 Health Probe

| Property | Value |
|---|---|
| Path | `/api/health` |
| Protocol | HTTPS |
| Interval | 30 seconds |
| Method | HEAD |

### 4.6 Private Link Approval

After creating Front Door origins with Private Link, you must approve the pending Private Endpoint connections:

```bash
# List pending private endpoint connections for App Service
MSYS_NO_PATHCONV=1 az network private-endpoint-connection list \
  --resource-group rg-ocio-microsites-eus2-01 \
  --name app-aspr-photos \
  --type Microsoft.Web/sites

# Approve the connection
MSYS_NO_PATHCONV=1 az network private-endpoint-connection approve \
  --resource-group rg-ocio-microsites-eus2-01 \
  --name <connection-name> \
  --description "Approved for Front Door"

# Repeat for Blob Storage
MSYS_NO_PATHCONV=1 az network private-endpoint-connection list \
  --resource-group rg-ocio-microsites-eus2-01 \
  --name stociomicroeus201 \
  --type Microsoft.Storage/storageAccounts
```

**Important:** Private Link propagation takes 10–15 minutes after approval before Front Door can route traffic to the origin.

### 4.7 Deployment Scripts

Two helper scripts automate the Front Door setup:

| Script | Purpose |
|---|---|
| `scripts/deploy-cdn.sh` | Creates blob CDN endpoint, origin group, Private Link origin, route |
| `scripts/setup-afd-app.sh` | Creates app CDN endpoint, origin group, Private Link origin, route, WAF, security policy, health probe |

---

## 5. Database Setup

### 5.1 Full Schema (8 Tables + 1 View)

Connect to Azure SQL via Kudu (see §5.2) and execute the migration script, or trigger it via the post-deploy migration endpoint.

**Core Tables:**

```sql
-- Upload sessions
CREATE TABLE upload_sessions (
    id          NVARCHAR(36)  NOT NULL DEFAULT NEWID() PRIMARY KEY,
    pin         NVARCHAR(72)  NOT NULL,
    team_name   NVARCHAR(255) NOT NULL,
    is_active   BIT           NOT NULL DEFAULT 1,
    created_at  DATETIME      NOT NULL DEFAULT GETDATE(),
    expires_at  DATETIME      NOT NULL
);

-- Photos (expanded)
CREATE TABLE photos (
    id            NVARCHAR(36)   NOT NULL PRIMARY KEY,
    session_id    NVARCHAR(36)   NOT NULL REFERENCES upload_sessions(id),
    file_name     NVARCHAR(255)  NOT NULL,
    blob_url      NVARCHAR(MAX)  NOT NULL,
    file_size     BIGINT         NOT NULL,
    width         INT            NULL,
    height        INT            NULL,
    mime_type     NVARCHAR(50)   NULL,
    latitude      FLOAT          NULL,
    longitude     FLOAT          NULL,
    location_name NVARCHAR(255)  NULL,
    notes         NVARCHAR(1000) NULL,
    incident_id   NVARCHAR(50)   NULL,
    status        NVARCHAR(20)   NULL DEFAULT 'pending',
    storage_tier  NVARCHAR(20)   NULL DEFAULT 'hot',
    date_taken    DATETIME       NULL,
    camera_info   NVARCHAR(255)  NULL,
    batch_id      NVARCHAR(36)   NULL,
    created_at    DATETIME       NOT NULL DEFAULT GETDATE(),
    updated_at    DATETIME       NULL,
    updated_by    NVARCHAR(255)  NULL
);
```

**Supporting Tables:**

```sql
-- Photo renditions (multi-size variants)
CREATE TABLE photo_renditions (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    photo_id     NVARCHAR(36)  NOT NULL REFERENCES photos(id),
    variant_type NVARCHAR(20)  NOT NULL,  -- 'thumb_sm', 'thumb_md', 'web'
    blob_path    NVARCHAR(500) NOT NULL,
    width        INT           NULL,
    height       INT           NULL,
    file_size    BIGINT        NULL,
    created_at   DATETIME      NOT NULL DEFAULT GETDATE()
);

-- EXIF metadata
CREATE TABLE photo_exif (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    photo_id       NVARCHAR(36) NOT NULL REFERENCES photos(id),
    camera_make    NVARCHAR(100) NULL,
    camera_model   NVARCHAR(100) NULL,
    focal_length   FLOAT         NULL,
    aperture       FLOAT         NULL,
    iso            INT           NULL,
    date_taken     DATETIME      NULL,
    gps_latitude   FLOAT         NULL,
    gps_longitude  FLOAT         NULL,
    raw_json       NVARCHAR(MAX) NULL
);

-- Tags
CREATE TABLE tags (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    name     NVARCHAR(100) NOT NULL,
    category NVARCHAR(50)  NULL,  -- 'status', 'priority', 'type', 'timeline', 'custom'
    color    NVARCHAR(20)  NULL,
    UNIQUE(name, category)
);

-- Photo-tag junction
CREATE TABLE photo_tags (
    photo_id NVARCHAR(36) NOT NULL REFERENCES photos(id),
    tag_id   INT          NOT NULL REFERENCES tags(id),
    PRIMARY KEY (photo_id, tag_id)
);

-- Photo edit history
CREATE TABLE photo_edits (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    photo_id   NVARCHAR(36)  NOT NULL REFERENCES photos(id),
    edit_type  NVARCHAR(50)  NOT NULL,  -- 'crop', 'rotate', 'annotate'
    params     NVARCHAR(MAX) NULL,       -- JSON edit parameters
    edited_by  NVARCHAR(255) NOT NULL,
    created_at DATETIME      NOT NULL DEFAULT GETDATE()
);

-- Admin audit log (immutable)
CREATE TABLE admin_audit_log (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    entity_type  NVARCHAR(50)   NOT NULL,
    entity_id    NVARCHAR(100)  NULL,
    action       NVARCHAR(50)   NOT NULL,
    performed_by NVARCHAR(255)  NOT NULL,
    ip_address   NVARCHAR(45)   NULL,
    details      NVARCHAR(MAX)  NULL,
    created_at   DATETIME       NOT NULL DEFAULT GETDATE()
);

-- Upload batches
CREATE TABLE upload_batches (
    id          NVARCHAR(36)  NOT NULL DEFAULT NEWID() PRIMARY KEY,
    session_id  NVARCHAR(36)  NULL REFERENCES upload_sessions(id),
    source      NVARCHAR(20)  NOT NULL DEFAULT 'field',  -- 'field' or 'admin'
    photo_count INT           NOT NULL DEFAULT 0,
    uploaded_by NVARCHAR(255) NULL,
    created_at  DATETIME      NOT NULL DEFAULT GETDATE()
);
```

**View:**

```sql
CREATE VIEW v_incident_summary AS
SELECT
    incident_id,
    COUNT(*)           AS photo_count,
    COUNT(DISTINCT session_id) AS team_count,
    MIN(created_at)    AS first_upload,
    MAX(created_at)    AS last_upload,
    SUM(file_size)     AS total_bytes
FROM photos
WHERE incident_id IS NOT NULL
GROUP BY incident_id;
```

**Indexes:**

```sql
CREATE INDEX IX_photos_session_id     ON photos(session_id);
CREATE INDEX IX_photos_incident_id    ON photos(incident_id);
CREATE INDEX IX_photos_created_at     ON photos(created_at DESC);
CREATE INDEX IX_photos_status         ON photos(status);
CREATE INDEX IX_photos_batch_id       ON photos(batch_id);
CREATE INDEX IX_sessions_expires      ON upload_sessions(expires_at);
CREATE INDEX IX_renditions_photo_id   ON photo_renditions(photo_id);
CREATE INDEX IX_exif_photo_id         ON photo_exif(photo_id);
CREATE INDEX IX_audit_entity          ON admin_audit_log(entity_type, entity_id);
CREATE INDEX IX_audit_created         ON admin_audit_log(created_at DESC);
```

### 5.2 Database Access (VNet Restriction)

Azure SQL is VNet-restricted and cannot be accessed directly from local machines. To run migrations:

**Option A: Post-Deploy Migration Endpoint (Recommended)**

```bash
curl -X POST https://cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net/api/admin/migrate \
  -H "x-admin-token: <ADMIN_TOKEN>"
```

The `/api/admin/migrate` endpoint runs all pending schema migrations idempotently (uses `IF NOT EXISTS` checks).

**Option B: Kudu Console**

1. Navigate to `https://app-aspr-photos.scm.azurewebsites.net/`
2. Upload migration script: `PUT /api/vfs/site/migrate.js`
3. Execute: `POST /api/command` with `{ "command": "node /home/site/migrate.js" }`
4. Cleanup: Delete the script after execution

### 5.3 PIN Column Migration

If upgrading from an earlier version where PINs were stored as plaintext:

```sql
ALTER TABLE upload_sessions ALTER COLUMN pin NVARCHAR(72) NOT NULL;
```

---

## 6. Blob Storage Setup

### 6.1 Container Creation

The application automatically creates the `aspr-photos` container on first upload. To create manually:

```bash
MSYS_NO_PATHCONV=1 az storage container create \
  --name aspr-photos \
  --account-name stociomicroeus201 \
  --auth-mode login
```

### 6.2 Container Structure

```
aspr-photos/
├── {uuid-lowercase}/original          # Full-resolution image
├── {uuid-lowercase}/thumbnail         # Legacy WebP thumbnail (400x300)
└── renditions/
    ├── {uuid}/thumb_sm.webp           # 200x150 cover, quality 75
    ├── {uuid}/thumb_md.webp           # 400x300 inside, quality 80
    └── {uuid}/web.webp                # 1200px inside, quality 85
```

### 6.3 CDN Delivery

Photo renditions are served via the Front Door CDN endpoint:

| Path | CDN URL Pattern |
|---|---|
| Thumbnail (small) | `https://cdn-asprphotos-gkfzbjf6fpf3azcw.a01.azurefd.net/renditions/{uuid}/thumb_sm.webp` |
| Thumbnail (medium) | `https://cdn-asprphotos-gkfzbjf6fpf3azcw.a01.azurefd.net/renditions/{uuid}/thumb_md.webp` |
| Web optimized | `https://cdn-asprphotos-gkfzbjf6fpf3azcw.a01.azurefd.net/renditions/{uuid}/web.webp` |
| Original | Not CDN-delivered; signed URL via `/api/photos/[id]/image` only |

---

## 7. Build & Deploy

### 7.1 Local Development

```bash
# Install dependencies
npm ci

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### 7.2 GitHub Actions CI/CD Pipeline

The workflow file `.github/workflows/main_app-ndms-photos-lab.yml` deploys automatically on push to `main`.

**Build Job:**

1. Checkout code
2. Setup Node.js 22
3. `npm ci` (install dependencies)
4. `npm run build` (standalone output)
5. Copy `.next/static` → `.next/standalone/.next/static`
6. Copy `public/` → `.next/standalone/public/`
7. Upload `.next/standalone` as artifact

**Deploy Job:**

1. Download build artifact
2. Deploy to Azure App Service via `azure/webapps-deploy@v2`
3. Authentication: publish profile stored as GitHub encrypted secret (`AZURE_WEBAPP_PUBLISH_PROFILE`)
4. Deploy method: ZipDeploy to SCM endpoint

**Post-Deploy Migration:**

After a successful deploy, trigger schema migrations:

```bash
curl -X POST https://cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net/api/admin/migrate \
  -H "x-admin-token: <ADMIN_TOKEN>"
```

**Startup Command:** `node server.js` (configured on App Service, not in workflow)

### 7.3 Manual Deployment via Azure CLI

```bash
# Build standalone package
npm run build

# Zip the standalone output
cd .next/standalone
zip -r ../../deploy.zip .

# Deploy
MSYS_NO_PATHCONV=1 az webapp deploy \
  --resource-group rg-ocio-microsites-eus2-01 \
  --name app-aspr-photos \
  --src-path deploy.zip \
  --type zip
```

### 7.4 Build Configuration

Key settings in `next.config.ts`:

| Setting | Value | Purpose |
|---|---|---|
| `output` | `standalone` | Minimal deployment footprint |
| `reactStrictMode` | `true` | Development warnings |
| `poweredByHeader` | `false` | Hide server technology |
| `productionBrowserSourceMaps` | `false` | No client source maps |
| `compress` | `true` | Gzip response compression |
| `turbopackUseSystemTlsCerts` | `true` | HHS network proxy support |

---

## 8. Managed Identity Configuration

### 8.1 SQL Server Access

The application uses `DefaultAzureCredential` from `@azure/identity` for passwordless SQL authentication:

1. Enable system-assigned managed identity on the App Service
2. Create a contained database user for the managed identity:

```sql
CREATE USER [app-aspr-photos] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [app-aspr-photos];
ALTER ROLE db_datawriter ADD MEMBER [app-aspr-photos];
```

3. The application automatically obtains access tokens via `DefaultAzureCredential`

### 8.2 Key Vault Access

```bash
MSYS_NO_PATHCONV=1 az keyvault set-policy \
  --name kv-ociomicro-eus2-01 \
  --object-id <managed-identity-object-id> \
  --secret-permissions get list
```

---

## 9. Identity Provider Configuration

### 9.1 Entra ID App Registration (Admin + Upload SSO)

1. Register a new application in the Azure Portal (Entra ID > App registrations)
2. Set **Supported account types** to "Accounts in this organizational directory only" (HHS tenant)
3. Add redirect URI: `https://cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net/api/auth/callback/microsoft-entra-id`
4. For local development, add: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
5. Create a client secret under Certificates & secrets
6. Under **Token configuration**, add optional claims: `email`, `preferred_username`
7. Under **API permissions**, ensure `openid`, `profile`, `email` are granted
8. Create a security group (e.g., "ASPR Photo Admins") and assign admin users
9. Under **Token configuration**, add a `groups` claim to include security group IDs in the token

### 9.2 Login.gov (External Responders)

1. Create a team at the Login.gov Partner Dashboard (sandbox first)
2. Register the application with redirect URI
3. Select `private_key_jwt` as the client authentication method
4. Generate an RSA key pair and upload the public key to Login.gov
5. Store the private key PEM in `LOGINGOV_PRIVATE_KEY` environment variable

### 9.3 ID.me (External Responders)

1. Register as a partner at the ID.me Developer Portal
2. Configure OIDC with redirect URI
3. Request `openid`, `profile`, `email` scopes
4. Store client ID and secret in environment variables

---

## 10. App Service Configuration

### 10.1 Access Restrictions

The App Service must be configured to accept traffic only from Azure Front Door:

| Rule | Action | Priority | Source |
|---|---|---|---|
| Allow Front Door | Allow | 100 | Service Tag: `AzureFrontDoor.Backend` with Front Door ID header match |
| Deny All | Deny | 200 | Any |

**Important:** `publicNetworkAccess` must remain `Enabled` for CI/CD (ZipDeploy uses the SCM endpoint). The IP restrictions + Front Door service tag protect the main site while allowing SCM access with basic auth from the publish profile.

### 10.2 Startup Command

```
node server.js
```

Configured on the App Service under Configuration > General Settings > Startup Command.

---

## 11. Monitoring & Troubleshooting

### 11.1 Application Logs

View real-time logs:

```bash
MSYS_NO_PATHCONV=1 az webapp log tail \
  --resource-group rg-ocio-microsites-eus2-01 \
  --name app-aspr-photos
```

### 11.2 Front Door Metrics

| Metric | Where | Purpose |
|---|---|---|
| Request Count | Front Door > Metrics | Total traffic volume |
| WAF Blocked Requests | Front Door > WAF Logs | Security events |
| Origin Latency | Front Door > Metrics | Backend response time |
| Health Probe Status | Front Door > Metrics | Origin availability |
| Cache Hit Ratio | Front Door > Metrics | CDN efficiency |

### 11.3 Common Issues

| Issue | Cause | Resolution |
|---|---|---|
| 500 on PIN validation | PIN column too small (NVARCHAR < 72) | Run ALTER TABLE migration (§5.3) |
| Images return 404 | UUID case mismatch (SQL uppercase, blob lowercase) | Blob IDs normalized to lowercase in code |
| Database connection timeout | VNet restriction or Entra ID token expiry | Check managed identity configuration |
| Front Door 502/504 | Private Link not approved or not propagated | Approve Private Endpoint connections; wait 10–15 min |
| CDN returns stale images | Cache not purged | Purge Front Door cache for `/renditions/*` |
| Deploy fails (403 on SCM) | publicNetworkAccess disabled | Enable publicNetworkAccess on App Service |
| Post-deploy migration fails | ADMIN_TOKEN mismatch | Verify token matches Key Vault secret |
| Build fails on Sharp | Missing native dependencies | Ensure `sharp` install completes in CI |
| Git Bash path expansion | `/path` expanded to `C:/Users/.../Git/path` | Prefix commands with `MSYS_NO_PATHCONV=1` |

### 11.4 Health Check

Verify application is running:

```bash
curl -s https://cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net/api/health | jq
```

Expected response:

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-02-07T14:30:00.000Z"
}
```

### 11.5 Kudu Console Access

For server-side debugging:

```
https://app-aspr-photos.scm.azurewebsites.net/
```

---

## 12. Backup & Recovery

### 12.1 Database Backup

- Azure SQL automatic backups: 7-day retention (configurable)
- Point-in-time restore available via Azure Portal

### 12.2 Blob Storage Backup

- Enable soft delete on the storage account (recommended 30 days)
- Azure Blob Storage versioning for accidental overwrites

### 12.3 Application Recovery

1. All code is in GitHub (source of truth)
2. Redeploy by pushing to `main` or triggering the GitHub Actions workflow manually
3. Database schema can be recreated via `POST /api/admin/migrate`
4. Application secrets must be re-set in App Service configuration (or restored from Key Vault)
5. Front Door configuration is declarative — recreate from deployment scripts if needed

---

## 13. Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Federal Project Sponsor | | | |
| Operations Lead | | | |
| Technical Lead | | | |

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-02-07 | HHS ASPR / Leidos | Initial deployment guide |
| 1.1 | 2026-02-07 | HHS ASPR / Leidos | Added OIDC identity provider configuration (Entra ID, Login.gov, ID.me) |
| 2.0 | 2026-02-07 | HHS ASPR / Leidos | Post Phase 6 deployment: Azure Front Door Premium setup (CDN endpoints, WAF, Private Link, health probe); expanded database schema (8 tables + view + 10 indexes); CI/CD pipeline details (GitHub Actions, publish profile, post-deploy migration); Key Vault secret management workflow; App Service access restrictions; CDN delivery paths; Front Door monitoring and troubleshooting |
