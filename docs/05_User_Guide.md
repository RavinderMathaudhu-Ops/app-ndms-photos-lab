# User Guide

**ASPR Photo Repository Application**

| Field | Value |
|---|---|
| System Name | ASPR Photo Repository |
| Document Version | 2.0 |
| Last Updated | 2026-02-07 |
| Owner | HHS ASPR / Leidos |

---

## 1. Introduction

### 1.1 What Is the ASPR Photo Repository?

The ASPR Photo Repository is a secure web application that allows Administration for Strategic Preparedness and Response (ASPR) field teams to upload, manage, and review disaster-related photographs during incident response operations. Photos can be tagged with GPS coordinates, incident IDs, and descriptive notes. Administrators have access to a full photo management dashboard for review, tagging, editing, bulk operations, and audit tracking.

### 1.2 Who Is This Guide For?

| User Role | Sections |
|---|---|
| **Field Team Members** | Sections 2–5 (Login, Photo Upload, Gallery, Tips) |
| **Administrators** | Sections 6–8 (Admin Dashboard, Photo Management, Session Management) |

### 1.3 Browser Requirements

| Browser | Minimum Version | Notes |
|---|---|---|
| Google Chrome | 100+ | Recommended |
| Microsoft Edge | 100+ | Recommended for HHS devices |
| Safari | 16+ | iOS and macOS |
| Firefox | 100+ | Supported |

The application is mobile-responsive and optimized for field use on smartphones and tablets.

---

## 2. Getting Started (Field Teams)

### 2.1 Accessing the Application

Navigate to the application URL provided by your administrator. You will see a branded loading sequence (the ASPR eagle logo with an animated reveal) followed by the welcome screen with hero imagery and a "Get Started" button.

### 2.2 Login Options

The application supports multiple ways to sign in. Your administrator will advise which method to use.

| Method | Who | How |
|---|---|---|
| **PIN** | All field teams | 6-digit PIN distributed by admin at staging area |
| **HHS Sign-In** | HHS/ASPR staff with Entra ID | Tap "Sign in with HHS" and use your HHS credentials |
| **Login.gov** | Federal employees, public users | Tap "Sign in with Login.gov" and use your Login.gov account |
| **ID.me** | External responders, contractors | Tap "Sign in with ID.me" and use your ID.me account |

### 2.3 PIN Login

1. Tap **Get Started** on the welcome screen
2. Enter the **6-digit PIN** provided by your operations administrator
3. The PIN auto-advances when all 6 digits are entered
4. On success, you will be taken to the photo upload screen

**Important:**

- PINs expire after **48 hours** — request a new one if yours has expired
- You have **5 attempts** per minute before a 15-minute lockout
- Remaining attempts are displayed after each failed login
- PINs are shared per team — all members of your team use the same PIN

### 2.4 SSO Login (HHS Sign-In, Login.gov, ID.me)

1. Tap **Get Started** on the welcome screen
2. Select your sign-in provider (HHS, Login.gov, or ID.me)
3. You will be redirected to the identity provider's login page
4. Complete sign-in with your credentials and MFA
5. You will be redirected back to the photo upload screen

**Notes:**

- Login.gov and ID.me accounts are **one-time registration** — if you already have an account from another government service (IRS, VA, FEMA, USAJOBS), you can use it here
- SSO login requires an active internet connection for the redirect flow
- If connectivity is limited in the field, use a PIN instead

### 2.5 Session Information

After logging in:

- Your **team name** or **display name** is shown at the top of the screen
- Your session is valid for **24 hours**
- Closing the browser tab will end your session
- You can log out at any time using the **Log Out** button

---

## 3. Uploading Photos

### 3.1 Step 1: Select Photos

1. After login, you will see the **photo selection** screen
2. Tap the **camera/upload area** to:
   - **Take a photo** using your device camera (mobile)
   - **Select files** from your device (desktop or mobile)
3. Supported formats: **JPEG, PNG, WebP**
4. Maximum file size: **50 MB per photo**
5. You can select **multiple photos** at once
6. Selected photos appear in a preview strip at the bottom
7. Tap **Continue** when ready to add metadata

### 3.2 Step 2: Add Metadata

The metadata screen allows you to tag your photos with important incident information:

| Field | Required | Description |
|---|---|---|
| **Incident ID** | No | Incident identifier (e.g., HU-2024-001) |
| **GPS Location** | No | Latitude and longitude coordinates |
| **Notes** | No | Free-text description (max 1,000 characters) |

#### Adding GPS Coordinates

**Automatic (Recommended):**
1. Tap the **GPS pin icon** button
2. Allow browser location access when prompted
3. Coordinates will auto-populate

**Manual Entry:**
1. Enter latitude and longitude directly in the coordinate fields
2. Valid ranges: Latitude -90 to 90, Longitude -180 to 180

**ZIP Code Lookup:**
1. Enter a 5-digit ZIP code in the ZIP field
2. Tap **Go** to look up approximate coordinates

### 3.3 Step 3: Upload

1. Tap the **Upload Photos** button
2. Photos upload sequentially with a progress indicator
3. Each photo is processed: original stored + thumbnail generated
4. Upload progress shows "Uploading X of Y..."
5. On completion, the success screen displays the number of photos uploaded

### 3.4 After Upload

From the success screen, you can:
- **Take More Photos** — return to the photo selection step
- **View Gallery** — go to the gallery to review your uploads

---

## 4. Photo Gallery

### 4.1 Accessing the Gallery

Navigate to `/gallery` or tap **View Gallery** after uploading. The gallery shows all photos uploaded during your current session.

### 4.2 Gallery Features

| Feature | Description |
|---|---|
| **Thumbnail Grid** | Photos displayed in a responsive grid layout |
| **Photo Details** | Tap a photo to see full details (filename, size, dimensions, metadata) |
| **Download** | Download the original full-resolution image |
| **Delete** | Remove a photo (requires confirmation) |
| **Filter** | Filter photos by incident ID |

### 4.3 Downloading Photos

1. Tap the **Download** button on a photo card
2. The original full-resolution image will download to your device
3. Downloads use signed URLs that expire after 24 hours

### 4.4 Deleting Photos

1. Tap the **Delete** button on a photo card
2. Confirm the deletion when prompted
3. Both the original image and thumbnail are permanently removed
4. **This action cannot be undone**

---

## 5. Photography Tips

### 5.1 Best Practices for Field Photography

- **Steady shots:** Hold your device steady or brace against a surface
- **Good lighting:** Face the light source; avoid shooting into the sun
- **Multiple angles:** Capture wide shots and close-ups of damage
- **Include context:** Show surrounding area for scale and location reference
- **GPS tagging:** Enable GPS for every photo when possible
- **Incident ID:** Always tag photos with the correct incident identifier
- **Descriptive notes:** Add notes describing what the photo shows

### 5.2 File Size Considerations

- Photos larger than 50 MB cannot be uploaded
- Standard smartphone photos (12–50 MP) are typically 3–15 MB
- JPEG format is recommended for the best balance of quality and file size
- The system generates WebP thumbnails automatically

---

## 6. Admin Dashboard

### 6.1 Accessing the Admin Dashboard

1. Navigate to `/admin`
2. Sign in with your **HHS Entra ID credentials** (you must be a member of the ASPR Photo Admins security group)
3. If Entra ID is not configured, enter the **admin authentication token** provided by system operations

### 6.2 Dashboard Overview

After authentication, you will see two main tabs:

| Tab | Purpose |
|---|---|
| **Sessions** | Create PINs, manage upload sessions, view team activity |
| **Photos** | Full photo management grid with filtering, tagging, editing, and bulk operations |

### 6.3 Dashboard Stats

The top of the Photos tab displays summary statistics:

| Stat | Description |
|---|---|
| **Total Photos** | Count of all photos in the system |
| **Total Incidents** | Count of distinct incident IDs |
| **Daily Uploads** | Photos uploaded in the last 24 hours |
| **Top Teams** | Most active upload teams |

---

## 7. Photo Management (Admin)

### 7.1 Photo Grid

The photo management grid displays all photos in the system (not just your session). Features include:

| Feature | Description |
|---|---|
| **Virtual Scroll** | Efficiently loads thousands of photos without performance issues |
| **Cursor Pagination** | Loads more photos as you scroll down |
| **Search** | Search by filename, notes, or incident ID |
| **Sort** | Sort by date (newest/oldest), file size, or filename |

### 7.2 Filtering Photos

Use the filter bar above the grid to narrow results:

| Filter | Description |
|---|---|
| **Search** | Free-text search across filenames, notes, incident IDs |
| **Incident** | Filter by specific incident ID |
| **Status** | Filter by photo status (pending, reviewed, approved, flagged) |
| **Date Range** | Filter by upload date (from/to) |
| **Tags** | Filter by assigned tags |

### 7.3 Photo Detail Sidebar

Click any photo in the grid to open the detail sidebar:

| Section | What It Shows |
|---|---|
| **Preview** | Full-size photo preview |
| **Metadata** | Filename, size, dimensions, MIME type, upload date |
| **EXIF Data** | Camera make/model, focal length, aperture, ISO, date taken |
| **Location** | GPS coordinates, location name (if available) |
| **Tags** | Assigned tags with category badges |
| **Notes** | User-provided notes (editable) |
| **Session** | Team name and session ID that uploaded the photo |

From the sidebar, you can:
- **Edit metadata** — Update status, notes, incident ID, location name
- **Add/remove tags** — Assign tags from existing categories or create new ones
- **Download original** — Download the full-resolution image
- **Delete** — Permanently remove the photo (with confirmation)

### 7.4 Tag System

Tags help organize and categorize photos. Each tag has a name and an optional category:

| Category | Purpose | Examples |
|---|---|---|
| **status** | Photo review status | Pending, Reviewed, Approved, Rejected |
| **priority** | Urgency level | High, Medium, Low |
| **type** | Content classification | Structural Damage, Flooding, Infrastructure, Personnel |
| **timeline** | Temporal classification | Before, During, After |
| **custom** | User-defined | Any custom label |

To manage tags:
1. Click a photo to open the detail sidebar
2. In the Tags section, type to search existing tags or create new ones
3. Tags are displayed as colored badges based on their category

### 7.5 Bulk Operations

Select multiple photos to perform bulk actions:

1. **Select photos** — Click the checkbox on each photo, or use "Select All" to select all visible photos
2. **Bulk action bar** — A floating toolbar appears at the bottom of the screen showing the count of selected photos
3. **Available actions:**

| Action | Description |
|---|---|
| **Bulk Delete** | Delete all selected photos (with confirmation) |
| **Bulk Tag** | Assign a tag to all selected photos |
| **Bulk Status** | Change the status of all selected photos |
| **Bulk Download** | Download selected photos as a ZIP file |

**Bulk Download** generates signed URLs for each selected photo and downloads them as a client-side ZIP archive.

### 7.6 Photo Editor

The built-in photo editor allows non-destructive editing of photos:

1. Open a photo in the detail sidebar
2. Click **Edit Photo** to launch the editor
3. Available tools:

| Tool | Description |
|---|---|
| **Crop** | Crop to custom aspect ratio or preset ratios |
| **Rotate** | Rotate 90° clockwise/counterclockwise |
| **Annotate** | Draw arrows, circles, text labels on the photo |

4. Click **Save** to create an edited version (original is preserved)
5. Edit history is tracked in the `photo_edits` table

### 7.7 Admin Upload

Administrators can upload photos directly from the dashboard:

1. In the Photos tab, click **Upload Photos**
2. Drag and drop files or click to browse
3. Add metadata (incident ID, notes, GPS)
4. Uploads are tracked as an admin batch (source: "admin")

---

## 8. Session Management (Admin)

### 8.1 Creating a PIN

1. Go to the **Sessions** tab
2. Optionally enter a **Team Name** (e.g., "Alpha Team", "FEMA Region 4")
   - If left blank, the team name defaults to "Anonymous"
3. Tap **Generate New PIN**
4. A new 6-digit PIN will be displayed
5. **Copy the PIN immediately** — it is shown only once and cannot be retrieved later

### 8.2 PIN Details

| Property | Value |
|---|---|
| Length | 6 numeric digits |
| Expiration | 48 hours from creation |
| Sharing | One PIN can be shared with multiple team members |
| Storage | PIN is stored as a bcrypt hash — plaintext is not recoverable |

### 8.3 Viewing Sessions

The Sessions tab shows all upload sessions:

| Column | Description |
|---|---|
| **Team Name** | Name assigned when PIN was created |
| **Created** | When the session was created |
| **Expires** | When the PIN expires |
| **Status** | Active or Expired |
| **Photo Count** | Number of photos uploaded in this session |

### 8.4 Revoking a Session

To immediately deactivate a session (e.g., if a PIN is compromised):

1. Find the session in the Sessions tab
2. Click **Revoke**
3. The session is marked inactive — the PIN will no longer work
4. Photos already uploaded are not affected

### 8.5 PIN Distribution

- Communicate the PIN to field teams **verbally or via secure channel**
- Do not send PINs via unencrypted email
- A new PIN should be created for each deployment/operation
- Expired PINs cannot be reactivated — create a new one

---

## 9. Audit Trail (Admin)

All administrative actions are logged in an immutable audit trail. The audit log records:

| Field | Description |
|---|---|
| **Action** | What was done (create, update, delete, bulk_delete, etc.) |
| **Entity** | What was affected (photo, session, tag, migration) |
| **Performed By** | Admin email (Entra ID) or "token" (fallback auth) |
| **IP Address** | Client IP address |
| **Timestamp** | When the action occurred |
| **Details** | JSON details specific to the action |

The audit log cannot be modified or deleted. It provides a complete record of all administrative activity for compliance and accountability.

---

## 10. Troubleshooting

### 10.1 Common Issues

| Problem | Solution |
|---|---|
| "Invalid or expired PIN" | Request a new PIN from your admin; PINs expire after 48 hours |
| "Too many attempts" | Wait 15 minutes, then try again |
| Upload fails | Check file is JPEG/PNG/WebP and under 50 MB |
| Photos not showing in gallery | Refresh the page; ensure you are logged in |
| GPS not working | Allow location access in browser settings |
| Page won't load | Check internet connection; try a different browser |
| Session expired | Log in again with your PIN (if still valid) |
| Admin login fails | Verify you are in the ASPR Photo Admins security group, or check admin token |
| Bulk download slow | Large selections may take time; try smaller batches |

### 10.2 Getting Help

Contact your system administrator or the ASPR IT support desk for assistance with:
- PIN generation and distribution
- Application access issues
- Technical problems with uploads
- Admin dashboard questions

---

## 11. Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Federal Project Sponsor | | | |
| Operations Lead | | | |

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-02-07 | HHS ASPR / Leidos | Initial user guide |
| 1.1 | 2026-02-07 | HHS ASPR / Leidos | Added SSO login options (HHS Entra ID, Login.gov, ID.me); updated admin authentication |
| 2.0 | 2026-02-07 | HHS ASPR / Leidos | Post Phase 6 deployment: full admin photo management guide (grid, detail sidebar, filtering, sorting, tag system, bulk operations, photo editor, admin upload); session management (view, revoke); audit trail; logo preloader description; expanded dashboard overview with stats |
