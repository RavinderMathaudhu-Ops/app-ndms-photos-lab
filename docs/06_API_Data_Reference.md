# API & Data Reference

**ASPR Photo Repository Application**

| Field | Value |
|---|---|
| System Name | ASPR Photo Repository |
| Document Version | 2.0 |
| Last Updated | 2026-02-07 |
| Owner | HHS ASPR / Leidos |

---

## 1. Overview

### 1.1 API Base URL

Production (via Front Door):

```
https://cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net
```

Direct App Service (restricted to Front Door):

```
https://app-aspr-photos.azurewebsites.net
```

### 1.2 Authentication Methods

| Method | Header / Mechanism | Used By |
|---|---|---|
| JWT Bearer Token | `Authorization: Bearer <token>` | Field team photo operations (all auth methods) |
| Entra ID SSO | Auth.js OIDC session | Admin access (primary); HHS staff upload |
| Login.gov | Auth.js OIDC session | External responder upload |
| ID.me | Auth.js OIDC session | External responder upload |
| Admin Token (fallback) | `x-admin-token: <token>` | Admin API when SSO unavailable |
| Signed URL | Query params: `exp`, `sig` | Image proxy access |

### 1.3 Common Response Headers

All responses include security headers:
- `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`
- `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`

### 1.4 Admin Authentication

All `/api/admin/*` endpoints require one of:
1. **Entra ID SSO session** — Admin must be in the ASPR Photo Admins security group
2. **`x-admin-token` header** — Must match the `ADMIN_TOKEN` environment variable (timing-safe comparison)

The admin auth middleware (`lib/adminAuth.ts`) returns an `AdminContext` object containing the admin's identity (email or "token"), which is recorded in the audit log.

---

## 2. Authentication Endpoints

### 2.0 GET/POST /api/auth/[...nextauth]

Auth.js (NextAuth v5) OIDC callback handlers for SSO providers.

**Supported Providers:**

| Provider | Callback Path | Protocol |
|---|---|---|
| Microsoft Entra ID | `/api/auth/callback/microsoft-entra-id` | OIDC authorization code |
| Login.gov | `/api/auth/callback/logingov` | OIDC (`private_key_jwt`) |
| ID.me | `/api/auth/callback/idme` | OIDC + PKCE |

**Session Flow:**
1. User clicks SSO provider button on the welcome screen or admin page
2. Redirected to provider's hosted login page (with MFA)
3. Provider redirects back to callback URL with authorization code
4. Auth.js exchanges code for ID token, creates server-side session
5. Application issues a JWT Bearer token for subsequent API calls

These routes are managed entirely by Auth.js and do not require manual implementation.

### 2.1 POST /api/auth/validate-pin

Authenticate a field team member with a 6-digit PIN.

**Request:**

| Property | Value |
|---|---|
| Method | POST |
| Content-Type | application/json |
| Authentication | None |
| Rate Limit | 5 attempts / 60s, then 15-min lockout |

```json
{
  "pin": "123456"
}
```

**Success Response (200):**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "teamName": "Alpha Team",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Error Responses:**

| Status | Body | Condition |
|---|---|---|
| 400 | `{ "error": "PIN must be exactly 6 digits" }` | Invalid PIN format |
| 401 | `{ "error": "Invalid or expired PIN. 3 attempts remaining." }` | Wrong or expired PIN |
| 429 | `{ "error": "Too many attempts. Try again in 900 seconds." }` | Rate limit exceeded |
| 500 | `{ "error": "Validation failed" }` | Server error |

### 2.2 POST /api/auth/create-session

Create a new PIN and upload session (admin only).

**Request:**

| Property | Value |
|---|---|
| Method | POST |
| Content-Type | application/json |
| Authentication | Entra ID session or `x-admin-token` header (fallback) |
| Rate Limit | 20 / 60s (creation); 3 / 60s + 30-min lockout (auth failures) |

```json
{
  "teamName": "Hurricane Response Team"
}
```

`teamName` is optional; defaults to "Anonymous" if omitted.

**Success Response (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "team_name": "Hurricane Response Team",
  "pin": "847291"
}
```

**Note:** The plaintext PIN is returned only once at creation. It is stored as a bcrypt hash and cannot be retrieved afterward.

**Error Responses:**

| Status | Body | Condition |
|---|---|---|
| 400 | `{ "error": "Team name contains invalid characters" }` | Invalid team name |
| 401 | `{ "error": "Unauthorized" }` | Invalid admin token |
| 429 | `{ "error": "Too many failed authentication attempts" }` | Admin auth rate limited |
| 500 | `{ "error": "Failed to create PIN" }` | Server error |

---

## 3. Photo Endpoints (Field Team)

### 3.1 POST /api/photos/upload

Upload a photo with optional metadata.

**Request:**

| Property | Value |
|---|---|
| Method | POST |
| Content-Type | multipart/form-data |
| Authentication | `Authorization: Bearer <JWT>` |
| Rate Limit | 50 / hour |

**Form Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `photo` | File | Yes | JPEG, PNG, or WebP; max 50 MB; safe filename |
| `notes` | String | No | Max 1,000 characters |
| `incidentId` | String | No | Max 50 chars, alphanumeric + hyphens/underscores |
| `latitude` | Float | No | -90 to 90 |
| `longitude` | Float | No | -180 to 180 |
| `locationName` | String | No | Formatted coordinate string |

**Success Response (200):**

```json
{
  "success": true,
  "photoId": "550e8400-e29b-41d4-a716-446655440000",
  "size": "4.25 MB"
}
```

**Processing Pipeline:**
1. File validated (type, size, filename)
2. Image metadata extracted via Sharp (width, height, format)
3. EXIF data extracted via exifr (camera, GPS, date taken)
4. Thumbnail generated: max 400x300 px, WebP format, quality 80
5. Original + thumbnail uploaded to Azure Blob Storage
6. Metadata + EXIF records inserted into SQL database
7. Audit event logged (UPLOAD_SUCCESS)

**Error Responses:**

| Status | Body | Condition |
|---|---|---|
| 400 | `{ "error": "File type not allowed..." }` | Invalid file or metadata |
| 401 | `{ "error": "Unauthorized" }` | Missing or invalid JWT |
| 429 | `{ "error": "Upload rate limit exceeded" }` | Rate limit exceeded |
| 500 | `{ "error": "Upload failed" }` | Server error |

### 3.2 GET /api/photos

List all photos for the authenticated session.

**Request:**

| Property | Value |
|---|---|
| Method | GET |
| Authentication | `Authorization: Bearer <JWT>` |
| Cache-Control | `private, no-cache` |

**Success Response (200):**

```json
{
  "photos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "fileName": "IMG_001.jpg",
      "thumbnailUrl": "/api/photos/550e.../image?type=thumbnail&exp=...&sig=...",
      "originalUrl": "/api/photos/550e.../image?type=original&exp=...&sig=...",
      "fileSize": 4456789,
      "width": 4032,
      "height": 3024,
      "mimeType": "image/jpeg",
      "latitude": 38.8977,
      "longitude": -77.0365,
      "locationName": "38.8977, -77.0365",
      "notes": "Flooding at intersection",
      "incidentId": "HU-2024-001",
      "createdAt": "2026-02-07T14:30:00.000Z"
    }
  ]
}
```

**Notes:**
- Photos are ordered by `created_at DESC` (newest first)
- Image URLs are signed with HMAC-SHA256 (24-hour TTL)
- Only photos belonging to the authenticated session are returned

### 3.3 DELETE /api/photos/[id]

Delete a photo (must belong to the authenticated session).

**Request:**

| Property | Value |
|---|---|
| Method | DELETE |
| Authentication | `Authorization: Bearer <JWT>` |

**Success Response (200):**

```json
{
  "success": true
}
```

**Processing:**
1. Verify photo belongs to the authenticated session
2. Delete original blob from Azure Blob Storage
3. Delete thumbnail blob from Azure Blob Storage
4. Delete photo record from SQL database

### 3.4 GET /api/photos/[id]/image

Proxy an image from Azure Blob Storage using a signed URL.

**Request:**

| Property | Value |
|---|---|
| Method | GET |
| Authentication | Signed URL (query params) |

**Query Parameters:**

| Parameter | Required | Description |
|---|---|---|
| `type` | Yes | `thumbnail` or `original` |
| `exp` | Yes | Unix timestamp expiry |
| `sig` | Yes | HMAC-SHA256 signature (32 chars) |

**Signature Verification:**

```
expected = HMAC-SHA256(photoId:type:exp, SIGNING_KEY).slice(0, 32)
```

**Success Response (200):**
- Binary image data streamed from Azure Blob Storage
- `Content-Type`: `image/webp` (thumbnails) or original MIME type
- `Cache-Control: public, max-age=3600, s-maxage=604800, immutable`

### 3.5 POST /api/photos/fix-blobs

Admin utility to fix content types on existing blobs.

**Request:**

| Property | Value |
|---|---|
| Method | POST |
| Authentication | `Authorization: Bearer <JWT>` |

**Success Response (200):**

```json
{
  "fixed": 15,
  "total": 20
}
```

---

## 4. Admin Endpoints

All admin endpoints require admin authentication (Entra ID session or `x-admin-token` header). Every operation is recorded in the `admin_audit_log` table.

### 4.1 GET /api/admin/photos

List all photos with filtering, sorting, and cursor-based pagination.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `cursor` | String | (none) | Cursor for pagination (photo ID from previous page) |
| `limit` | Integer | 50 | Number of photos per page (max 200) |
| `search` | String | (none) | Search filename, notes, incident ID |
| `incident` | String | (none) | Filter by incident ID |
| `status` | String | (none) | Filter by status (pending, reviewed, approved, flagged) |
| `dateFrom` | ISO Date | (none) | Filter by upload date (from) |
| `dateTo` | ISO Date | (none) | Filter by upload date (to) |
| `tags` | String | (none) | Comma-separated tag names |
| `sort` | String | `date_desc` | Sort order: date_desc, date_asc, size_desc, size_asc, name_asc |

**Success Response (200):**

```json
{
  "photos": [
    {
      "id": "550e8400-...",
      "fileName": "IMG_001.jpg",
      "fileSize": 4456789,
      "width": 4032,
      "height": 3024,
      "mimeType": "image/jpeg",
      "latitude": 38.8977,
      "longitude": -77.0365,
      "locationName": "38.8977, -77.0365",
      "notes": "Flooding at intersection",
      "incidentId": "HU-2024-001",
      "status": "pending",
      "storageTier": "hot",
      "dateTaken": "2026-02-07T10:15:00.000Z",
      "cameraInfo": "iPhone 15 Pro",
      "batchId": "batch-123",
      "createdAt": "2026-02-07T14:30:00.000Z",
      "updatedAt": null,
      "updatedBy": null,
      "teamName": "Alpha Team",
      "tags": ["Flooding", "High Priority"],
      "thumbnailUrl": "https://cdn-asprphotos-.../renditions/550e.../thumb_md.webp"
    }
  ],
  "nextCursor": "next-photo-id",
  "hasMore": true,
  "total": 1247
}
```

### 4.2 PATCH /api/admin/photos/[id]

Update photo metadata.

**Request Body:**

```json
{
  "status": "reviewed",
  "notes": "Updated notes",
  "incidentId": "HU-2024-001",
  "locationName": "Updated location"
}
```

All fields are optional. Only provided fields are updated.

**Success Response (200):**

```json
{
  "success": true,
  "photo": { "id": "550e8400-...", "status": "reviewed", "updatedAt": "...", "updatedBy": "admin@hhs.gov" }
}
```

**Audit:** Logs `PHOTO_UPDATED` with changed fields in details.

### 4.3 DELETE /api/admin/photos/[id]

Delete a photo (any photo, admin privilege).

**Success Response (200):**

```json
{
  "success": true
}
```

**Processing:**
1. Delete original + thumbnail + rendition blobs
2. Delete photo_tags, photo_exif, photo_edits, photo_renditions records
3. Delete photo record
4. Audit log: `PHOTO_DELETED`

### 4.4 POST /api/admin/photos/bulk

Perform bulk operations on multiple photos.

**Request Body:**

```json
{
  "action": "delete",
  "photoIds": ["id-1", "id-2", "id-3"],
  "value": null
}
```

**Supported Actions:**

| Action | Value Field | Description |
|---|---|---|
| `delete` | (not used) | Delete all specified photos |
| `tag` | Tag name (string) | Assign a tag to all specified photos |
| `status` | Status value (string) | Change status of all specified photos |

**Success Response (200):**

```json
{
  "success": true,
  "affected": 3,
  "action": "delete"
}
```

**Audit:** Logs `BULK_DELETE`, `BULK_TAG`, or `BULK_STATUS_CHANGE` with photo IDs in details.

### 4.5 POST /api/admin/photos/bulk-download

Generate signed URLs for multiple photos for client-side ZIP download.

**Request Body:**

```json
{
  "photoIds": ["id-1", "id-2", "id-3"]
}
```

**Success Response (200):**

```json
{
  "urls": [
    { "id": "id-1", "fileName": "IMG_001.jpg", "url": "/api/photos/id-1/image?type=original&exp=...&sig=..." },
    { "id": "id-2", "fileName": "IMG_002.jpg", "url": "/api/photos/id-2/image?type=original&exp=...&sig=..." }
  ]
}
```

The client uses these signed URLs to fetch images and assemble a ZIP archive using JSZip + file-saver.

### 4.6 GET /api/admin/photos/tags

List all tags, optionally filtered by search query and category.

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `q` | String | Search tag name (partial match) |
| `category` | String | Filter by category (status, priority, type, timeline, custom) |

**Success Response (200):**

```json
{
  "tags": [
    { "id": 1, "name": "Flooding", "category": "type", "color": "#2477bd" },
    { "id": 2, "name": "High Priority", "category": "priority", "color": "#990000" }
  ]
}
```

### 4.7 POST /api/admin/photos/tags

Create a new tag.

**Request Body:**

```json
{
  "name": "Structural Damage",
  "category": "type",
  "color": "#604878"
}
```

**Success Response (201):**

```json
{
  "tag": { "id": 5, "name": "Structural Damage", "category": "type", "color": "#604878" }
}
```

**Audit:** Logs `TAG_CREATED`.

### 4.8 GET /api/admin/photos/stats

Get dashboard statistics.

**Success Response (200):**

```json
{
  "totalPhotos": 1247,
  "totalIncidents": 15,
  "dailyUploads": 42,
  "totalSizeBytes": 8567345678,
  "topTeams": [
    { "teamName": "Alpha Team", "photoCount": 245 },
    { "teamName": "FEMA Region 4", "photoCount": 189 }
  ],
  "statusBreakdown": {
    "pending": 800,
    "reviewed": 300,
    "approved": 120,
    "flagged": 27
  }
}
```

### 4.9 GET /api/admin/sessions

List all upload sessions.

**Success Response (200):**

```json
{
  "sessions": [
    {
      "id": "550e8400-...",
      "teamName": "Alpha Team",
      "isActive": true,
      "createdAt": "2026-02-07T08:00:00.000Z",
      "expiresAt": "2026-02-09T08:00:00.000Z",
      "photoCount": 45
    }
  ]
}
```

### 4.10 DELETE /api/admin/sessions/[id]

Revoke an upload session (deactivate the PIN).

**Success Response (200):**

```json
{
  "success": true
}
```

**Audit:** Logs `SESSION_REVOKED` with session ID and team name.

### 4.11 POST /api/admin/photos/upload

Upload photos as an admin (creates an admin-sourced batch).

**Request:**

| Property | Value |
|---|---|
| Method | POST |
| Content-Type | multipart/form-data |
| Authentication | Admin auth (Entra ID or x-admin-token) |

**Form Fields:** Same as field upload (§3.1), with automatic admin batch tracking.

**Success Response (200):**

```json
{
  "success": true,
  "photoId": "550e8400-...",
  "batchId": "batch-456",
  "size": "4.25 MB"
}
```

### 4.12 POST /api/admin/migrate

Run pending database schema migrations.

**Request:**

| Property | Value |
|---|---|
| Method | POST |
| Authentication | `x-admin-token` header |

**Success Response (200):**

```json
{
  "success": true,
  "migrations": [
    { "name": "add_photo_status_columns", "status": "applied" },
    { "name": "create_tags_tables", "status": "already_exists" }
  ]
}
```

Migrations are idempotent (use `IF NOT EXISTS` checks).

### 4.13 GET /api/health

Health check endpoint (unauthenticated, used by Front Door probe).

**Success Response (200):**

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-02-07T14:30:00.000Z"
}
```

**Error Response (503):**

```json
{
  "status": "unhealthy",
  "database": "disconnected",
  "error": "Connection timeout"
}
```

---

## 5. Data Model

### 5.1 upload_sessions

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PK, DEFAULT NEWID() | UUID |
| pin | NVARCHAR(72) | NOT NULL | bcrypt hash |
| team_name | NVARCHAR(255) | NOT NULL | Team identifier |
| is_active | BIT | DEFAULT 1 | Active flag |
| created_at | DATETIME | DEFAULT GETDATE() | Created |
| expires_at | DATETIME | NOT NULL | Expiration (48h) |

### 5.2 photos

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PK | UUID (v4, lowercase) |
| session_id | NVARCHAR(36) | FK → upload_sessions.id | Session owner |
| file_name | NVARCHAR(255) | NOT NULL | Original filename |
| blob_url | NVARCHAR(MAX) | NOT NULL | Blob Storage path |
| file_size | BIGINT | NOT NULL | Size in bytes |
| width | INT | NULL | Width (px) |
| height | INT | NULL | Height (px) |
| mime_type | NVARCHAR(50) | NULL | MIME type |
| latitude | FLOAT | NULL | GPS latitude |
| longitude | FLOAT | NULL | GPS longitude |
| location_name | NVARCHAR(255) | NULL | Formatted location |
| notes | NVARCHAR(1000) | NULL | User notes |
| incident_id | NVARCHAR(50) | NULL | Incident ID |
| status | NVARCHAR(20) | DEFAULT 'pending' | Review status |
| storage_tier | NVARCHAR(20) | DEFAULT 'hot' | Azure storage tier |
| date_taken | DATETIME | NULL | EXIF date taken |
| camera_info | NVARCHAR(255) | NULL | Camera make/model |
| batch_id | NVARCHAR(36) | NULL | Upload batch reference |
| created_at | DATETIME | DEFAULT GETDATE() | Upload time |
| updated_at | DATETIME | NULL | Last metadata update |
| updated_by | NVARCHAR(255) | NULL | Admin who last updated |

### 5.3 photo_renditions

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment |
| photo_id | NVARCHAR(36) | FK → photos.id | Parent photo |
| variant_type | NVARCHAR(20) | NOT NULL | 'thumb_sm', 'thumb_md', 'web' |
| blob_path | NVARCHAR(500) | NOT NULL | Blob storage path |
| width | INT | NULL | Width (px) |
| height | INT | NULL | Height (px) |
| file_size | BIGINT | NULL | Size in bytes |
| created_at | DATETIME | DEFAULT GETDATE() | Generated time |

**Rendition Variants:**

| Variant | Dimensions | Fit | Quality | Use |
|---|---|---|---|---|
| thumb_sm | 200 x 150 | cover | 75 | Photo grid thumbnails |
| thumb_md | 400 x 300 | inside | 80 | Detail sidebar preview |
| web | 1200px max width | inside | 85 | Full-screen web view |

### 5.4 photo_exif

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment |
| photo_id | NVARCHAR(36) | FK → photos.id | Parent photo |
| camera_make | NVARCHAR(100) | NULL | Camera manufacturer |
| camera_model | NVARCHAR(100) | NULL | Camera model |
| focal_length | FLOAT | NULL | Focal length (mm) |
| aperture | FLOAT | NULL | F-stop value |
| iso | INT | NULL | ISO sensitivity |
| date_taken | DATETIME | NULL | EXIF date/time original |
| gps_latitude | FLOAT | NULL | GPS latitude from EXIF |
| gps_longitude | FLOAT | NULL | GPS longitude from EXIF |
| raw_json | NVARCHAR(MAX) | NULL | Full EXIF data as JSON |

### 5.5 tags

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment |
| name | NVARCHAR(100) | NOT NULL, UNIQUE(name, category) | Tag display name |
| category | NVARCHAR(50) | NULL | Category: status, priority, type, timeline, custom |
| color | NVARCHAR(20) | NULL | Hex color for badge display |

### 5.6 photo_tags

| Column | Type | Constraints | Description |
|---|---|---|---|
| photo_id | NVARCHAR(36) | PK, FK → photos.id | Photo reference |
| tag_id | INT | PK, FK → tags.id | Tag reference |

### 5.7 photo_edits

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment |
| photo_id | NVARCHAR(36) | FK → photos.id | Edited photo |
| edit_type | NVARCHAR(50) | NOT NULL | 'crop', 'rotate', 'annotate' |
| params | NVARCHAR(MAX) | NULL | JSON edit parameters |
| edited_by | NVARCHAR(255) | NOT NULL | Admin who performed edit |
| created_at | DATETIME | DEFAULT GETDATE() | Edit timestamp |

### 5.8 admin_audit_log

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment |
| entity_type | NVARCHAR(50) | NOT NULL | 'photo', 'session', 'tag', 'migration' |
| entity_id | NVARCHAR(100) | NULL | UUID of affected entity |
| action | NVARCHAR(50) | NOT NULL | 'create', 'update', 'delete', 'bulk_delete', etc. |
| performed_by | NVARCHAR(255) | NOT NULL | Admin principal |
| ip_address | NVARCHAR(45) | NULL | Client IP |
| details | NVARCHAR(MAX) | NULL | JSON operation details |
| created_at | DATETIME | DEFAULT GETDATE() | Action timestamp |

**Immutable:** Application code performs INSERT only — no UPDATE or DELETE operations on this table.

### 5.9 upload_batches

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PK, DEFAULT NEWID() | Batch UUID |
| session_id | NVARCHAR(36) | FK → upload_sessions.id, NULL | Session (NULL for admin uploads) |
| source | NVARCHAR(20) | DEFAULT 'field' | 'field' or 'admin' |
| photo_count | INT | DEFAULT 0 | Number of photos in batch |
| uploaded_by | NVARCHAR(255) | NULL | Admin email (for admin uploads) |
| created_at | DATETIME | DEFAULT GETDATE() | Batch timestamp |

### 5.10 v_incident_summary (View)

| Column | Source | Description |
|---|---|---|
| incident_id | photos.incident_id | Incident identifier |
| photo_count | COUNT(*) | Total photos for incident |
| team_count | COUNT(DISTINCT session_id) | Number of teams |
| first_upload | MIN(created_at) | Earliest upload |
| last_upload | MAX(created_at) | Most recent upload |
| total_bytes | SUM(file_size) | Total storage used |

### 5.11 Relationships

```
upload_sessions (1) ──→ (many) photos
                              │
                              ├── (many) photo_renditions
                              ├── (1)    photo_exif
                              ├── (many) photo_edits
                              └── (many) photo_tags ──→ tags

upload_sessions (1) ──→ (many) upload_batches
                              └── photos.batch_id (logical FK)

admin_audit_log (standalone — references by entity_type + entity_id)
```

### 5.12 Indexes

| Index | Table | Column(s) | Purpose |
|---|---|---|---|
| PK (clustered) | upload_sessions | id | Primary key |
| PK (clustered) | photos | id | Primary key |
| IX_photos_session_id | photos | session_id | Session lookup |
| IX_photos_incident_id | photos | incident_id | Incident filtering |
| IX_photos_created_at | photos | created_at DESC | Date sorting |
| IX_photos_status | photos | status | Status filtering |
| IX_photos_batch_id | photos | batch_id | Batch lookup |
| IX_sessions_expires | upload_sessions | expires_at | Expiration queries |
| IX_renditions_photo_id | photo_renditions | photo_id | Rendition lookup |
| IX_exif_photo_id | photo_exif | photo_id | EXIF lookup |
| IX_audit_entity | admin_audit_log | entity_type, entity_id | Audit queries |
| IX_audit_created | admin_audit_log | created_at DESC | Recent audit entries |

---

## 6. CDN & Caching

### 6.1 Front Door CDN Endpoints

| Endpoint | Hostname | Purpose |
|---|---|---|
| cdn-asprphotos | cdn-asprphotos-gkfzbjf6fpf3azcw.a01.azurefd.net | Blob renditions (WebP thumbnails, web-optimized) |
| cdn-asprphotos-app | cdn-asprphotos-app-chfxezh3dzc6chgx.a01.azurefd.net | Application (HTML, JS, CSS, API) |

### 6.2 CDN URL Patterns

| Asset | URL Pattern |
|---|---|
| Small thumbnail | `https://cdn-asprphotos-...azurefd.net/renditions/{uuid}/thumb_sm.webp` |
| Medium thumbnail | `https://cdn-asprphotos-...azurefd.net/renditions/{uuid}/thumb_md.webp` |
| Web optimized | `https://cdn-asprphotos-...azurefd.net/renditions/{uuid}/web.webp` |
| Original (signed) | `https://cdn-asprphotos-app-...azurefd.net/api/photos/{id}/image?type=original&exp=...&sig=...` |

### 6.3 Cache-Control Headers

| Resource | Cache-Control | TTL |
|---|---|---|
| Hero images (*.webp) | `public, max-age=604800, immutable` | 7 days |
| Photo renditions (CDN) | Front Door default caching | Varies |
| Signed image URLs | `public, max-age=3600, s-maxage=604800, immutable` | 1h client / 7d CDN |
| API responses | `private, no-cache` | None |
| Static assets (.js, .css) | Next.js hashed filenames + immutable | Long-lived |

### 6.4 Original Photo Access

Original photos are never served via the CDN. They are accessed through the signed URL proxy endpoint (`/api/photos/[id]/image?type=original`), which:

1. Validates the HMAC-SHA256 signature and expiry
2. Streams the blob directly from Azure Blob Storage via Private Endpoint
3. Returns the original MIME type and file content

This ensures originals remain private and access-controlled even when renditions are CDN-cached.

---

## 7. Rate Limiting Reference

### 7.1 Limits

| Key Pattern | Endpoint | Max | Window | Lockout |
|---|---|---|---|---|
| `pin-attempt:{ip}` | validate-pin | 5 | 60s | 15 min |
| `admin-auth-fail:{ip}` | admin endpoints (failure) | 3 | 60s | 30 min |
| `pin-creation:{ip}` | create-session (success) | 20 | 60s | None |
| `upload:{ip}` | photos/upload | 50 | 1 hour | None |
| `bulk:{ip}` | admin/photos/bulk | 10 | 60s | None |

### 7.2 Response

When rate limited, the API returns:

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 900

{
  "error": "Too many attempts. Try again in 900 seconds."
}
```

---

## 8. System Limits

| Parameter | Value |
|---|---|
| PIN length | 6 digits |
| PIN expiration | 48 hours |
| JWT token expiration | 24 hours |
| Signed URL expiration | 24 hours |
| Max upload file size | 50 MB |
| Supported image types | JPEG, PNG, WebP |
| Thumbnail (sm) dimensions | 200 x 150 px (cover) |
| Thumbnail (md) dimensions | 400 x 300 px (inside) |
| Web optimized max width | 1200 px (inside) |
| Rendition format | WebP |
| Max notes length | 1,000 characters |
| Max team name length | 255 characters |
| Max tag name length | 100 characters |
| Latitude range | -90 to 90 |
| Longitude range | -180 to 180 |
| Admin photos page size | 50 (default), 200 (max) |
| Bulk operation max photos | 100 per request |
| Health probe interval | 30 seconds |

---

## 9. Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Federal Project Sponsor | | | |
| Technical Lead | | | |

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-02-07 | HHS ASPR / Leidos | Initial API and data reference |
| 1.1 | 2026-02-07 | HHS ASPR / Leidos | Added OIDC Auth.js endpoints (Entra ID, Login.gov, ID.me); updated auth methods table |
| 2.0 | 2026-02-07 | HHS ASPR / Leidos | Post Phase 6 deployment: full admin API endpoints (photos CRUD, bulk ops, tags, stats, sessions, migrate, health); expanded data model from 2 tables to 8 tables + 1 view + 12 indexes; CDN & caching section (Front Door endpoints, URL patterns, cache headers); multi-rendition pipeline (thumb_sm, thumb_md, web); EXIF metadata table; admin audit log; upload batches; updated system limits |
