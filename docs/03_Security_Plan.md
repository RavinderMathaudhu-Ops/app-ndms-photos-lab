# Security Plan

**System Name:** ASPR Photo Repository Application
**Document Version:** 2.0
**Last Updated:** 2026-02-07
**Classification:** CUI // SP-SSP
**Owner:** HHS ASPR / Leidos

---

## 1. System Identification

| Field | Value |
|---|---|
| **System Name** | ASPR Photo Repository |
| **System Acronym** | ASPR-Photos |
| **Production URL** | https://cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net |
| **System Owner** | HHS Administration for Strategic Preparedness and Response (ASPR) |
| **Operating Organization** | Leidos (Contractor Support) |
| **FIPS 199 Categorization** | **MODERATE** |
| **System Type** | Major Application (Web) |
| **Authorization Boundary** | Azure Front Door Premium (WAF), Azure App Service (Linux), Azure SQL Database, Azure Blob Storage, Azure VNet with Private Endpoints |
| **Operational Status** | Production |
| **Information System Security Officer (ISSO)** | [Designated ISSO Name] |
| **Authorizing Official (AO)** | [Designated AO Name] |

This system enables ASPR field teams to securely upload disaster-related photographs during incident response operations, and provides administrators with a full photo management dashboard for review, tagging, editing, and bulk operations. As a federal agency application processing operational imagery with geospatial metadata, it is categorized at the FIPS 199 MODERATE impact level.

---

## 2. Security Categorization (FIPS 199)

| Security Objective | Impact Level | Justification |
|---|---|---|
| **Confidentiality** | Moderate | Contains operational photos from disaster response, GPS coordinates of incident locations, EXIF camera metadata, and authentication credentials (hashed PINs, OIDC tokens) |
| **Integrity** | Moderate | Photo evidence integrity is critical for incident documentation; metadata must accurately represent field conditions; admin audit trail must be immutable |
| **Availability** | Moderate | System must be available during active incident response operations; downtime could impair documentation of disaster conditions; health probe monitors availability every 30 seconds |

**Overall Categorization: MODERATE**

---

## 3. System Description

### 3.1 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.1.6 |
| UI Library | React | 19.2.3 |
| Language | TypeScript | 5.x |
| Runtime | Node.js | 22.x LTS |
| Database | Azure SQL Server | Managed |
| Blob Storage | Azure Blob Storage | v12 SDK |
| CDN / WAF | Azure Front Door Premium | Premium_AzureFrontDoor |
| WAF Engine | OWASP CRS 3.2 + Bot Manager 1.1 | Managed Rules |
| Network Isolation | Azure VNet + Private Endpoints | Private Link |
| Authentication (Field) | JWT (HS256) + bcrypt | jsonwebtoken 9.x, bcryptjs 3.x |
| Authentication (SSO) | Auth.js with OIDC providers | Auth.js v5 (NextAuth) |
| Identity Providers | Entra ID, Login.gov, ID.me | OIDC authorization code flow |
| Azure Identity | Azure Entra ID (Managed Identity) | DefaultAzureCredential |
| Image Processing | Sharp | 0.34.5 |
| EXIF Extraction | exifr | 7.x |
| Hosting | Azure App Service | Linux |
| CI/CD | GitHub Actions | azure/webapps-deploy@v2 |

### 3.2 Network Architecture

```
Internet
   │
   ▼
Azure Front Door Premium (cdn-ociomicro-premium-eus2-01)
   ├── WAF Policy: wafAsprPhotos (OWASP 3.2 + Bot Manager, Prevention mode)
   ├── Security Policy: secpol-asprphotos-app
   │
   ├── CDN Endpoint: cdn-asprphotos-app (application)
   │      └── Private Link → App Service (app-aspr-photos)
   │
   └── CDN Endpoint: cdn-asprphotos (blob renditions)
          └── Private Link → Blob Storage (stociomicroeus201)
                                    │
Azure VNet ─────────────────────────┤
   ├── Private Endpoint → Azure SQL Database
   ├── Private Endpoint → Azure Blob Storage
   ├── Private Endpoint → Azure Key Vault
   └── Private Endpoint → App Service
```

### 3.3 Data Types Processed

| Data Type | Sensitivity | Description |
|---|---|---|
| Disaster photographs | Moderate | Operational imagery from incident response sites (originals + multi-rendition WebP) |
| GPS coordinates | Moderate | Geolocation data of disaster sites and field positions |
| EXIF metadata | Low–Moderate | Camera make/model, focal length, aperture, ISO, date taken |
| Incident IDs | Low | Structured identifiers for incident tracking |
| PIN credentials | High | 6-digit PINs stored as bcrypt hashes |
| JWT tokens | Moderate | Session tokens with 24-hour expiration |
| Admin tokens | High | Static fallback tokens for administrative access (deprecated by Entra ID SSO) |
| Entra ID tokens | Moderate | OIDC tokens for HHS staff authentication |
| Login.gov tokens | Moderate | OIDC tokens for federal/public user authentication |
| ID.me tokens | Moderate | OIDC tokens for external responder authentication |
| User notes | Low | Free-text annotations on uploaded photos |
| Team identifiers | Low | Team names associated with upload sessions |
| Tags | Low | Category-based labels (status, priority, type, timeline, custom) |
| Admin audit records | Moderate | Immutable log of all administrative actions with performer, IP, timestamp |

### 3.4 User Types

| Role | Count | Access Level | Authentication Methods |
|---|---|---|---|
| Field Team Member (HHS) | Variable (per incident) | Upload photos, view own session gallery | Entra ID SSO or 6-digit PIN → JWT |
| Field Team Member (External) | Variable (per incident) | Upload photos, view own session gallery | Login.gov, ID.me, or 6-digit PIN → JWT |
| Administrator | Limited | Full photo management, tagging, bulk ops, editor, session/PIN management, audit log | Entra ID SSO (HHS tenant, admin group) or ADMIN_TOKEN (fallback) |

---

## 4. Security Controls

### 4.1 Access Control (AC)

| Control | Implementation |
|---|---|
| **AC-2 Account Management** | Upload sessions created by admins with expiration (48 hours); SSO users identified by OIDC subject claims; no local persistent user accounts |
| **AC-3 Access Enforcement** | JWT Bearer tokens required for all photo operations; admin access requires Entra ID SSO (HHS tenant) with security group membership or timing-safe ADMIN_TOKEN comparison via `crypto.timingSafeEqual()` |
| **AC-4 Information Flow Enforcement** | Azure Front Door WAF enforces OWASP CRS 3.2 managed rules in Prevention mode; Bot Manager 1.1 blocks malicious bot traffic; all traffic must transit Front Door (App Service IP-restricted to Front Door service tag `AzureFrontDoor.Backend` with Front Door ID header validation) |
| **AC-6 Least Privilege** | Admin dual-auth: primary via Entra ID SSO (requires HHS tenant membership + admin security group), fallback via ADMIN_TOKEN with `crypto.timingSafeEqual()` comparison; field teams scoped to own session photos only; admin operations logged to immutable audit table |
| **AC-7 Unsuccessful Login Attempts** | 5 PIN attempts per minute per IP, then 15-minute lockout; 3 admin token attempts then 30-minute lockout |
| **AC-8 System Use Notification** | Government branding (ASPR/HHS) establishes federal system context |
| **AC-11 Session Lock** | JWT tokens expire after 24 hours; session data stored in browser sessionStorage (cleared on tab close) |
| **AC-17 Remote Access** | All backend resources (Blob Storage, SQL Database, Key Vault, App Service) accessed exclusively via Private Link — no public endpoints; Front Door terminates TLS and forwards via Private Link origins; HTTPS-only via HSTS with preload |

### 4.2 Audit and Accountability (AU)

| Control | Implementation |
|---|---|
| **AU-2 Auditable Events** | AUTH_SUCCESS, AUTH_FAILURE, PIN_CREATED, UPLOAD_SUCCESS, UPLOAD_FAILURE, RATE_LIMIT_EXCEEDED, ADMIN_LOGIN, PHOTO_UPDATED, PHOTO_DELETED, BULK_DELETE, BULK_TAG, BULK_STATUS_CHANGE, TAG_CREATED, SESSION_REVOKED, MIGRATION_RUN |
| **AU-3 Content of Audit Records** | Timestamp, event type, IP address (x-forwarded-for), user agent, session ID, admin principal, entity type, entity ID, action details (JSON) |
| **AU-6 Audit Review** | Console-based structured audit logging + persistent `admin_audit_log` SQL table for all administrative operations; immutable (INSERT-only, no UPDATE/DELETE) |
| **AU-8 Time Stamps** | ISO 8601 timestamps from server clock (`new Date().toISOString()`) |
| **AU-12 Audit Generation** | All admin API endpoints write to `admin_audit_log` via `requireAdmin()` middleware which captures performer identity, IP, and operation details before returning response |

#### Audit Events Detail

| Event | Trigger | Data Logged |
|---|---|---|
| `AUTH_SUCCESS` | Successful PIN validation | sessionId, teamName, IP, userAgent |
| `AUTH_FAILURE` | Invalid PIN or format | reason, remainingAttempts, IP |
| `PIN_CREATED` | New PIN generated | teamName, last 2 PIN digits, IP |
| `UPLOAD_SUCCESS` | Photo uploaded | photoId, fileSize, sessionId |
| `UPLOAD_FAILURE` | Upload validation failed | reason, sessionId, IP |
| `RATE_LIMIT_EXCEEDED` | Rate limit triggered | endpoint type, IP |
| `ADMIN_LOGIN` | Admin authenticated via Entra ID or token | principal, method, IP |
| `PHOTO_UPDATED` | Photo metadata edited | photoId, changedFields, adminPrincipal |
| `PHOTO_DELETED` | Photo deleted by admin | photoId, fileName, adminPrincipal |
| `BULK_DELETE` | Bulk photo deletion | photoIds[], count, adminPrincipal |
| `BULK_TAG` | Bulk tag assignment | photoIds[], tagName, adminPrincipal |
| `TAG_CREATED` | New tag created | tagName, category, adminPrincipal |
| `SESSION_REVOKED` | Upload session deactivated | sessionId, teamName, adminPrincipal |
| `MIGRATION_RUN` | Database migration executed | migrationName, result, adminPrincipal |

#### Admin Audit Log Table

```sql
CREATE TABLE admin_audit_log (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    entity_type NVARCHAR(50)   NOT NULL,   -- 'photo', 'session', 'tag', 'migration'
    entity_id   NVARCHAR(100)  NULL,        -- UUID of affected entity
    action      NVARCHAR(50)   NOT NULL,    -- 'create', 'update', 'delete', 'bulk_delete', etc.
    performed_by NVARCHAR(255) NOT NULL,    -- Admin principal (email or 'token')
    ip_address  NVARCHAR(45)   NULL,        -- Client IP
    details     NVARCHAR(MAX)  NULL,        -- JSON details of the operation
    created_at  DATETIME       NOT NULL DEFAULT GETDATE()
);
-- Immutable: no UPDATE or DELETE operations permitted by application code
```

### 4.3 Identification and Authentication (IA)

| Control | Implementation |
|---|---|
| **IA-2 User Identification** | Field teams identified by session ID (PIN) or OIDC subject claim (SSO); admins identified by Entra ID principal or ADMIN_TOKEN (logged as "token") |
| **IA-2(1) Multi-Factor Auth (Privileged)** | Entra ID enforces MFA per HHS tenant policy for admin users |
| **IA-2(2) Multi-Factor Auth (Non-Privileged)** | Login.gov requires phishing-resistant MFA; ID.me requires MFA; PIN auth is single-factor (mitigated by rate limiting, expiration, and WAF) |
| **IA-5 Authenticator Management** | PINs generated via CSPRNG, bcrypt-hashed, 48h expiry; OIDC tokens managed by identity providers per their policies |
| **IA-6 Authenticator Feedback** | PIN input shows dots/asterisks; remaining attempts displayed on failure; OIDC login uses provider-hosted UI |
| **IA-8 Identification (Non-Org Users)** | External responders authenticate via Login.gov (GSA) or ID.me; both provide verified identity claims via OIDC |

#### PIN Security Details

- **Generation:** `crypto.randomInt(100000, 999999)` — NIST SP 800-63B compliant CSPRNG
- **Storage:** bcrypt hash with 10 salt rounds in NVARCHAR(72) column
- **Comparison:** `bcrypt.compare()` — constant-time comparison inherent to bcrypt
- **Expiration:** 48 hours from creation
- **Distribution:** Plaintext PIN returned once at creation, communicated verbally to field team
- **Admin Token Comparison:** `crypto.timingSafeEqual()` — prevents timing attacks (fallback mode only)

#### OIDC Identity Provider Security

| Provider | Protocol | Client Auth | MFA | Identity Proofing | Registration |
|---|---|---|---|---|---|
| Microsoft Entra ID | OIDC (authorization code) | Client secret | HHS tenant policy | N/A (org accounts) | Automatic (HHS staff) |
| Login.gov | OIDC (iGov Profile) | `private_key_jwt` | Required (phishing-resistant) | IAL1 or IAL2 | One-time (reusable across agencies) |
| ID.me | OIDC + PKCE | Authorization code | Required | IAL2 (verified) | One-time (reusable across partners) |

- All OIDC providers use TLS-encrypted redirect flows
- Auth.js (NextAuth v5) manages OIDC state, nonce, and PKCE verification
- OIDC tokens are validated server-side; only the application JWT is issued to the client
- Provider-issued access tokens are not stored client-side

### 4.4 System and Communications Protection (SC)

| Control | Implementation |
|---|---|
| **SC-7 Boundary Protection** | Azure VNet isolates all backend resources; App Service access restricted to Azure Front Door service tag (`AzureFrontDoor.Backend`) with Front Door ID header (`X-Azure-FDID: 91523752-5871-42ed-9e27-031fc6f5eb86`) validation; no direct public access to App Service, SQL, Blob, or Key Vault |
| **SC-8 Transmission Confidentiality** | Front Door terminates TLS 1.2+ at the edge; HTTPS enforced via HSTS (`max-age=31536000; includeSubDomains; preload`); HTTP requests redirected to HTTPS by Front Door; backend Private Link traffic encrypted within Azure backbone |
| **SC-12 Cryptographic Key Management** | JWT_SECRET, ADMIN_TOKEN, and OIDC client secrets stored in Azure Key Vault (`kv-ociomicro-eus2-01`) with `ASPRPHOTOS--` prefix; Key Vault accessed via Private Endpoint; Login.gov uses `private_key_jwt` with asymmetric keys |
| **SC-13 Cryptographic Protection** | Front Door TLS 1.2+ termination (minimum TLS version enforced); JWT HS256 for session tokens; bcrypt for PINs; HMAC-SHA256 for signed image URLs; OIDC providers enforce TLS and token signing |
| **SC-28 Protection of Information at Rest** | Azure SQL TDE (transparent data encryption); Azure Blob Storage encryption at rest (AES-256); Key Vault HSM-backed keys |

#### Security Headers

All responses include hardened headers via `next.config.ts`:

| Header | Value | Purpose |
|---|---|---|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| X-Content-Type-Options | `nosniff` | Prevent MIME sniffing |
| X-Frame-Options | `DENY` | Prevent clickjacking |
| X-XSS-Protection | `1; mode=block` | Legacy XSS protection |
| Referrer-Policy | `strict-origin-when-cross-origin` | Limit referrer data |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(self), payment=()` | Feature restrictions |
| Content-Security-Policy | `default-src 'self'; img-src 'self' https: data: blob:; ...` | Resource restrictions |
| X-Powered-By | Suppressed | Hide server technology |

### 4.5 System and Information Integrity (SI)

| Control | Implementation |
|---|---|
| **SI-2 Flaw Remediation** | Automated dependency updates; GitHub Actions CI/CD for rapid deployment on push to `main` |
| **SI-3 Malicious Code Protection** | File type validation (JPEG/PNG/WebP only); filename sanitization; max size enforcement (50 MB); Sharp validates image headers during processing |
| **SI-4 System Monitoring** | Console-based audit logging; Azure App Service diagnostic logs; Front Door WAF logs; health probe (`GET /api/health`) monitored every 30 seconds by Front Door |
| **SI-10 Information Input Validation** | Server-side validation for all inputs (PINs, team names, coordinates, notes, incident IDs, filenames, tag names, bulk operation payloads) |

---

## 5. Azure Front Door WAF Configuration

### 5.1 WAF Policy

| Property | Value |
|---|---|
| Policy Name | wafAsprPhotos |
| SKU | Premium_AzureFrontDoor |
| Mode | **Prevention** (blocks matching requests) |
| Managed Rule Sets | Microsoft_DefaultRuleSet 2.1 (OWASP CRS 3.2), Microsoft_BotManagerRuleSet 1.1 |

### 5.2 OWASP CRS 3.2 Protection Categories

| Category | Rule Group | Protection |
|---|---|---|
| SQL Injection | SQLI | Parameterized query bypass attempts |
| Cross-Site Scripting | XSS | Script injection in headers, parameters, body |
| Local File Inclusion | LFI | Path traversal attempts |
| Remote File Inclusion | RFI | External resource inclusion |
| Remote Command Execution | RCE | OS command injection |
| Protocol Enforcement | PROTOCOL | HTTP protocol violations |
| Session Fixation | SESSION | Session ID manipulation |
| Request Size Limits | REQUEST-SIZE | Oversized request blocking |

### 5.3 Bot Manager Protection

| Rule Group | Action | Description |
|---|---|---|
| BadBots | Block | Known malicious bot user agents |
| GoodBots | Allow | Verified search engines and monitoring services |
| UnknownBots | Log | Unclassified bots logged for review |

### 5.4 Security Policy

| Property | Value |
|---|---|
| Security Policy Name | secpol-asprphotos-app |
| Associated Endpoint | cdn-asprphotos-app |
| WAF Policy | wafAsprPhotos |
| Domain | cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net |

### 5.5 Health Probe

| Property | Value |
|---|---|
| Path | `/api/health` |
| Protocol | HTTPS |
| Interval | 30 seconds |
| Method | HEAD |
| Success Codes | 200 |

The health endpoint verifies database connectivity and returns the application version. Front Door routes traffic only to healthy origins.

---

## 6. OWASP Top 10 (2021) Compliance

| # | Vulnerability | Mitigation |
|---|---|---|
| A01 | Broken Access Control | JWT verification on every API call; session-scoped photo access; Entra ID SSO with group-based RBAC for admin; timing-safe fallback token; **Azure Front Door WAF (OWASP CRS 3.2, Prevention mode)** blocks malicious access patterns; VNet isolation prevents direct backend access |
| A02 | Cryptographic Failures | HTTPS enforced via Front Door TLS 1.2+ termination + HSTS; bcrypt for PINs; JWT HS256; HMAC-SHA256 signed URLs; OIDC tokens validated server-side; secrets in Key Vault |
| A03 | Injection | Parameterized SQL queries (mssql `request.input()`); no string concatenation in queries; WAF SQL injection rules (CRS 3.2 SQLI group) |
| A04 | Insecure Design | Rate limiting on all auth endpoints; session expiration; input validation; admin audit logging for accountability; immutable audit trail |
| A05 | Security Misconfiguration | Security headers on all responses; X-Powered-By suppressed; source maps disabled; Front Door WAF in Prevention mode; Private Link eliminates public endpoint exposure |
| A06 | Vulnerable Components | npm dependency management; version-locked packages; CI/CD enables rapid patching |
| A07 | Identification & Auth Failures | bcrypt hashing; JWT expiration; rate limiting with lockout; OIDC SSO with MFA (Entra ID, Login.gov, ID.me); WAF bot protection blocks credential stuffing |
| A08 | Software & Data Integrity | GitHub Actions CI/CD pipeline; publish profile authentication for deployment; GitHub version control with branch protection |
| A09 | Security Logging & Monitoring | Structured audit logging for all security events; persistent `admin_audit_log` table; Front Door WAF logging; health probe monitoring every 30s |
| A10 | Server-Side Request Forgery | No user-controlled URL fetching; image proxy validates signed URLs only; Private Link prevents SSRF to internal resources from external networks |

---

## 7. Rate Limiting Strategy

### 7.1 Configuration

| Endpoint | Max Attempts | Window | Lockout Duration |
|---|---|---|---|
| `POST /api/auth/validate-pin` | 5 | 60 seconds | 15 minutes |
| Admin token failures | 3 | 60 seconds | 30 minutes |
| `POST /api/auth/create-session` | 20 | 60 seconds | None |
| `POST /api/photos/upload` | 50 | 1 hour | None |
| `POST /api/admin/photos/bulk` | 10 | 60 seconds | None |

### 7.2 Implementation

- **Storage:** In-memory `Map<string, RateLimitEntry>`
- **Key:** Per-IP address (`x-forwarded-for` header, validated via Front Door)
- **Cleanup:** Automatic entry expiration every 5 minutes (entries older than 1 hour)
- **Response:** HTTP 429 with `Retry-After` header
- **WAF Layer:** Azure Front Door rate limiting rules provide network-level protection in addition to application-level rate limiting

---

## 8. Data Protection

### 8.1 Data at Rest

| Data | Protection | Location |
|---|---|---|
| Photos (originals) | Azure Storage Service Encryption (AES-256) | Azure Blob Storage (Private Endpoint only) |
| Photos (renditions) | Azure Storage Service Encryption (AES-256) | Azure Blob Storage → CDN (Front Door) |
| Photo metadata | Azure SQL TDE (AES-256) | Azure SQL Database (Private Endpoint only) |
| EXIF metadata | Azure SQL TDE (AES-256) | Azure SQL Database (photo_exif table) |
| PIN hashes | bcrypt (10 rounds) + TDE | Azure SQL Database |
| Tags & edit history | Azure SQL TDE (AES-256) | Azure SQL Database |
| Admin audit log | Azure SQL TDE (AES-256), immutable | Azure SQL Database (admin_audit_log, INSERT-only) |
| Secrets | Azure Key Vault (HSM-backed) | Key Vault (Private Endpoint only) |

### 8.2 Data in Transit

| Channel | Protection |
|---|---|
| Client ↔ Front Door | TLS 1.2+ (Front Door edge termination) |
| Front Door ↔ App Service | Private Link (Azure backbone, encrypted) |
| Front Door ↔ Blob Storage | Private Link (Azure backbone, encrypted) |
| App Service ↔ SQL | TLS 1.2 (Azure managed, Private Endpoint) |
| App Service ↔ Blob Storage | TLS 1.2 (Azure managed, Private Endpoint) |
| App Service ↔ Key Vault | TLS 1.2 (Azure managed, Private Endpoint) |

### 8.3 Data Minimization

- PINs stored as irreversible bcrypt hashes (plaintext returned once at creation only)
- Audit logs record only last 2 digits of PINs
- JWT tokens contain only `sessionId` — no PII
- GPS coordinates are optional (user-provided)
- No persistent user accounts or profiles for field teams
- EXIF data extracted server-side; raw EXIF stored for reference, sensitive fields (e.g., serial numbers) can be scrubbed

### 8.4 CDN Rendition Security

| Asset | Access Method | Protection |
|---|---|---|
| Original photos | Signed URL via `/api/photos/[id]/image` | HMAC-SHA256 signature + expiry; blob not publicly accessible |
| Renditions (thumb_sm, thumb_md, web) | Front Door CDN endpoint `/renditions/*` | Private Link to blob; Front Door caching; no direct blob URL exposure |
| Admin photo grid | CDN renditions | Admin auth required to view grid; CDN URLs not guessable |

---

## 9. Incident Response

### 9.1 Security Event Detection

| Event | Detection Method | Response |
|---|---|---|
| Brute force PIN attack | Rate limit exceeded logging + WAF anomaly | Automatic IP lockout (15 min) + WAF log alert |
| Brute force admin attack | Rate limit exceeded + WAF bot detection | Automatic IP lockout (30 min) + WAF block |
| SQL injection attempt | WAF CRS 3.2 SQLI rules | Request blocked (Prevention mode); WAF log entry |
| XSS attempt | WAF CRS 3.2 XSS rules | Request blocked; WAF log entry |
| Bot/crawler attack | WAF Bot Manager 1.1 | Known bad bots blocked; unknown bots logged |
| Invalid file upload | Input validation failure logging | Request rejected with 400 |
| Unauthorized access attempt | JWT verification failure | Request rejected with 401 |
| Unauthorized admin action | Admin audit log + auth failure | Logged to admin_audit_log; 401 returned |

### 9.2 Escalation Procedures

1. **Automated Response:** Front Door WAF blocks in Prevention mode; application rate limiting and lockout mechanisms
2. **WAF Log Review:** Azure Monitor / Log Analytics for WAF rule triggers, blocked requests, bot detection events
3. **Audit Log Review:** Query `admin_audit_log` table for suspicious admin activity patterns
4. **Manual Response:** Rotate ADMIN_TOKEN, JWT_SECRET, and OIDC client secrets if compromise suspected; revoke Entra ID app registration if needed; update WAF custom rules to block specific IPs/patterns
5. **Notification:** Alert ISSO and system owner per HHS incident response procedures

---

## 10. Network Isolation Summary

| Resource | Public Access | Access Method |
|---|---|---|
| App Service (app-aspr-photos) | Restricted (Front Door service tag + Front Door ID only) | Front Door Private Link origin |
| Blob Storage (stociomicroeus201) | Disabled | Private Endpoint on VNet; Front Door Private Link for CDN |
| SQL Database | Disabled | Private Endpoint on VNet; App Service Managed Identity |
| Key Vault (kv-ociomicro-eus2-01) | Disabled (enabled temporarily for CLI ops) | Private Endpoint on VNet; App Service Managed Identity |
| Front Door (cdn-ociomicro-premium-eus2-01) | Public (edge) | Edge POP → Private Link to origins |

All backend-to-backend communication traverses the Azure backbone network via Private Link. No backend resource accepts connections from the public internet.

---

## 11. CI/CD Security

| Control | Implementation |
|---|---|
| **Source Code** | GitHub repository with branch protection on `main` |
| **Build** | GitHub Actions runner (GitHub-hosted, ephemeral) |
| **Deploy Auth** | Azure App Service publish profile (basic auth to SCM endpoint) stored as GitHub encrypted secret (`AZURE_WEBAPP_PUBLISH_PROFILE`) |
| **Deploy Method** | `azure/webapps-deploy@v2` (ZipDeploy via SCM) |
| **Post-Deploy** | `POST /api/admin/migrate` with `x-admin-token` header triggers schema migrations |
| **Secret Management** | GitHub encrypted secrets for publish profile; Azure Key Vault for runtime secrets |
| **No Force Push** | `main` branch protection prevents force pushes |

---

## 12. Compliance Summary

| Standard | Status | Notes |
|---|---|---|
| FIPS 199 | Compliant | MODERATE categorization documented |
| NIST SP 800-53 (Rev 5) | Partial | Key controls implemented (AC, AU, IA, SC, SI); enhanced with WAF (AC-4), Private Link (AC-17, SC-7), audit logging (AU-2, AU-3, AU-12) |
| NIST SP 800-63B | Compliant | CSPRNG for PIN generation, bcrypt storage |
| OWASP Top 10 (2021) | Compliant | All 10 categories addressed; WAF provides defense-in-depth for A01, A03, A07 |
| HSTS Preload | Compliant | 1-year max-age with includeSubDomains |
| CSP Level 2 | Compliant | Restrictive Content-Security-Policy |
| OWASP CRS 3.2 | Compliant | Azure Front Door WAF in Prevention mode with managed rule set |
| FedRAMP (Azure) | Inherited | Azure Government cloud controls inherited from CSP |

---

## 13. Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Federal Project Sponsor | | | |
| Information System Security Officer | | | |
| Authorizing Official | | | |
| Technical Lead | | | |

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-02-07 | HHS ASPR / Leidos | Initial security plan |
| 1.1 | 2026-02-07 | HHS ASPR / Leidos | Multi-tier authentication: Entra ID SSO, Login.gov, ID.me OIDC; updated IA controls |
| 2.0 | 2026-02-07 | HHS ASPR / Leidos | Post Phase 6 deployment: Azure Front Door WAF (OWASP 3.2 + Bot Manager, Prevention mode); VNet + Private Link network isolation; admin audit log (immutable admin_audit_log table); admin dual-auth (AC-6); health probe monitoring; CDN rendition security; CI/CD security controls; expanded OWASP compliance with WAF defense-in-depth |
