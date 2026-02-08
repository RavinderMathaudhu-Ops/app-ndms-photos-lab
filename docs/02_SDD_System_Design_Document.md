# System Design Document

**ASPR Photo Repository Application**

| Field | Value |
|---|---|
| Document ID | ASPR-PHOTOS-SDD-001 |
| Version | 2.0 |
| Date | 2026-02-07 |
| Status | Production |
| Classification | For Official Use Only (FOUO) |
| Author | HHS ASPR / Leidos |
| Standards | IEEE 1016-2009 |

---

## 1. Introduction

### 1.1 Purpose

This System Design Document (SDD) describes the architecture, component design, data structures, and technology decisions for the ASPR Photo Repository application. It serves as the primary technical reference for developers, architects, and operations staff.

### 1.2 Scope

The ASPR Photo Repository is a secure, web-based application that enables Administration for Strategic Preparedness and Response (ASPR) field teams to capture, upload, and manage disaster-related photographs during incident response operations. The system provides multi-tier authentication (PIN, Entra ID SSO), photo upload with geospatial metadata, a review gallery, a comprehensive admin dashboard for photo management (grid view, detail sidebar, bulk operations, tag system, photo editor, EXIF extraction), and CDN-accelerated delivery via Azure Front Door Premium with WAF protection and Private Link networking.

### 1.3 Intended Audience

| Audience | Purpose |
|---|---|
| Software Developers | Implementation reference and code architecture |
| System Architects | Design rationale and integration patterns |
| Security Engineers | Security design decisions and controls |
| DevOps / SRE | Deployment architecture and operational concerns |
| QA Engineers | Component boundaries and testability |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐              │
│  │ Preloader │→│  Welcome  │→│   PIN    │→│  Upload     │→ Gallery     │
│  │ (ASPR)   │  │  (hero)   │  │  Login   │  │  Wizard     │  Review     │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘              │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Admin Dashboard (Entra ID SSO)                                   │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────────┐   │   │
│  │  │  PINs   │  │ Photo Grid  │  │  Detail  │  │ Photo Editor │   │   │
│  │  │  (CRUD) │  │ (virtual)   │  │ Sidebar  │  │ (crop/annot) │   │   │
│  │  └─────────┘  └─────────────┘  └──────────┘  └──────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────┴───────────────────────────────────────────┐
│                AZURE FRONT DOOR PREMIUM (cdn-ociomicro-premium-eus2-01)  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  WAF Policy: wafAsprPhotos (OWASP 3.2 + Bot Manager 1.1)        │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │  cdn-asprphotos-app (/*) ─── Private Link ──→ App Service        │   │
│  │  cdn-asprphotos (/renditions/*) ── Private Link ──→ Blob Storage │   │
│  │  Health Probe: GET /api/health (30s interval)                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────┬────────────────────────────┘
                               │              │
┌──────────────────────────────┴──────┐  ┌────┴───────────────────────────┐
│     AZURE APP SERVICE (VNet)        │  │   AZURE BLOB STORAGE (VNet)    │
│     app-aspr-photos (Linux/Node 22) │  │   stociomicroeus201             │
│  ┌────────────────────────────┐     │  │   └── aspr-photos (container)  │
│  │  Next.js Standalone Server │     │  │       ├── {uuid}/original      │
│  │  ┌─────────────────────┐   │     │  │       ├── {uuid}/thumbnail     │
│  │  │  API Route Handlers │   │     │  │       └── renditions/          │
│  │  │  /api/auth/*        │   │     │  │           └── {uuid}/          │
│  │  │  /api/photos/*      │   │     │  │               ├── thumb_sm.webp│
│  │  │  /api/admin/*       │   │     │  │               ├── thumb_md.webp│
│  │  │  /api/health        │   │     │  │               └── web.webp     │
│  │  ├─────────────────────┤   │     │  └────────────────────────────────┘
│  │  │  Shared Libraries   │   │     │
│  │  │  lib/auth.ts        │   │     │  ┌────────────────────────────────┐
│  │  │  lib/adminAuth.ts   │   │     │  │   AZURE SQL DATABASE (VNet)    │
│  │  │  lib/db.ts          │   │     │  │   8 tables + 1 view            │
│  │  │  lib/blobHelpers.ts │   │     │  │   10 indexes                   │
│  │  │  lib/rateLimit.ts   │   │     │  │   Entra ID managed identity    │
│  │  │  lib/security.ts    │   │     │  └────────────────────────────────┘
│  │  └─────────────────────┘   │     │
│  └────────────────────────────┘     │  ┌────────────────────────────────┐
│  Startup: node server.js            │  │   AZURE KEY VAULT (VNet)       │
└─────────────────────────────────────┘  │   kv-ociomicro-eus2-01         │
                                         │   ASPRPHOTOS--* secrets         │
                                         └────────────────────────────────┘
```

### 2.2 Request Flow

1. **Client Request:** Browser → Azure Front Door (TLS termination, WAF inspection) → Private Link → App Service
2. **Field Team Login:** User enters 6-digit PIN → `POST /api/auth/validate-pin` → bcrypt comparison against all non-expired sessions → JWT token issued (24h TTL)
3. **Admin Login:** User clicks "Sign in with HHS" → Entra ID OIDC redirect → Auth.js callback → session created → dashboard rendered
4. **Photo Upload:** Authenticated user selects photos + metadata → `POST /api/photos/upload` → Sharp processes thumbnail → blobs uploaded to Azure → metadata saved to SQL
5. **Admin Photo Upload:** Admin drag-drops files → `POST /api/admin/photos/upload` → exifr extracts EXIF → Sharp generates 3 renditions (thumb_sm, thumb_md, web) → blobs stored → metadata + EXIF saved to SQL
6. **Gallery View:** `GET /api/photos` → signed image URLs generated (HMAC-SHA256) → client fetches images via `/api/photos/[id]/image?sig=...`
7. **Admin Photo Grid:** `GET /api/admin/photos?cursor=...` → cursor-based pagination → signed URLs → virtual-scroll grid rendered
8. **CDN Image Delivery:** Front Door CDN → `/renditions/{uuid}/{variant}.webp` → Private Link → Blob Storage (edge-cached with `s-maxage=604800`)
9. **Photo Delete:** `DELETE /api/photos/[id]` → ownership verified → blobs removed → SQL record deleted
10. **Admin Bulk Ops:** `POST /api/admin/photos/bulk` → validate admin → execute operation (delete/tag/status) → audit log entry → response

### 2.3 Authentication Flow

```
Field Team (PIN):
  PIN (6-digit) → bcrypt.compare() → JWT (HS256, 24h) → Bearer token

Field Team (SSO):
  Entra ID / Login.gov / ID.me → OIDC authorization code → Auth.js session → JWT (HS256, 24h) → Bearer token

Admin:
  Entra ID SSO → OIDC → Auth.js session → requireAdmin() checks session
  Fallback: Admin Token → timing-safe comparison → x-admin-token header
  Both methods → AdminContext { isAuthorized, adminEmail, authMethod }

Image Access:
  HMAC-SHA256 signed URL → /api/photos/[id]/image?type=...&exp=...&sig=...

CDN Renditions:
  Front Door → /renditions/{uuid}/{variant}.webp → Private Link → Blob Storage
```

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Framework | Next.js | 16.1.6 | Full-stack React framework with API routes |
| UI Library | React | 19.2.3 | Component-based UI rendering |
| Language | TypeScript | 5.x | Type-safe development |
| Styling | Tailwind CSS | 4.x | Utility-first CSS framework |
| Animation | Framer Motion | 12.33.0 | Page transitions, preloader, micro-interactions |
| Smooth Scroll | Lenis | 1.3.17 | Smooth scrolling experience |
| Icons | Lucide React | 0.563.0 | SVG icon library |
| Virtualization | @tanstack/react-virtual | 3.13.18 | Virtual scroll for admin photo grid |
| Photo Editor | react-advanced-cropper | 0.20.1 | Image cropping with aspect ratio presets |
| Canvas | Konva / react-konva | 10.2 / 19.2 | Canvas-based photo annotation |
| File Drops | react-dropzone | 14.4.0 | Drag-and-drop file upload |
| File Export | JSZip / file-saver | 3.10 / 2.0 | Client-side ZIP creation for bulk download |
| EXIF | exifr | 7.1.3 | EXIF metadata extraction from photos |
| Database | Azure SQL (mssql) | 12.2.0 | Relational data storage |
| Blob Storage | @azure/storage-blob | 12.30.0 | Binary file storage |
| Identity | @azure/identity | 4.13.0 | Entra ID managed identity |
| SSO | Auth.js (NextAuth) | v5 beta | OIDC provider integration (Entra ID) |
| Auth | jsonwebtoken | 9.0.3 | JWT token management |
| Password Hashing | bcryptjs | 3.0.3 | PIN hashing (10 salt rounds) |
| Image Processing | Sharp | 0.34.5 | Multi-rendition generation, metadata extraction |
| CDN / WAF | Azure Front Door Premium | — | Edge caching, WAF, Private Link routing |
| Runtime | Node.js | 22.x LTS | Server runtime |

---

## 4. Directory Structure

```
app-ndms-photos-lab/
├── app/                                  # Next.js App Router
│   ├── page.tsx                          # Main wizard (preloader → welcome → pin → photos → metadata → upload → success)
│   ├── layout.tsx                        # Root layout (fonts, SmoothScroll wrapper)
│   ├── globals.css                       # ASPR brand colors, Lenis CSS, Ken Burns, animations
│   ├── gallery/page.tsx                  # Photo gallery with download/delete
│   ├── admin/
│   │   ├── page.tsx                      # Admin page (checks Entra ID config, renders AdminDashboard)
│   │   ├── AdminDashboard.tsx            # Main admin component (auth, tabs, PIN CRUD)
│   │   └── components/
│   │       ├── PhotoGrid.tsx             # Virtual-scroll photo grid with cursor pagination
│   │       ├── PhotoDetailSidebar.tsx    # Metadata display, EXIF, inline editing
│   │       ├── PhotoFilterBar.tsx        # Search, date range, incident, status filters
│   │       ├── PhotoEditor.tsx           # Crop, rotate, annotate (cropper + konva)
│   │       ├── PhotoStrip.tsx            # Thumbnail carousel for quick navigation
│   │       ├── PhotoReview.tsx           # Side-by-side comparison mode
│   │       ├── TagManager.tsx            # Tag autocomplete with category badges
│   │       ├── BulkActionBar.tsx         # Floating multi-select toolbar
│   │       ├── BulkUploadPanel.tsx       # Drag-drop admin upload with progress
│   │       ├── SessionManager.tsx        # List/revoke/reactivate sessions
│   │       └── Toast.tsx                 # Toast notification context
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/route.ts    # Auth.js OIDC handlers (Entra ID)
│       │   ├── create-session/route.ts   # PIN creation (admin)
│       │   └── validate-pin/route.ts     # PIN validation (field teams)
│       ├── admin/
│       │   ├── sessions/
│       │   │   ├── route.ts              # GET all sessions with photo counts
│       │   │   └── [id]/route.ts         # PATCH revoke/reactivate session
│       │   ├── photos/
│       │   │   ├── route.ts              # GET paginated photo list
│       │   │   ├── upload/route.ts       # POST bulk upload with EXIF
│       │   │   ├── stats/route.ts        # GET aggregate statistics
│       │   │   ├── bulk/route.ts         # POST bulk operations
│       │   │   ├── bulk-download/route.ts # POST signed URLs for ZIP
│       │   │   ├── tags/route.ts         # GET/POST tag management
│       │   │   └── [id]/
│       │   │       ├── route.ts          # PATCH/DELETE single photo
│       │   │       └── edit/route.ts     # POST photo edit (crop/rotate)
│       │   └── migrate/route.ts          # POST schema migrations
│       ├── photos/
│       │   ├── route.ts                  # GET session photos (signed URLs)
│       │   ├── upload/route.ts           # POST field team upload
│       │   ├── [id]/route.ts             # DELETE photo
│       │   ├── [id]/image/route.ts       # GET image proxy (signed URL)
│       │   └── fix-blobs/route.ts        # POST fix blob content types
│       └── health/route.ts               # GET health check (Front Door probe)
├── components/
│   ├── SmoothScroll.tsx                  # Lenis smooth scroll provider
│   └── ui/                              # shadcn/ui components (Button, Input, Card, etc.)
├── lib/
│   ├── auth.ts                          # JWT sign/verify + HMAC signed image URLs
│   ├── adminAuth.ts                     # Admin auth context (Entra ID + token fallback)
│   ├── db.ts                            # Azure SQL connection pool + mock DB fallback
│   ├── blobHelpers.ts                   # Azure Blob CRUD, rendition paths, CDN URL generation
│   ├── rateLimit.ts                     # In-memory rate limiter with lockout
│   ├── security.ts                      # OWASP validation, audit logging, error handling
│   ├── utils.ts                         # Tailwind cn() utility
│   └── useResponsiveImage.ts            # React hook for responsive image loading
├── auth.ts                              # NextAuth configuration (Entra ID provider)
├── middleware.ts                         # Route guard for /admin/* via auth()
├── scripts/
│   ├── admin-cli.js                     # CLI tool for PIN management
│   ├── migrate.js                       # Database migration script (tedious)
│   ├── fix-pin-column.mjs              # PIN column migration (NVARCHAR→72)
│   ├── deploy-cdn.sh                    # Azure Front Door blob CDN setup
│   ├── setup-afd-app.sh                # Azure Front Door app + WAF setup
│   └── generate_all_docx.py            # Document generation (python-docx)
├── docs/                                # Project documentation (6 docs)
├── public/                              # Static assets (ASPR logo, hero images)
├── next.config.ts                       # Security headers, standalone output, caching
├── package.json                         # Dependencies
└── .github/workflows/
    └── main_app-ndms-photos-lab.yml     # CI/CD: build → deploy to Azure
```

---

## 5. Component Design

### 5.1 Page Architecture

The application uses Next.js App Router with three page routes:

| Route | Component | Type | Description |
|---|---|---|---|
| `/` | `app/page.tsx` | Client Component | Multi-step wizard with preloader, 6 steps, hero backgrounds |
| `/gallery` | `app/gallery/page.tsx` | Client Component | Photo review gallery with grid view |
| `/admin` | `app/admin/page.tsx` | Client Component | Admin dashboard with tabbed interface (PINs, Photos) |

### 5.2 Main Wizard Flow (page.tsx)

The main page implements a wizard-style interface with animated page transitions:

```
[preloader] → welcome → pin → photos → metadata → uploading → success
```

| Step | Purpose | Key Features |
|---|---|---|
| preloader | Branded loading | ASPR logo keyframe animation (fade in, hold, exit), "Photo Repository" subtitle |
| welcome | Landing page | Hero background images (Ken Burns CSS animation), vignette overlay, glass-pill CTA |
| pin | Authentication | 6-digit PIN input, auto-advance, circular chevron back button, shield icon |
| photos | Photo selection | Camera/file picker, preview strip, multi-select |
| metadata | Metadata entry | Incident ID, GPS (auto/manual), ZIP lookup, notes |
| uploading | Upload progress | Animated ring, progress counter, sequential upload |
| success | Confirmation | Photo count, gallery link, "take more" option |

- Page transitions use Framer Motion `AnimatePresence` in **sync mode** (default, not `mode="wait"`) with absolute-positioned steps for seamless overlap.
- All wizard steps use `absolute inset-0` positioning so old and new steps coexist in the DOM during transitions — no flash or gap.
- The fixed header uses `fixed top-0 inset-x-0` with content offset via `pt-14`.
- Returning users with a valid `sessionStorage` session skip the preloader and resume at the photos step.

### 5.3 Gallery Page (gallery/page.tsx)

- Displays photos uploaded in the current session
- Grid layout with thumbnail cards
- Photo detail view with original image display
- Download (original resolution) and delete functionality
- Filter by incident ID
- Responsive grid: 1 column (mobile) → 2 (sm) → 3 (md) → 4 (lg)

### 5.4 Admin Dashboard (admin/AdminDashboard.tsx)

The admin dashboard provides a comprehensive interface for photo management:

**Authentication:**
- Entra ID SSO (primary) — auto-advances to dashboard when authenticated
- Static token fallback (when Entra ID not configured)
- Dual-auth via `lib/adminAuth.ts` returning `AdminContext`

**Tab Interface:**
- **PINs Tab:** PIN generation with team name, session list with status/photo counts, revoke/reactivate
- **Photos Tab:** Full photo management grid with filtering, detail, editing, and bulk operations

### 5.5 Admin Components

| Component | Purpose | Key Technology |
|---|---|---|
| `PhotoGrid` | Virtual-scroll photo grid with cursor-based pagination | @tanstack/react-virtual, infinite scroll |
| `PhotoDetailSidebar` | Metadata display (EXIF, geolocation), inline editing | Framer Motion slide-in |
| `PhotoFilterBar` | Search text, date range, incident, status, tag filters | Controlled inputs with debounce |
| `PhotoEditor` | Crop, rotate, annotate photos | react-advanced-cropper, Konva canvas |
| `PhotoStrip` | Horizontal thumbnail carousel | Scroll-snap, auto-hide scrollbar |
| `PhotoReview` | Side-by-side comparison mode | Split-view layout |
| `TagManager` | Tag autocomplete with category badges | Category: status, priority, type, timeline, custom |
| `BulkActionBar` | Floating toolbar for multi-select operations | Fixed position, selection count |
| `BulkUploadPanel` | Drag-drop upload with progress tracking | react-dropzone, progress bars |
| `SessionManager` | List sessions, revoke/reactivate PINs | Status badges, photo counts |
| `Toast` | Toast notification system | Context provider, auto-dismiss |

### 5.6 Logo Preloader

The application displays a branded ASPR logo preloader on initial load:

1. **Background:** Full-screen `#062e61` (ASPR dark blue)
2. **Logo animation:** `aspr-logo-white.png` enters from below (`y: 80→0`), holds, exits upward (`y: 0→-80`)
3. **Subtitle:** "Photo Repository" fades in and out with staggered timing
4. **Duration:** ~2 seconds total (600ms enter, 400ms hold, 600ms exit, 700ms background fade)
5. **Exit:** Background fades via AnimatePresence `exit={{ opacity: 0 }}`
6. **Skip:** Returning users with session restore skip directly to photos step

### 5.7 Layout System

```tsx
// app/layout.tsx
RootLayout
  └── <html>
        └── <body> (Bebas Neue + Open Sans font variables)
              └── <SmoothScroll> (Lenis wrapper)
                    └── {children}
```

- **Bebas Neue** (`--font-bebas`): Display font for headings
- **Open Sans** (`--font-opensans`): Body text
- **Lenis**: Smooth scroll with `duration: 1.2`, custom easing, `touchMultiplier: 2`

### 5.8 UI Design System

The application uses a glassmorphic design language:

| Element | Style |
|---|---|
| Glass pill CTA | `bg-white/[0.1] rounded-full backdrop-blur-md` with ArrowRight icon |
| Ghost buttons | `bg-white/[0.08] border border-white/15` |
| Back button | `w-9 h-9 rounded-full bg-white/[0.06]` with ChevronLeft icon |
| Inputs | `bg-white/[0.07] backdrop-blur-sm border border-white/15 rounded-lg` |
| Cards | `bg-white/[0.06] border border-white/10 rounded-xl` |
| Shield icon | `w-14 h-14 rounded-lg bg-blue-500/[0.08]` with blue glow shadow |
| Hover effects | `whileHover={{ y: -1 }}` gentle lift micro-interaction |

ASPR brand colors defined as CSS custom properties:

| Variable | Color | Usage |
|---|---|---|
| `--aspr-blue-dark` | #062E61 | Backgrounds, headers, preloader |
| `--aspr-blue-primary` | #155197 | Primary actions, links |
| `--aspr-gold` | #AA6404 | Secondary accents |
| `--aspr-red` | #990000 | Error states, destructive actions |

---

## 6. API Design

### 6.1 Route Handler Architecture

All API routes follow a consistent pattern:

1. **Rate limiting check** (per-IP, in-memory store)
2. **Authentication verification** (JWT, Entra ID session, or admin token)
3. **Input validation** (OWASP security module)
4. **Business logic** (database operations, blob storage)
5. **Audit logging** (security event + admin audit log table)
6. **Response** (JSON with appropriate cache headers)

### 6.2 Field Team API Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/validate-pin` | None | Field team PIN login |
| GET/POST | `/api/auth/[...nextauth]` | OIDC | Auth.js callback handlers (Entra ID) |
| POST | `/api/auth/create-session` | Entra ID or admin token | Create new PIN |
| POST | `/api/photos/upload` | JWT Bearer | Upload photo with metadata |
| GET | `/api/photos` | JWT Bearer | List session photos (signed URLs) |
| DELETE | `/api/photos/[id]` | JWT Bearer | Delete photo (ownership verified) |
| GET | `/api/photos/[id]/image` | Signed URL | Proxy image from blob storage |
| POST | `/api/photos/fix-blobs` | JWT Bearer | Fix blob content types (admin utility) |

### 6.3 Admin API Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/photos` | Admin | Paginated photo list (cursor, filters, sort) |
| GET | `/api/admin/photos/stats` | Admin | Aggregate statistics (totals, incidents, daily) |
| POST | `/api/admin/photos/upload` | Admin | Bulk upload with EXIF extraction |
| POST | `/api/admin/photos/bulk` | Admin | Bulk operations (delete, tag, status) |
| POST | `/api/admin/photos/bulk-download` | Admin | Signed URLs for ZIP download |
| GET | `/api/admin/photos/tags` | Admin | List tags (with category filter) |
| POST | `/api/admin/photos/tags` | Admin | Create new tag |
| PATCH | `/api/admin/photos/[id]` | Admin | Update photo metadata |
| DELETE | `/api/admin/photos/[id]` | Admin | Delete photo and all renditions |
| PATCH | `/api/admin/photos/[id]/edit` | Admin | Photo edit (crop, rotate) |
| GET | `/api/admin/sessions` | Admin | List all sessions with counts |
| PATCH | `/api/admin/sessions/[id]` | Admin | Revoke or reactivate session |
| POST | `/api/admin/migrate` | Admin | Run schema migrations |
| GET | `/api/health` | None | Health check for Front Door probes |

### 6.4 Signed Image URL Design

Instead of exposing Azure Blob Storage URLs or putting JWTs in query strings, the system uses HMAC-SHA256 signed URLs:

```
/api/photos/{id}/image?type=thumbnail&exp=1707350400&sig=abc123...

Signature = HMAC-SHA256(photoId:type:expiry, SIGNING_KEY).slice(0, 32)
```

Benefits:
- CDN-safe (no authentication headers needed)
- Time-limited (default 24h TTL)
- Type-locked (thumbnail vs original)
- Short URLs (32-char truncated signature)

Cache headers on image responses:
- `Cache-Control: public, max-age=3600, s-maxage=604800, immutable`
- `CDN-Cache-Control: public, max-age=604800`

### 6.5 CDN Rendition URLs

When `IMAGE_CDN_URL` is configured, rendition URLs bypass the image proxy and load directly from Front Door CDN:

```
https://cdn-asprphotos-gkfzbjf6fpf3azcw.a01.azurefd.net/renditions/{uuid}/thumb_md.webp
```

The `lib/blobHelpers.ts` module handles URL generation:
- If `IMAGE_CDN_URL` is set → returns CDN URL for renditions
- Otherwise → falls back to signed proxy URL (`/api/photos/{id}/image?...`)

---

## 7. Data Design

### 7.1 Database Schema

**Azure SQL Server** with 8 tables, 1 view, and 10 indexes:

#### upload_sessions

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PRIMARY KEY, DEFAULT NEWID() | UUID |
| pin | NVARCHAR(72) | NOT NULL | bcrypt hash of 6-digit PIN |
| team_name | NVARCHAR(255) | NOT NULL | Team identifier |
| is_active | BIT | DEFAULT 1 | Active flag (revocation) |
| created_at | DATETIME | DEFAULT GETDATE() | Creation timestamp |
| expires_at | DATETIME | NOT NULL | Expiration (48 hours from creation) |

#### photos

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PRIMARY KEY | UUID (v4) |
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
| status | VARCHAR(20) | DEFAULT 'active' | Status: active, reviewed, flagged, archived |
| storage_tier | VARCHAR(20) | DEFAULT 'hot' | Tier: hot, cool, archive |
| date_taken | DATETIME | NULL | EXIF date/time original |
| camera_info | VARCHAR(500) | NULL | Compact EXIF string |
| batch_id | NVARCHAR(36) | NULL | Upload batch reference |
| created_at | DATETIME | DEFAULT GETDATE() | Upload timestamp |
| updated_at | DATETIME | NULL | Last metadata edit |
| updated_by | NVARCHAR(255) | NULL | Admin email who last edited |

#### photo_renditions

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| photo_id | NVARCHAR(36) | FK → photos.id | Parent photo |
| variant_type | VARCHAR(20) | NOT NULL | thumb_sm, thumb_md, web |
| blob_path | NVARCHAR(500) | NOT NULL | Blob storage path |
| width | INT | NULL | Rendition width (px) |
| height | INT | NULL | Rendition height (px) |
| file_size | BIGINT | NULL | Rendition size in bytes |
| created_at | DATETIME | DEFAULT GETDATE() | Generation timestamp |

#### photo_exif

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| photo_id | NVARCHAR(36) | FK → photos.id, UNIQUE | Parent photo |
| camera_make | NVARCHAR(100) | NULL | Camera manufacturer |
| camera_model | NVARCHAR(100) | NULL | Camera model |
| focal_length | FLOAT | NULL | Focal length (mm) |
| aperture | FLOAT | NULL | F-number |
| iso | INT | NULL | ISO sensitivity |
| exposure_time | NVARCHAR(20) | NULL | Shutter speed |
| date_taken | DATETIME | NULL | EXIF DateTimeOriginal |
| gps_latitude | FLOAT | NULL | EXIF GPS latitude |
| gps_longitude | FLOAT | NULL | EXIF GPS longitude |
| raw_json | NVARCHAR(MAX) | NULL | Full EXIF JSON |

#### tags

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| name | NVARCHAR(100) | NOT NULL, UNIQUE | Tag display name |
| category | VARCHAR(20) | NOT NULL | status, priority, type, timeline, custom |
| color | VARCHAR(7) | NULL | Hex color code |
| created_at | DATETIME | DEFAULT GETDATE() | Creation timestamp |

#### photo_tags (Junction)

| Column | Type | Constraints | Description |
|---|---|---|---|
| photo_id | NVARCHAR(36) | PK, FK → photos.id | Photo reference |
| tag_id | INT | PK, FK → tags.id | Tag reference |
| created_at | DATETIME | DEFAULT GETDATE() | Assignment timestamp |

#### photo_edits

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| photo_id | NVARCHAR(36) | FK → photos.id | Edited photo |
| edit_type | VARCHAR(20) | NOT NULL | crop, rotate, annotate |
| params | NVARCHAR(MAX) | NULL | Edit parameters JSON |
| result_blob_path | NVARCHAR(500) | NULL | Edited rendition path |
| performed_by | NVARCHAR(255) | NOT NULL | Admin email |
| created_at | DATETIME | DEFAULT GETDATE() | Edit timestamp |

#### admin_audit_log

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, IDENTITY | Auto-increment ID |
| entity_type | VARCHAR(50) | NOT NULL | photo, session, tag |
| entity_id | NVARCHAR(36) | NOT NULL | Target entity ID |
| action | VARCHAR(50) | NOT NULL | Action performed |
| performed_by | NVARCHAR(255) | NOT NULL | Admin email or 'admin-token' |
| ip_address | VARCHAR(45) | NULL | Client IP |
| details | NVARCHAR(MAX) | NULL | Context JSON |
| created_at | DATETIME | DEFAULT GETDATE() | Event timestamp |

#### upload_batches

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | NVARCHAR(36) | PK, DEFAULT NEWID() | Batch UUID |
| session_id | NVARCHAR(36) | FK → upload_sessions.id | Upload session |
| photo_count | INT | DEFAULT 0 | Photos in batch |
| total_size | BIGINT | DEFAULT 0 | Total bytes |
| uploaded_by | NVARCHAR(255) | NULL | Uploader identity |
| created_at | DATETIME | DEFAULT GETDATE() | Batch start time |

#### v_incident_summary (View)

Aggregation view: incident_id, photo count, total size, date range, team count.

#### Indexes

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

#### Relationships

- One `upload_session` → Many `photos` (via `session_id` FK)
- One `photo` → Many `photo_renditions` (via `photo_id`)
- One `photo` → One `photo_exif` (via `photo_id`, unique)
- Many `photos` ↔ Many `tags` (via `photo_tags` junction)
- One `photo` → Many `photo_edits` (via `photo_id`)
- One `upload_batch` → Many `photos` (via `batch_id`)

### 7.2 Blob Storage Structure

```
Azure Blob Storage (stociomicroeus201)
└── aspr-photos (container)
    ├── {uuid}/original           # Full-resolution image (JPEG/PNG/WebP)
    ├── {uuid}/thumbnail          # Legacy WebP thumbnail (400×300, quality 80)
    └── renditions/
        └── {uuid}/
            ├── thumb_sm.webp     # 200×150, cover crop, quality 75
            ├── thumb_md.webp     # 400×300, inside fit, quality 80
            └── web.webp          # 1200px wide, inside fit, quality 85
```

- Blob IDs are lowercase UUIDs
- Original blob content type matches uploaded file MIME type
- Renditions are always `image/webp`
- Upload metadata includes `uploadTime` and `sessionId`

### 7.3 Connection Management

- **Production:** Entra ID managed identity (DefaultAzureCredential) for passwordless SQL auth
- **Development:** SQL username/password fallback, or in-memory mock database
- Connection pool singleton (mssql `ConnectionPool`)
- Automatic token refresh for Entra ID connections

---

## 8. Security Design

### 8.1 Authentication Architecture

| Component | Mechanism | Details |
|---|---|---|
| Field Team Auth (PIN) | PIN + bcrypt | 6-digit PIN, 10 salt rounds, timing-safe |
| Field Team Auth (SSO) | OIDC via Auth.js | Entra ID (HHS staff) |
| Token Issuance | JWT HS256 | 24-hour expiration, sessionId payload |
| Admin Auth (Primary) | Entra ID SSO | OIDC + `auth()` session check via `requireAdmin()` |
| Admin Auth (Fallback) | Static token | `x-admin-token` header, `crypto.timingSafeEqual` |
| Image Access | HMAC-SHA256 | Signed URLs with expiry |
| PIN Generation | CSPRNG | `crypto.randomInt(100000, 999999)` |
| Network | Front Door WAF | OWASP 3.2 + Bot Manager, Prevention mode |
| Network | Private Link | No public endpoints for blob, SQL, or app |

### 8.2 Rate Limiting

In-memory rate limiter with lockout support:

| Endpoint | Max Attempts | Window | Lockout |
|---|---|---|---|
| PIN Validation | 5 | 60s | 15 minutes |
| Admin Auth (failure) | 3 | 60s | 30 minutes |
| PIN Creation | 20 | 60s | None |
| Photo Upload | 50 | 1 hour | None |

### 8.3 Security Headers

Applied via `next.config.ts` to all routes:

- `Strict-Transport-Security`: HSTS with 1-year max-age, preload
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`: Restrictive CSP with font/connect-src allowances
- `Permissions-Policy`: Camera/microphone disabled, geolocation self-only
- `X-Powered-By`: Suppressed
- Hero images: `Cache-Control: public, max-age=604800, immutable`

### 8.4 Input Validation (OWASP)

All inputs validated server-side via `lib/security.ts`:

| Input | Validation |
|---|---|
| PIN | Exactly 6 numeric digits |
| Team Name | Max 255 chars, alphanumeric + spaces/hyphens/underscores |
| File Upload | JPEG/PNG/WebP only, max 50 MB, safe filename pattern |
| Coordinates | Latitude -90..90, Longitude -180..180 |
| Notes | Max 1000 characters |
| Incident ID | Max 50 chars, alphanumeric + hyphens/underscores |

### 8.5 Admin Audit Logging

All admin operations are logged to the `admin_audit_log` table:

| Field | Content |
|---|---|
| entity_type | photo, session, tag |
| entity_id | UUID of affected entity |
| action | create, update, delete, bulk_delete, bulk_tag, revoke, reactivate |
| performed_by | Admin email (from Entra ID session) or 'admin-token' |
| ip_address | Client IP from `x-forwarded-for` |
| details | JSON with operation-specific context |

The audit log is immutable (insert-only, no updates or deletes).

---

## 9. Deployment Architecture

### 9.1 Azure Resources

| Resource | Type | Name | Purpose |
|---|---|---|---|
| App Service | Linux, Node.js 22 | app-aspr-photos | Application hosting |
| SQL Database | Single database | — | Relational data (8 tables) |
| Blob Storage | General purpose v2 | stociomicroeus201 | Photo storage (aspr-photos container) |
| Key Vault | Standard (shared) | kv-ociomicro-eus2-01 | Secrets (ASPRPHOTOS--* prefix) |
| Front Door | Premium (shared) | cdn-ociomicro-premium-eus2-01 | CDN, WAF, Private Link routing |
| WAF Policy | OWASP 3.2 + Bot Mgr | wafAsprPhotos | Web application firewall |
| Resource Group | — | rg-ocio-microsites-eus2-01 | All resources |

### 9.2 Front Door Configuration

| Component | Name | Details |
|---|---|---|
| CDN Profile | cdn-ociomicro-premium-eus2-01 | Shared Premium_AzureFrontDoor SKU |
| App Endpoint | cdn-asprphotos-app | Pattern `/*`, HTTPS-only |
| App Origin | origin-app-asprphotos | Private Link to app-aspr-photos |
| Blob Endpoint | cdn-asprphotos | Pattern `/renditions/*`, HTTPS-only |
| Blob Origin | origin-blob-asprphotos | Private Link to stociomicroeus201 blob |
| WAF Policy | wafAsprPhotos | OWASP 3.2 managed rules + Bot Manager 1.1 |
| Security Policy | secpol-asprphotos-app | WAF applied to app endpoint |
| Health Probe | /api/health | 30-second interval, HTTP 200 expected |
| Front Door ID | 91523752-5871-42ed-9e27-031fc6f5eb86 | Used for access restriction validation |

### 9.3 Build Configuration

- **Output mode:** `standalone` (minimal deployment footprint)
- **Source maps:** Disabled in production
- **Compression:** Enabled
- **System TLS:** `turbopackUseSystemTlsCerts: true` for HHS network proxy
- **Hero caching:** `Cache-Control: public, max-age=604800, immutable` for `/hero-*.webp`

### 9.4 CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/main_app-ndms-photos-lab.yml`):

```
Push to main → Build (standalone) → Upload artifact → Deploy via ZipDeploy → POST /api/admin/migrate
```

1. **Build Job:**
   - Checkout code → Setup Node.js 22 → `npm install` → `npm run build`
   - Copy `.next/static` and `public` into `.next/standalone`
   - Upload standalone package as artifact

2. **Deploy Job:**
   - Download artifact
   - Deploy to Azure App Service `app-aspr-photos` via `azure/webapps-deploy@v2`
   - Authentication: Publish profile (`AZURE_WEBAPP_PUBLISH_PROFILE` secret)

3. **Post-Deploy:**
   - Hit `POST /api/admin/migrate` with `x-admin-token` header for schema updates
   - App Service startup command: `node server.js`

---

## 10. Error Handling

### 10.1 API Error Responses

| Status | Meaning | Details Exposed |
|---|---|---|
| 400 | Bad Request | Validation error message |
| 401 | Unauthorized | Generic "Unauthorized" |
| 403 | Forbidden | "Forbidden" (signed URL failure) |
| 404 | Not Found | No body |
| 429 | Rate Limited | Retry-After header |
| 500 | Server Error | Generic message only |

### 10.2 Error Principles

- Internal error details are **never** exposed to clients (OWASP Information Disclosure)
- Full error details logged server-side via `console.error`
- Rate limit responses include `Retry-After` header
- Cache-Control headers prevent caching of error responses (`no-store`)

---

## 11. Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Federal Project Sponsor | | | |
| Technical Lead | | | |
| Security Officer | | | |
| Operations Lead | | | |

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-02-07 | HHS ASPR / Leidos | Initial system design document |
| 1.1 | 2026-02-07 | HHS ASPR / Leidos | Multi-tier auth architecture: Entra ID SSO, Login.gov, ID.me OIDC; Auth.js integration; updated auth flows and API routes |
| 2.0 | 2026-02-07 | HHS ASPR / Leidos | Post-deployment: Azure Front Door Premium architecture with WAF and Private Link; admin photo management (11 components: grid, detail sidebar, editor, tag manager, bulk ops); expanded 8-table schema with EXIF, renditions, tags, audit log; CI/CD pipeline; CDN rendition delivery; logo preloader; sync-overlap page transitions |
