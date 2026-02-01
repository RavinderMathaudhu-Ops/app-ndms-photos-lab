# NDMS PIN Management - Admin Guide

## Overview

Administrators have **three ways** to create PINs for field teams:

1. **Web Dashboard** (`/admin`) - Recommended for single PIN creation
2. **CLI Tool** - Best for batch PIN generation and automation
3. **Direct API** - For integration with other systems (curl/scripts)

---

## 🌐 Method 1: Web Admin Dashboard

### Access the Dashboard

1. **Local Development:**
   ```
   http://localhost:3000/admin
   ```

2. **Production:**
   ```
   https://ndms-photos-lab.azurewebsites.net/admin
   ```

### Create a PIN

1. Go to the admin dashboard
2. Enter your `ADMIN_TOKEN` from `.env.local` (or Key Vault)
3. Click "Login as Admin"
4. Enter a team name (optional - auto-generated if blank)
5. Click "Create PIN"
6. Copy the PIN and share securely with your team

### Features
- ✅ User-friendly web interface
- ✅ View all active PINs
- ✅ Copy PIN to clipboard
- ✅ See PIN expiration date (7 days)
- ✅ Team identification

---

## 🖥️ Method 2: CLI Tool (Recommended for Batch Operations)

### Setup

Make the script executable:
```bash
chmod +x scripts/admin-cli.js
```

### Create a Single PIN

```bash
ADMIN_TOKEN=your-admin-token node scripts/admin-cli.js create-pin "Team A"
```

**Output:**
```
╔═══════════════════════════════════╗
║ 📌 NEW PIN CREATED                ║
╚═══════════════════════════════════╝
PIN:       123456
Team:      Team A
ID:        a1b2c3d4-...
Expires:   7 days

👉 Share this PIN with your team via secure channel
```

### Create Multiple PINs

```bash
ADMIN_TOKEN=your-admin-token node scripts/admin-cli.js create-pins 5
```

**Output:**
```
📋 Creating 5 PINs...
✅ PIN 1/5: 234567 (Team 1)
✅ PIN 2/5: 345678 (Team 2)
✅ PIN 3/5: 456789 (Team 3)
✅ PIN 4/5: 567890 (Team 4)
✅ PIN 5/5: 678901 (Team 5)

✅ Successfully created 5 PINs

📊 Summary:
──────────────────────────────────────────────
PIN      │ Team
──────────────────────────────────────────────
234567   │ Team 1
345678   │ Team 2
456789   │ Team 3
567890   │ Team 4
678901   │ Team 5
──────────────────────────────────────────────
```

### Advanced: Production Deployment

```bash
API_URL=https://ndms-photos-lab.azurewebsites.net \
ADMIN_TOKEN=<from-key-vault> \
node scripts/admin-cli.js create-pins 10
```

---

## 📡 Method 3: Direct API (cURL/Postman)

### Endpoint

```
POST /api/auth/create-session
```

### Request

```bash
curl -X POST http://localhost:3000/api/auth/create-session \
  -H "Content-Type: application/json" \
  -H "x-admin-token: your-admin-token" \
  -d '{"teamName": "Team A"}'
```

### Response

```json
{
  "id": "a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6",
  "pin": "123456",
  "team_name": "Team A"
}
```

### Error Responses

**Invalid Admin Token:**
```json
{
  "error": "Unauthorized"
}
```
Status: `401`

**Too Many Failed Attempts:**
```json
{
  "error": "Too many failed authentication attempts"
}
```
Status: `429` (Rate limited for 30 minutes)

**Rate Limited (Excessive PIN Generation):**
```json
{
  "error": "Rate limit exceeded for PIN generation"
}
```
Status: `429` (Max 20 PINs per minute)

---

## 🔐 Getting Your Admin Token

### Local Development

Check your `.env.local` file:
```bash
cat .env.local | grep ADMIN_TOKEN
# Output: ADMIN_TOKEN=my-secret-admin-token
```

### Production (Azure)

Retrieve from Azure Key Vault:
```bash
az keyvault secret show --vault-name ndms-keyvault --name admin-token --query value -o tsv
```

Or from Azure Portal:
1. Go to **Key Vault** → `ndms-keyvault`
2. Select **Secrets**
3. Click **admin-token**
4. Copy the value

---

## 📋 PIN Lifecycle

| Status | Details |
|--------|---------|
| **Created** | PIN is issued to team |
| **Active** | PIN can be used to authenticate (up to 7 days) |
| **Expired** | PIN automatically expires after 7 days |
| **Used** | Pins can be reused by multiple team members |

### Expiration Check

```bash
# PINs expire 7 days after creation
# No manual revocation - relies on time-based expiration
# For emergency revocation, delete from database manually:

DELETE FROM upload_sessions WHERE pin = '123456'
```

---

## 📊 Monitoring & Logging

### View PIN Creation Attempts

Check application logs for audit trail:

**Local:**
```
✅ PIN_CREATED: Team A, PIN: ***56
⚠️ AUTH_FAILURE: Invalid admin token from 192.168.1.1
```

**Production (Azure Application Insights):**
1. Go to **App Service** → `ndms-photos-lab`
2. Click **Application Insights** → `ndms-ai`
3. Go to **Logs** → Run query:
   ```kusto
   customEvents
   | where name in ('PIN_CREATED', 'AUTH_FAILURE')
   | order by timestamp desc
   ```

---

## 🚨 Security Best Practices

### DO ✅

- ✅ Store ADMIN_TOKEN in Azure Key Vault (not in code)
- ✅ Rotate ADMIN_TOKEN regularly (monthly)
- ✅ Share PINs via secure channels (encrypted email, Signal, Teams)
- ✅ Limit PIN creation to authorized admins only
- ✅ Monitor PIN creation attempts for suspicious activity
- ✅ Use HTTPS in production

### DON'T ❌

- ❌ Never hardcode ADMIN_TOKEN in code
- ❌ Never share ADMIN_TOKEN via unencrypted channels
- ❌ Never log full PINs (last 2 digits only)
- ❌ Never allow public PIN creation
- ❌ Never increase PIN validity beyond 7 days without review

---

## 🆘 Troubleshooting

### "Unauthorized" Error

**Cause:** Invalid ADMIN_TOKEN

**Fix:**
```bash
# Verify your token is correct
echo $ADMIN_TOKEN

# Re-check .env.local
cat .env.local | grep ADMIN_TOKEN
```

### "Rate limit exceeded" After 3 Failed Attempts

**Cause:** Too many failed auth attempts (30-min lockout)

**Fix:** Wait 30 minutes before trying again, or use a different IP

### "Too many requests" After Creating 20+ PINs/Min

**Cause:** PIN creation rate limit (20 per minute)

**Fix:** Wait 60 seconds before creating more PINs

### CLI Script Not Running

**Fix:**
```bash
# Make script executable
chmod +x scripts/admin-cli.js

# Run with explicit Node path
node scripts/admin-cli.js create-pin "Team A"
```

---

## 📞 Support

For issues or questions:
1. Check this guide (PIN Management section)
2. Review the SECURITY.md file for rate limiting details
3. Check Azure Application Insights logs
4. Contact the NDMS team

---

## Quick Reference

| Task | Command |
|------|---------|
| Create 1 PIN | `ADMIN_TOKEN=token node scripts/admin-cli.js create-pin "Team Name"` |
| Create 10 PINs | `ADMIN_TOKEN=token node scripts/admin-cli.js create-pins 10` |
| Access Dashboard | `http://localhost:3000/admin` |
| Test API | `curl -H "x-admin-token: token" http://localhost:3000/api/auth/create-session` |
| Get Production Token | `az keyvault secret show --vault-name ndms-keyvault --name admin-token` |
