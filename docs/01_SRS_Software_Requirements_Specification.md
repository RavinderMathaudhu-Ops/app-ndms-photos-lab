# Software Requirements Specification

**ASPR Photo Repository Application**

| Field | Value |
|---|---|
| Document ID | ASPR-PHOTOS-SRS-001 |
| Version | 2.0 |
| Date | 2026-02-07 |
| Status | Production |
| Classification | For Official Use Only (FOUO) |
| Author | HHS ASPR / Leidos |

---

## 1. Introduction

### 1.1 Purpose

The ASPR Photo Repository is a secure, web-based application that enables Administration for Strategic Preparedness and Response (ASPR) field teams to capture, upload, and manage disaster-related photographs during incident response operations. The system includes a full-featured admin dashboard for photo management, tag-based organization, bulk operations, and compliance audit logging.

### 1.2 Scope

The application provides:
- Multi-tier authentication: PIN-based (field default), Microsoft Entra ID (HHS staff), Login.gov and ID.me (external responders)
- Multi-step wizard for photo upload with metadata (GPS, incident ID, notes)
- Photo gallery with download, delete, and filtering capabilities
- Admin dashboard secured by Entra ID SSO with full photo management: grid view, metadata editing, EXIF display, bulk operations, tag system, photo editor, and session management
- Multi-rendition image processing pipeline (thumbnail small, thumbnail medium, web-optimized)
- CDN-accelerated image delivery via Azure Front Door Premium with signed URLs
- Azure Front Door WAF with OWASP 3.2 managed rules and bot protection
- Private Link networking — no public endpoints for blob storage, SQL, or app service
- GitHub Actions CI/CD pipeline for automated deployment
- Government-compliant (ASPR/HHS) branding and security controls

### 1.3 Intended Users

| Role | Description | Authentication Method |
|---|---|---|
| **Field Team Member (HHS)** | ASPR responders with HHS credentials who capture and upload photos | Entra ID SSO or PIN |
| **Field Team Member (External)** | State/local, contractor, or volunteer responders | Login.gov, ID.me, or PIN |
| **Admin** | Operations staff who manage photos, create PINs, manage sessions, review audit logs | Entra ID SSO (HHS tenant) |

### 1.4 Technology Stack

| Component | Technology |
|---|---|
| Framework | Next.js 16.1.6 (React 19, TypeScript) |
| Styling | Tailwind CSS 4, Framer Motion 12, Lenis smooth scroll |
| Database | Azure SQL Server (mssql 12.2) |
| Storage | Azure Blob Storage (@azure/storage-blob 12.30) |
| CDN | Azure Front Door Premium with Private Link origins |
| WAF | Azure Front Door WAF (OWASP 3.2 + Bot Manager) |
| Auth (Field) | JWT (jsonwebtoken 9.x), bcryptjs 3.x, HMAC-SHA256 signed URLs |
| Auth (SSO) | Auth.js (NextAuth v5) with Microsoft Entra ID OIDC provider |
| Image Processing | Sharp 0.34.5, exifr 7.1.3 (EXIF extraction) |
| Photo Editor | react-advanced-cropper 0.20.1, Konva 10.2 / react-konva 19.2 |
| Virtualization | @tanstack/react-virtual 3.13 |
| File Export | JSZip 3.10, file-saver 2.0 |
| Deployment | Azure App Service via GitHub Actions CI/CD (ZipDeploy) |
| Runtime | Node.js 22.x |

---

## 2. Functional Requirements

### 2.1 Authentication & Authorization

The system implements a multi-tier authentication model to support HHS staff, external responders, and field-expedient access during disaster operations.

| Authentication Tier | Method | Protocol | Users | Routes |
|---|---|---|---|---|
| **PIN** | 6-digit PIN with bcrypt | Custom (JWT issuance) | All field teams | `/` (upload) |
| **Entra ID** | Microsoft Entra ID SSO | OIDC (Auth.js) | HHS staff | `/admin`, `/` (upload) |
| **Login.gov** | GSA Login.gov | OIDC (Auth.js) | External federal/public | `/` (upload) |
| **ID.me** | ID.me identity verification | OIDC + PKCE (Auth.js) | External responders | `/` (upload) |

#### FR-2.1.1 PIN Login (Field Teams)

PIN-based authentication is the primary field authentication method, designed for rapid access in disaster response conditions where SSO redirects may not be feasible (limited connectivity, shared devices, staging area distribution).

- The system SHALL present a multi-step wizard at the root URL (`/`) starting with an animated welcome screen with ASPR branding and logo preloader.
- The system SHALL validate 6-digit PINs by fetching all non-expired sessions and comparing bcrypt hashes.
- The system SHALL only accept PINs linked to sessions not yet expired (`expires_at > GETUTCDATE()`).
- The system SHALL generate a JWT token (HS256, 24-hour expiration) upon successful PIN validation.
- The system SHALL store the JWT token, session ID, and team name in the browser's `sessionStorage`.
- The system SHALL display remaining login attempts on failure.
- The system SHALL auto-advance the PIN input when all 6 digits are entered.
- PINs SHALL be generated using CSPRNG per NIST SP 800-63B.
- PINs SHALL be stored as bcrypt hashes (10 salt rounds) and SHALL NOT be retrievable after creation.

#### FR-2.1.2 Admin Authentication (Entra ID)

- The system SHALL provide an admin dashboard at `/admin`.
- The system SHALL authenticate admin users via Microsoft Entra ID single sign-on (SSO) using the OIDC authorization code flow.
- The system SHALL restrict admin access to users within the HHS Entra ID tenant.
- The system SHALL support role-based access control via Entra ID security groups (e.g., "ASPR Photo Admins").
- The system SHALL use Auth.js (NextAuth v5) with the Microsoft Entra ID provider for OIDC integration.
- The admin Entra ID app registration SHALL be configured with redirect URI `/api/auth/callback/microsoft-entra-id`.
- The system SHALL fall back to static admin token authentication (`x-admin-token` header with `crypto.timingSafeEqual`) when Entra ID is unavailable or not configured.
- Admin authorization SHALL be enforced via `lib/adminAuth.ts` which returns an `AdminContext` with auth method and identity.

#### FR-2.1.3 Entra ID Upload Authentication (HHS Staff)

- The system SHALL offer Microsoft Entra ID SSO as an upload authentication option for HHS staff at the root URL (`/`).
- Users authenticating via Entra ID SHALL be issued a JWT session token equivalent to PIN-authenticated users.
- The system SHALL create or link an `upload_session` record for Entra ID-authenticated users, identified by their Entra ID principal name.
- Entra ID upload sessions SHALL NOT expire after 48 hours — session lifetime is governed by the Entra ID token and the application JWT (24 hours).
- This method SHALL NOT replace PIN authentication; both SHALL be available concurrently.

#### FR-2.1.4 External Identity Providers (Login.gov, ID.me)

For non-HHS responders (state/local government, contractors, volunteers) who do not have Entra ID credentials:

**Login.gov:**
- The system SHALL support Login.gov as an OIDC identity provider via Auth.js.
- Login.gov integration SHALL use the `private_key_jwt` client authentication method (preferred by Login.gov for web applications).
- The system SHALL support IAL1 (self-asserted identity) at minimum; IAL2 (identity-proofed) MAY be required based on ASPR policy.
- Login.gov is a one-time registration; users who have an existing Login.gov account (e.g., from IRS, SSA, USAJOBS, FEMA) SHALL be able to sign in without re-registering.

**ID.me:**
- The system SHALL support ID.me as an OIDC identity provider via Auth.js.
- ID.me integration SHALL use the authorization code flow with PKCE.
- The system MAY leverage ID.me's first responder group affiliation verification for automatic role assignment.
- ID.me is a one-time registration; users with existing ID.me accounts (e.g., from VA, state services) SHALL be able to sign in without re-registering.
- ID.me access tokens expire after 5 minutes; the system SHALL issue its own JWT session token upon successful ID.me authentication.

**Common Requirements:**
- Users authenticating via Login.gov or ID.me SHALL be issued a JWT session token equivalent to PIN-authenticated users.
- The system SHALL create an `upload_session` record for externally authenticated users, identified by their provider subject ID.
- External identity providers SHALL NOT replace PIN authentication; all methods SHALL be available concurrently.

#### FR-2.1.5 Session Management

- JWT tokens SHALL expire after 24 hours regardless of authentication method.
- Session data SHALL be stored in `sessionStorage` (cleared on tab close).
- PINs SHALL expire 48 hours after creation.
- Entra ID sessions SHALL respect the Entra ID token lifetime and the application JWT expiration (whichever is shorter).
- Users SHALL be able to log out, clearing all session data and revoking the Auth.js session (for SSO users).
- Admins SHALL be able to revoke sessions (deactivate PINs) via the admin dashboard.
- Admins SHALL be able to reactivate revoked sessions if they have not yet expired.

#### FR-2.1.6 Signed Image URLs

- The system SHALL generate HMAC-SHA256 signed URLs for image access.
- Signed URLs SHALL include photo ID, image type, expiry timestamp, and signature.
- Signed URLs SHALL expire after 24 hours (default).
- The image proxy SHALL verify signatures before serving blob content.
- Signed URLs SHALL function identically regardless of the user's original authentication method.

### 2.2 Photo Upload

#### FR-2.2.1 File Upload
- The system SHALL accept photo uploads at `POST /api/photos/upload`.
- The system SHALL require a valid JWT token in the `Authorization: Bearer` header.
- The system SHALL accept JPEG, PNG, and WebP image formats only.
- The system SHALL enforce a maximum file size of 50 MB per upload.
- The system SHALL validate filenames to allow only alphanumeric characters, spaces, hyphens, dots, and underscores.
- The system SHALL support multi-photo selection in a single wizard session.

#### FR-2.2.2 Photo Metadata
- The system SHALL accept the following optional metadata with each upload:
  - **Incident ID** — alphanumeric with hyphens/underscores, max 50 characters
  - **GPS Coordinates** — latitude (-90 to 90) and longitude (-180 to 180)
  - **Location Name** — formatted coordinate string
  - **Notes** — free text, maximum 1,000 characters
- The system SHALL support browser geolocation for automatic GPS capture.
- The system SHALL support ZIP code lookup for approximate coordinates.

#### FR-2.2.3 Image Processing
- The system SHALL extract image metadata (width, height, format) using Sharp.
- The system SHALL extract EXIF data using exifr, including: camera make/model, focal length, aperture, ISO, GPS coordinates, and date taken.
- The system SHALL generate a compact camera info string (e.g., "Canon EOS 5D Mark IV - 50mm - f/2.0 - ISO 400").
- The system SHALL generate multiple renditions for each uploaded photo:

| Rendition | Max Dimensions | Format | Quality | Fit |
|---|---|---|---|---|
| `thumb_sm` | 200 x 150 px | WebP | 75 | Cover (crop) |
| `thumb_md` | 400 x 300 px | WebP | 80 | Inside (fit) |
| `web` | 1200 px wide | WebP | 85 | Inside (fit) |

#### FR-2.2.4 Storage
- The system SHALL upload the original photo to Azure Blob Storage at path `aspr-photos/{photoId}/original`.
- The system SHALL upload renditions to Azure Blob Storage at path `renditions/{photoId}/{variant}.webp`.
- The system SHALL store photo metadata (including EXIF data) in the `photos` database table.
- The system SHALL return a success response with `photoId` and file size upon successful upload.
- Blob IDs SHALL be lowercase UUIDs.

#### FR-2.2.5 Upload User Interface
- The upload page SHALL implement a wizard flow: welcome → pin → photos → metadata → uploading → success.
- The system SHALL display a branded ASPR logo preloader on initial load (2-second animation sequence).
- Returning users with a valid session SHALL skip the preloader and resume at the photo selection step.
- The photos step SHALL provide a camera/file selection area with preview strip.
- The metadata step SHALL provide fields for incident ID, GPS coordinates, and notes.
- The uploading step SHALL show animated progress with sequential upload counter.
- The success step SHALL display photo count and offer "Take More" and "View Gallery" actions.
- Page transitions SHALL use Framer Motion with sync overlap (absolute-positioned steps) for seamless animations with no flash or gap between steps.

### 2.3 Photo Gallery

#### FR-2.3.1 Gallery View
- The system SHALL provide a photo gallery at `/gallery`.
- The gallery SHALL display thumbnails in a responsive grid layout.
- The gallery SHALL show photo details (filename, size, dimensions, metadata).
- Photos SHALL be ordered by upload date (newest first).
- Only photos belonging to the authenticated session SHALL be displayed.

#### FR-2.3.2 Photo Actions
- Users SHALL be able to download the original full-resolution image.
- Users SHALL be able to delete photos with confirmation.
- Photo deletion SHALL remove both blob storage files and the database record.

#### FR-2.3.3 Filtering
- The gallery SHALL support filtering photos by incident ID.

### 2.4 Admin Dashboard

#### FR-2.4.1 PIN Creation & Session Management
- Admins SHALL be able to create new 6-digit PINs via the web dashboard or CLI tool.
- The system SHALL generate PINs using CSPRNG (`crypto.randomInt(100000, 999999)`).
- PINs SHALL be stored as bcrypt hashes (10 salt rounds) in NVARCHAR(72) column.
- Admins SHALL be able to assign a team name to each PIN (defaults to "Anonymous").
- Created PINs SHALL have a 48-hour expiration.
- The plaintext PIN SHALL be returned only once at creation and cannot be retrieved afterward.
- The admin dashboard SHALL display all sessions with status (active, expired, revoked), team name, photo count, and total upload size.
- Admins SHALL be able to revoke active sessions (deactivate PINs).
- Admins SHALL be able to reactivate revoked sessions if not yet expired.

#### FR-2.4.2 Admin Photo Management
- The admin dashboard SHALL provide a tabbed interface with "PINs" and "Photos" views.
- The Photos tab SHALL display a virtual-scroll photo grid with cursor-based pagination (max 100 per page).
- The photo grid SHALL support filtering by: search text, incident ID, photo status, date range, session ID, and tags.
- The photo grid SHALL support sorting by: date (newest/oldest), filename, file size.
- Each photo card SHALL display thumbnail, filename, upload date, status badge, and incident ID.
- The system SHALL support multi-select via checkboxes on photo cards.

#### FR-2.4.3 Photo Detail Sidebar
- Selecting a photo SHALL open a detail sidebar displaying:
  - Full metadata: filename, dimensions, file size, MIME type, upload date
  - EXIF data: camera make/model, focal length, aperture, ISO, date taken
  - Geolocation: latitude, longitude, location name
  - Status and storage tier
  - Incident ID, notes, and tags
- Admins SHALL be able to edit metadata inline: location name, notes, incident ID, status, storage tier.
- Metadata edits SHALL be audit-logged with the admin's email and timestamp.

#### FR-2.4.4 Tag System
- The system SHALL support a tag system with categories: status, priority, type, timeline, and custom.
- Tags SHALL have a name, category, and optional color.
- Admins SHALL be able to create, assign, and remove tags on photos.
- The system SHALL provide tag autocomplete with category filtering.
- Tags SHALL be searchable via the photo filter bar.

#### FR-2.4.5 Bulk Operations
- Admins SHALL be able to perform bulk operations on selected photos:
  - **Bulk Delete** — remove selected photos and all renditions from blob storage
  - **Bulk Tag** — assign or remove tags from multiple photos
  - **Bulk Status Change** — update status (active, reviewed, flagged, archived) for selected photos
  - **Bulk Download** — download selected photos as a client-side ZIP file via signed URLs
- A floating bulk action bar SHALL appear when photos are selected, showing selection count and available actions.

#### FR-2.4.6 Photo Editor
- The admin dashboard SHALL include an inline photo editor supporting:
  - Crop (react-advanced-cropper with aspect ratio presets)
  - Rotate (90-degree increments)
  - Annotate (canvas-based drawing via Konva/react-konva)
- Edited photos SHALL be saved as new renditions; originals SHALL be preserved.

#### FR-2.4.7 Admin Upload
- Admins SHALL be able to upload photos directly via drag-and-drop bulk upload panel.
- Admin uploads SHALL support up to 50 files per batch, 50 MB per file.
- Admin uploads SHALL generate all 3 renditions (thumb_sm, thumb_md, web) and extract EXIF data.

#### FR-2.4.8 Dashboard Statistics
- The admin dashboard SHALL display aggregate statistics:
  - Total photo count and total storage size
  - Photo count by incident
  - Daily upload volume
  - Top uploading teams

#### FR-2.4.9 Admin API
- `POST /api/auth/create-session` SHALL create a new PIN and return `{ id, pin, team_name }`.
- `GET /api/admin/sessions` SHALL list all sessions with photo counts and status.
- `PATCH /api/admin/sessions/[id]` SHALL revoke or reactivate sessions.
- `GET /api/admin/photos` SHALL return paginated, filtered photo lists.
- `GET /api/admin/photos/stats` SHALL return aggregate statistics.
- `POST /api/admin/photos/bulk` SHALL perform bulk operations.
- `POST /api/admin/photos/bulk-download` SHALL return signed URLs for ZIP download.
- `GET /api/admin/photos/tags` SHALL return available tags with category filtering.
- `POST /api/admin/photos/tags` SHALL create new tags.
- `PATCH /api/admin/photos/[id]` SHALL update photo metadata.
- `DELETE /api/admin/photos/[id]` SHALL delete a photo and all renditions.
- `POST /api/admin/photos/upload` SHALL handle admin bulk uploads with EXIF extraction.
- `POST /api/admin/migrate` SHALL run database schema migrations.
- All admin endpoints SHALL require Entra ID authentication or fallback `x-admin-token` header.

#### FR-2.4.10 Audit Logging
- All admin operations SHALL be logged to the `admin_audit_log` table.
- Audit log entries SHALL record: entity type, entity ID, action, performer email, IP address, details JSON, and timestamp.
- The audit log SHALL be immutable (insert-only, no updates or deletes).

---

## 3. Non-Functional Requirements

### 3.1 Security

#### NFR-3.1.1 Rate Limiting

| Endpoint | Max Attempts | Window | Lockout |
|---|---|---|---|
| PIN Validation (`/api/auth/validate-pin`) | 5 | 60 seconds | 15 minutes |
| Admin Auth (failed attempts) | 3 | 60 seconds | 30 minutes |
| PIN Creation (`/api/auth/create-session`) | 20 | 60 seconds | None |
| Photo Upload (`/api/photos/upload`) | 50 | 1 hour | None |

- Rate limiting SHALL be enforced per IP address.
- Rate limit state SHALL be stored in-memory with automatic cleanup.

#### NFR-3.1.2 Input Validation
- All user inputs SHALL be validated server-side before processing.
- PINs SHALL match the pattern `^\d{6}$`.
- All database queries SHALL use parameterized inputs to prevent SQL injection.

#### NFR-3.1.3 Security Headers
The application SHALL set hardened HTTP headers on all responses including:
- `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`
- `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`
- The `X-Powered-By` header SHALL be suppressed.

#### NFR-3.1.4 Audit Logging
The system SHALL log security events: AUTH_SUCCESS, AUTH_FAILURE, PIN_CREATED, UPLOAD_SUCCESS, UPLOAD_FAILURE, RATE_LIMIT_EXCEEDED. Admin operations SHALL be persisted to the `admin_audit_log` database table with entity, action, performer, IP, and details.

#### NFR-3.1.5 Cryptographic Security
- PINs SHALL be generated using CSPRNG (NIST SP 800-63B).
- PINs SHALL be stored as bcrypt hashes (10 salt rounds).
- Admin token comparison SHALL use `crypto.timingSafeEqual`.
- Image URLs SHALL use HMAC-SHA256 signatures.

#### NFR-3.1.6 Web Application Firewall
- Azure Front Door WAF SHALL enforce OWASP 3.2 managed rules in Prevention mode.
- Azure Front Door WAF SHALL enforce Microsoft Bot Manager Rule Set 1.1 for bot protection.
- The WAF security policy SHALL be applied to the app CDN endpoint.

#### NFR-3.1.7 Network Isolation
- Azure Blob Storage SHALL be accessible only via Private Link (no public endpoint).
- Azure App Service SHALL accept traffic only from Azure Front Door (via service tag and `X-Azure-FDId` header validation).
- Azure SQL Database SHALL be accessible only within the VNet (private endpoint).

### 3.2 Performance
- Thumbnail generation SHALL complete server-side using Sharp.
- The application SHALL use Next.js standalone output mode.
- Source maps SHALL be disabled in production.
- Response compression SHALL be enabled.
- Image responses SHALL include CDN-friendly cache headers (`s-maxage=604800`).
- Hero background images SHALL include long-lived cache headers (`max-age=604800, immutable`).
- The admin photo grid SHALL use @tanstack/react-virtual for virtual scrolling to handle large photo sets.
- Photo lists SHALL use cursor-based pagination (max 100 per page) with covering indexes.

### 3.3 Reliability
- In development mode, the application SHALL fall back to an in-memory mock database.
- The system SHALL automatically create the `aspr-photos` container if it does not exist.
- Azure Front Door SHALL perform health probes to `GET /api/health` every 30 seconds.
- The health endpoint SHALL return `{ status: "ok", timestamp }` with HTTP 200.

### 3.4 Usability
- The application SHALL use ASPR/HHS government branding (Primary Blue #155197, Dark Blue #062E61, Gold #AA6404, Red #990000).
- The UI SHALL use a glassmorphic design system with Tailwind CSS.
- The application SHALL be mobile-responsive (mobile-first design).
- Typography SHALL use Bebas Neue (display) and Open Sans (body).
- Icons SHALL use the lucide-react library.
- Animations SHALL use Framer Motion with smooth sync-overlap page transitions (no flash between steps).
- Smooth scrolling SHALL be provided by Lenis.
- The application SHALL display a branded ASPR logo preloader on initial load with a keyframe animation sequence (fade in from below, hold, exit upward, background fade).
- The PIN entry back button SHALL use a circular chevron icon button (modern, minimal).
- The Get Started CTA SHALL use a glass pill style with translucent background and arrow icon.

### 3.5 Deployment & Infrastructure

| Azure Service | Purpose |
|---|---|
| Azure App Service | Application hosting (Node.js 22.x, Linux) |
| Azure SQL Database | Session and photo metadata storage |
| Azure Blob Storage | Photo and rendition file storage |
| Azure Key Vault | Secrets management (shared: kv-ociomicro-eus2-01) |
| Azure Front Door Premium | CDN, WAF, Private Link routing (shared profile: cdn-ociomicro-premium-eus2-01) |

- The application SHALL deploy automatically via GitHub Actions on push to `main`.
- Deployment SHALL use publish profile authentication with `azure/webapps-deploy@v2` (ZipDeploy).
- Database schema migrations SHALL be triggered post-deploy via `POST /api/admin/migrate`.
- The App Service startup command SHALL be `node server.js`.
- Azure Front Door SHALL provide two CDN endpoints:
  - **cdn-asprphotos** — blob renditions (`/renditions/*`)
  - **cdn-asprphotos-app** — application traffic (`/*`)
- Both CDN origins SHALL use Private Link connections (approved after deployment).

---

## 4. Data Model

### 4.1 upload_sessions

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PK, DEFAULT NEWID() | UUID |
| pin | NVARCHAR(72) | NOT NULL | bcrypt hash of 6-digit PIN |
| team_name | NVARCHAR(255) | NOT NULL | Team identifier |
| is_active | BIT | DEFAULT 1 | Active flag (revocation) |
| created_at | DATETIME | DEFAULT GETDATE() | Creation timestamp |
| expires_at | DATETIME | NOT NULL | Expiration (48 hours) |

### 4.2 photos

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PK | UUID (v4) |
| session_id | NVARCHAR(36) | FK → upload_sessions.id | Owning session |
| file_name | NVARCHAR(255) | NOT NULL | Original filename |
| blob_url | NVARCHAR(MAX) | NOT NULL | Azure Blob Storage URL |
| file_size | BIGINT | NOT NULL | Size in bytes |
| width | INT | NULL | Image width (px) |
| height | INT | NULL | Image height (px) |
| mime_type | NVARCHAR(50) | NULL | MIME type |
| latitude | FLOAT | NULL | GPS latitude |
| longitude | FLOAT | NULL | GPS longitude |
| location_name | NVARCHAR(255) | NULL | Formatted location |
| notes | NVARCHAR(MAX) | NULL | User notes |
| incident_id | NVARCHAR(50) | NULL | Incident identifier |
| status | VARCHAR(20) | DEFAULT 'active' | Photo status: active, reviewed, flagged, archived |
| storage_tier | VARCHAR(20) | DEFAULT 'hot' | Storage tier: hot, cool, archive |
| date_taken | DATETIME | NULL | EXIF date/time original |
| camera_info | VARCHAR(500) | NULL | Compact EXIF string (make, lens, aperture, ISO) |
| batch_id | NVARCHAR(36) | NULL | Upload batch reference |
| created_at | DATETIME | DEFAULT GETDATE() | Upload timestamp |
| updated_at | DATETIME | NULL | Last metadata edit |
| updated_by | NVARCHAR(255) | NULL | Admin email who last edited |

### 4.3 photo_renditions

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| photo_id | NVARCHAR(36) | FK → photos.id | Parent photo |
| variant_type | VARCHAR(20) | NOT NULL | Rendition type: thumb_sm, thumb_md, web |
| blob_path | NVARCHAR(500) | NOT NULL | Blob storage path |
| width | INT | NULL | Rendition width (px) |
| height | INT | NULL | Rendition height (px) |
| file_size | BIGINT | NULL | Rendition size in bytes |
| created_at | DATETIME | DEFAULT GETDATE() | Generation timestamp |

### 4.4 photo_exif

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| photo_id | NVARCHAR(36) | FK → photos.id, UNIQUE | Parent photo |
| camera_make | NVARCHAR(100) | NULL | Camera manufacturer |
| camera_model | NVARCHAR(100) | NULL | Camera model |
| focal_length | FLOAT | NULL | Focal length (mm) |
| aperture | FLOAT | NULL | F-number |
| iso | INT | NULL | ISO sensitivity |
| exposure_time | NVARCHAR(20) | NULL | Shutter speed string |
| date_taken | DATETIME | NULL | EXIF DateTimeOriginal |
| gps_latitude | FLOAT | NULL | EXIF GPS latitude |
| gps_longitude | FLOAT | NULL | EXIF GPS longitude |
| raw_json | NVARCHAR(MAX) | NULL | Full EXIF JSON blob |

### 4.5 tags

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| name | NVARCHAR(100) | NOT NULL, UNIQUE | Tag display name |
| category | VARCHAR(20) | NOT NULL | Category: status, priority, type, timeline, custom |
| color | VARCHAR(7) | NULL | Hex color code |
| created_at | DATETIME | DEFAULT GETDATE() | Creation timestamp |

### 4.6 photo_tags

| Column | Type | Constraints | Description |
|---|---|---|---|
| photo_id | NVARCHAR(36) | PK, FK → photos.id | Photo reference |
| tag_id | INT | PK, FK → tags.id | Tag reference |
| created_at | DATETIME | DEFAULT GETDATE() | Assignment timestamp |

### 4.7 photo_edits

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| photo_id | NVARCHAR(36) | FK → photos.id | Edited photo |
| edit_type | VARCHAR(20) | NOT NULL | Edit type: crop, rotate, annotate |
| params | NVARCHAR(MAX) | NULL | Edit parameters JSON |
| result_blob_path | NVARCHAR(500) | NULL | Path to edited rendition |
| performed_by | NVARCHAR(255) | NOT NULL | Admin email |
| created_at | DATETIME | DEFAULT GETDATE() | Edit timestamp |

### 4.8 admin_audit_log

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| entity_type | VARCHAR(50) | NOT NULL | Entity: photo, session, tag |
| entity_id | NVARCHAR(36) | NOT NULL | Target entity ID |
| action | VARCHAR(50) | NOT NULL | Action performed |
| performed_by | NVARCHAR(255) | NOT NULL | Admin email or 'admin-token' |
| ip_address | VARCHAR(45) | NULL | Client IP address |
| details | NVARCHAR(MAX) | NULL | Additional context JSON |
| created_at | DATETIME | DEFAULT GETDATE() | Event timestamp |

### 4.9 upload_batches

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PK, DEFAULT NEWID() | Batch UUID |
| session_id | NVARCHAR(36) | FK → upload_sessions.id | Upload session |
| photo_count | INT | DEFAULT 0 | Number of photos in batch |
| total_size | BIGINT | DEFAULT 0 | Total batch size in bytes |
| uploaded_by | NVARCHAR(255) | NULL | Uploader identity |
| created_at | DATETIME | DEFAULT GETDATE() | Batch start time |

### 4.10 v_incident_summary (View)

Aggregation view providing per-incident photo statistics:
- Incident ID, total photo count, total file size, earliest and latest upload dates, distinct team count.

### 4.11 Indexes

| Index | Table | Column(s) | Purpose |
|---|---|---|---|
| IX_photos_session_id | photos | session_id | Session photo lookups |
| IX_sessions_expires | upload_sessions | expires_at | Expiration queries |
| IX_photos_incident_id | photos | incident_id | Incident filtering |
| IX_photos_created_at | photos | created_at DESC | Date-sorted listing |
| IX_photos_status | photos | status | Status filtering |
| IX_photos_admin_list | photos | created_at DESC, status, incident_id | Covering index for admin grid |
| IX_photo_renditions_photo | photo_renditions | photo_id | Rendition lookups |
| IX_photo_tags_photo | photo_tags | photo_id | Tag lookups by photo |
| IX_photo_tags_tag | photo_tags | tag_id | Photo lookups by tag |
| IX_audit_log_entity | admin_audit_log | entity_type, entity_id | Audit trail queries |

### 4.12 Relationships
- One `upload_session` → Many `photos` (via `session_id` foreign key)
- One `photo` → Many `photo_renditions` (via `photo_id`)
- One `photo` → One `photo_exif` (via `photo_id`, unique)
- Many `photos` ↔ Many `tags` (via `photo_tags` junction table)
- One `photo` → Many `photo_edits` (via `photo_id`)
- One `upload_batch` → Many `photos` (via `batch_id`)
- A single PIN/session can be shared across multiple team members

---

## 5. API Specification

### 5.1 Authentication Endpoints

#### POST /api/auth/validate-pin
Authenticate a field team member with a PIN.

| Property | Details |
|---|---|
| Auth | None |
| Request Body | `{ "pin": "123456" }` |
| Success (200) | `{ "sessionId": "uuid", "teamName": "string", "token": "jwt" }` |
| Errors | 400 (invalid format), 401 (invalid/expired PIN), 429 (rate limited) |

#### POST /api/auth/create-session
Create a new PIN (admin only).

| Property | Details |
|---|---|
| Auth | Entra ID session or `x-admin-token` header (fallback) |
| Request Body | `{ "teamName": "Team A" }` (optional) |
| Success (200) | `{ "id": "uuid", "pin": "654321", "team_name": "Team A" }` |
| Errors | 401 (invalid admin token), 429 (rate limited) |

### 5.2 Photo Endpoints (Field Teams)

#### POST /api/photos/upload
Upload a photo with metadata.

| Property | Details |
|---|---|
| Auth | `Authorization: Bearer {JWT}` |
| Content-Type | `multipart/form-data` |
| Fields | `photo` (required), `notes`, `incidentId`, `latitude`, `longitude`, `locationName` |
| Success (200) | `{ "success": true, "photoId": "uuid", "size": "X.XX MB" }` |
| Errors | 400 (invalid file/metadata), 401 (unauthorized), 429 (rate limited) |

#### GET /api/photos
List photos for the authenticated session.

| Property | Details |
|---|---|
| Auth | `Authorization: Bearer {JWT}` |
| Success (200) | `{ "photos": [{ id, fileName, thumbnailUrl, originalUrl, ... }] }` |

#### DELETE /api/photos/[id]
Delete a photo (must belong to authenticated session).

| Property | Details |
|---|---|
| Auth | `Authorization: Bearer {JWT}` |
| Success (200) | `{ "success": true }` |
| Errors | 401 (unauthorized), 404 (not found) |

#### GET /api/photos/[id]/image
Serve an image via signed URL proxy.

| Property | Details |
|---|---|
| Auth | Signed URL (query params: `type`, `exp`, `sig`) |
| Success (200) | Binary image data with CDN cache headers |
| Errors | 403 (invalid signature), 404 (not found) |

### 5.3 Admin Endpoints

#### GET /api/admin/photos
List photos with cursor-based pagination and filtering.

| Property | Details |
|---|---|
| Auth | Entra ID session or `x-admin-token` header |
| Query Params | `cursor`, `limit` (max 100), `search`, `incident`, `status`, `dateFrom`, `dateTo`, `sessionId`, `tags`, `sort` |
| Success (200) | `{ "photos": [...], "total": 500, "nextCursor": "base64..." }` |

#### GET /api/admin/photos/stats
Aggregate photo statistics.

| Property | Details |
|---|---|
| Auth | Admin |
| Success (200) | `{ "totalPhotos": 500, "totalSize": 1073741824, "incidents": [...], "dailyUploads": [...], "topTeams": [...] }` |

#### POST /api/admin/photos/bulk
Perform bulk operations on selected photos.

| Property | Details |
|---|---|
| Auth | Admin |
| Request Body | `{ "action": "delete/tag/status", "photoIds": ["uuid", ...], "value": "..." }` |
| Success (200) | `{ "success": true, "affected": 10 }` |

#### POST /api/admin/photos/bulk-download
Generate signed URLs for bulk download.

| Property | Details |
|---|---|
| Auth | Admin |
| Request Body | `{ "photoIds": ["uuid", ...] }` |
| Success (200) | `{ "urls": [{ "photoId": "uuid", "url": "signed-url", "fileName": "..." }] }` |

#### GET /api/admin/photos/tags
List available tags with optional category filter.

| Property | Details |
|---|---|
| Auth | Admin |
| Query Params | `q` (search), `category` |
| Success (200) | `{ "tags": [{ "id": 1, "name": "Urgent", "category": "priority", "color": "#990000" }] }` |

#### POST /api/admin/photos/tags
Create a new tag.

| Property | Details |
|---|---|
| Auth | Admin |
| Request Body | `{ "name": "Urgent", "category": "priority", "color": "#990000" }` |
| Success (201) | `{ "id": 1, "name": "Urgent", "category": "priority", "color": "#990000" }` |

#### PATCH /api/admin/photos/[id]
Update photo metadata.

| Property | Details |
|---|---|
| Auth | Admin |
| Request Body | `{ "location_name": "...", "notes": "...", "incident_id": "...", "status": "...", "storage_tier": "..." }` |
| Success (200) | `{ "success": true }` |

#### DELETE /api/admin/photos/[id]
Delete a photo and all renditions.

| Property | Details |
|---|---|
| Auth | Admin |
| Success (200) | `{ "success": true }` |
| Errors | 404 (not found) |

#### POST /api/admin/photos/upload
Bulk upload with EXIF extraction and multi-rendition processing.

| Property | Details |
|---|---|
| Auth | Admin |
| Content-Type | `multipart/form-data` |
| Limits | Max 50 files, 50 MB per file |
| Success (200) | `{ "uploaded": 10, "failed": 0 }` |

#### GET /api/admin/sessions
List all upload sessions with photo counts.

| Property | Details |
|---|---|
| Auth | Admin |
| Success (200) | `{ "sessions": [{ "id": "uuid", "team_name": "...", "status": "active", "photoCount": 15, "totalSize": 52428800 }] }` |

#### PATCH /api/admin/sessions/[id]
Revoke or reactivate a session.

| Property | Details |
|---|---|
| Auth | Admin |
| Request Body | `{ "action": "revoke" }` or `{ "action": "reactivate" }` |
| Success (200) | `{ "success": true }` |

#### POST /api/admin/migrate
Run database schema migrations.

| Property | Details |
|---|---|
| Auth | Admin (`x-admin-token` header) |
| Success (200) | `{ "success": true, "migrations": [...] }` |

#### GET /api/health
Health check for Front Door probes.

| Property | Details |
|---|---|
| Auth | None |
| Success (200) | `{ "status": "ok", "timestamp": "2026-02-07T00:00:00.000Z" }` |

---

## 6. System Limits

| Parameter | Value |
|---|---|
| PIN length | 6 digits |
| PIN expiration | 48 hours |
| JWT token expiration | 24 hours |
| Signed URL expiration | 24 hours |
| Max upload file size | 50 MB |
| Max admin batch upload | 50 files |
| Supported image types | JPEG, PNG, WebP |
| Renditions per photo | 3 (thumb_sm, thumb_md, web) |
| Admin photo grid page size | 100 (cursor-based) |
| Max notes length | 1,000 characters |
| Max team name length | 255 characters |

---

## 7. Pages & Navigation

| Route | Page | Access | Description |
|---|---|---|---|
| `/` | Upload Wizard | Public → Authenticated | Multi-step: preloader, welcome, auth (PIN / Entra ID / Login.gov / ID.me), photos, metadata, upload, success |
| `/gallery` | Photo Gallery | Authenticated (JWT) | Review, download, delete uploaded photos |
| `/admin` | Admin Dashboard | Entra ID SSO (HHS tenant) | Tabbed: PINs (session management) and Photos (grid, detail, bulk ops, editor, tags, stats) |
| `/api/auth/[...nextauth]` | Auth.js Routes | System | OIDC callback handlers for Entra ID, Login.gov, ID.me |
| `/api/health` | Health Check | Public | Front Door probe endpoint |

---

## 8. Future Considerations

- Geospatial Map View — plot photos on a map using stored GPS coordinates
- Photo Search & Filtering — full-text search across notes and metadata
- Redis Rate Limiting — distributed rate limiting for multi-instance deployments
- Azure Application Insights — production monitoring and alerting
- ID.me First Responder Verification — automatic role assignment using ID.me group affiliation
- Login.gov IAL2 Enforcement — require identity proofing for external responders based on ASPR policy
- Multi-rendition CDN rules — edge-based image resizing and format negotiation

---

## 9. Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Federal Project Sponsor | | | |
| Technical Lead | | | |
| Security Officer | | | |
| Operations Lead | | | |

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-02-06 | HHS ASPR / Leidos | Initial requirements document |
| 1.1 | 2026-02-07 | HHS ASPR / Leidos | Updated: bcrypt PINs, 48h expiry, gallery page, signed URLs, wizard flow, glassmorphic UI, Lenis scroll |
| 1.2 | 2026-02-07 | HHS ASPR / Leidos | Authentication roadmap: Entra ID SSO for admin and uploads, Login.gov and ID.me for external responders, PIN retained as primary field method |
| 2.0 | 2026-02-07 | HHS ASPR / Leidos | Post-deployment update: admin photo management (grid, detail sidebar, bulk ops, photo editor, tag system, EXIF extraction), multi-rendition image pipeline, Azure Front Door Premium CDN with WAF and Private Link, CI/CD pipeline, expanded 8-table schema, logo preloader, smooth sync-overlap transitions |
