"""
Generate MS Project XML for ASPR Photo Repository project schedule.
Uses MS Project 2003 XML schema for broad compatibility.

Run:  python scripts/generate_project_plan_xml.py
Requires: No additional dependencies (uses stdlib xml.etree.ElementTree)
"""

from pathlib import Path
from datetime import datetime
from xml.etree.ElementTree import Element, SubElement, ElementTree, indent

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "ASPR_Photo_Repository_Project_Plan.xml"

NS = "http://schemas.microsoft.com/project"


# ══════════════════════════════════════════════════════════════════════
#  RESOURCES
# ══════════════════════════════════════════════════════════════════════

RESOURCES = [
    {"uid": 1,  "name": "Project Manager",       "initials": "PM"},
    {"uid": 2,  "name": "Business Analyst",       "initials": "BA"},
    {"uid": 3,  "name": "Software Architect",     "initials": "SA"},
    {"uid": 4,  "name": "Backend Developer",      "initials": "BD"},
    {"uid": 5,  "name": "Frontend Developer",     "initials": "FD"},
    {"uid": 6,  "name": "UI Designer",            "initials": "UD"},
    {"uid": 7,  "name": "Security Engineer",      "initials": "SE"},
    {"uid": 8,  "name": "Cloud Engineer",         "initials": "CE"},
    {"uid": 9,  "name": "DevOps Engineer",        "initials": "DE"},
    {"uid": 10, "name": "QA Engineer",            "initials": "QA"},
    {"uid": 11, "name": "Technical Writer",       "initials": "TW"},
    {"uid": 12, "name": "Authorizing Official",   "initials": "AO"},
]


# ══════════════════════════════════════════════════════════════════════
#  TASKS  (outline_level 1 = summary, 2 = work task)
# ══════════════════════════════════════════════════════════════════════

TASKS = [
    # ── Phase 1: Requirements & Design ───────────────────────────────
    {"uid": 1, "name": "Phase 1: Requirements & Design",
     "level": 1, "start": "2026-01-06", "finish": "2026-01-24",
     "dur": 15, "pct": 100, "preds": [], "res": None},
    {"uid": 2, "name": "Stakeholder interviews & analysis",
     "level": 2, "start": "2026-01-06", "finish": "2026-01-10",
     "dur": 5, "pct": 100, "preds": [], "res": 1},
    {"uid": 3, "name": "Requirements analysis & use cases",
     "level": 2, "start": "2026-01-06", "finish": "2026-01-10",
     "dur": 5, "pct": 100, "preds": [], "res": 2},
    {"uid": 4, "name": "SRS v1.0 drafting",
     "level": 2, "start": "2026-01-13", "finish": "2026-01-17",
     "dur": 5, "pct": 100, "preds": [2], "res": 11},
    {"uid": 5, "name": "System Design Document (SDD) drafting",
     "level": 2, "start": "2026-01-13", "finish": "2026-01-17",
     "dur": 5, "pct": 100, "preds": [3], "res": 3},
    {"uid": 6, "name": "Security Plan drafting",
     "level": 2, "start": "2026-01-13", "finish": "2026-01-17",
     "dur": 5, "pct": 100, "preds": [3], "res": 7},
    {"uid": 7, "name": "Architecture design review",
     "level": 2, "start": "2026-01-20", "finish": "2026-01-24",
     "dur": 5, "pct": 100, "preds": [5, 6], "res": 3},
    {"uid": 8, "name": "Requirements signoff",
     "level": 2, "start": "2026-01-20", "finish": "2026-01-24",
     "dur": 5, "pct": 100, "preds": [4], "res": 1},

    # ── Phase 2: Core Development ────────────────────────────────────
    {"uid": 9, "name": "Phase 2: Core Development",
     "level": 1, "start": "2026-01-27", "finish": "2026-02-07",
     "dur": 10, "pct": 100, "preds": [1], "res": None},
    {"uid": 10, "name": "Database schema design (8 tables)",
     "level": 2, "start": "2026-01-27", "finish": "2026-01-28",
     "dur": 2, "pct": 100, "preds": [8], "res": 4},
    {"uid": 11, "name": "Azure SQL + Blob Storage setup",
     "level": 2, "start": "2026-01-27", "finish": "2026-01-28",
     "dur": 2, "pct": 100, "preds": [8], "res": 8},
    {"uid": 12, "name": "PIN authentication (bcrypt + JWT)",
     "level": 2, "start": "2026-01-29", "finish": "2026-01-31",
     "dur": 3, "pct": 100, "preds": [10], "res": 4},
    {"uid": 13, "name": "Photo upload API + Sharp pipeline",
     "level": 2, "start": "2026-01-29", "finish": "2026-02-03",
     "dur": 4, "pct": 100, "preds": [10, 11], "res": 4},
    {"uid": 14, "name": "Photo gallery implementation",
     "level": 2, "start": "2026-02-03", "finish": "2026-02-05",
     "dur": 3, "pct": 100, "preds": [13], "res": 5},
    {"uid": 15, "name": "Field upload wizard (6-step)",
     "level": 2, "start": "2026-02-03", "finish": "2026-02-05",
     "dur": 3, "pct": 100, "preds": [13], "res": 5},
    {"uid": 16, "name": "Geolocation + ZIP code lookup",
     "level": 2, "start": "2026-02-05", "finish": "2026-02-07",
     "dur": 3, "pct": 100, "preds": [15], "res": 5},
    {"uid": 17, "name": "Integration testing",
     "level": 2, "start": "2026-02-06", "finish": "2026-02-07",
     "dur": 2, "pct": 100, "preds": [14, 15], "res": 10},

    # ── Phase 3: Security Hardening ──────────────────────────────────
    {"uid": 18, "name": "Phase 3: Security Hardening",
     "level": 1, "start": "2026-02-03", "finish": "2026-02-07",
     "dur": 5, "pct": 100, "preds": [], "res": None},
    {"uid": 19, "name": "bcrypt PIN hashing migration",
     "level": 2, "start": "2026-02-03", "finish": "2026-02-03",
     "dur": 1, "pct": 100, "preds": [12], "res": 7},
    {"uid": 20, "name": "JWT implementation + expiry controls",
     "level": 2, "start": "2026-02-03", "finish": "2026-02-04",
     "dur": 2, "pct": 100, "preds": [12], "res": 4},
    {"uid": 21, "name": "Rate limiting (IP-based, in-memory)",
     "level": 2, "start": "2026-02-04", "finish": "2026-02-04",
     "dur": 1, "pct": 100, "preds": [20], "res": 4},
    {"uid": 22, "name": "HMAC-SHA256 signed image URLs",
     "level": 2, "start": "2026-02-04", "finish": "2026-02-05",
     "dur": 2, "pct": 100, "preds": [20], "res": 7},
    {"uid": 23, "name": "Security headers (HSTS, CSP, etc.)",
     "level": 2, "start": "2026-02-05", "finish": "2026-02-05",
     "dur": 1, "pct": 100, "preds": [], "res": 4},
    {"uid": 24, "name": "Input validation (OWASP alignment)",
     "level": 2, "start": "2026-02-05", "finish": "2026-02-06",
     "dur": 2, "pct": 100, "preds": [21], "res": 7},
    {"uid": 25, "name": "Audit logging implementation",
     "level": 2, "start": "2026-02-06", "finish": "2026-02-07",
     "dur": 2, "pct": 100, "preds": [24], "res": 4},
    {"uid": 26, "name": "Security review checkpoint",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-07",
     "dur": 1, "pct": 100, "preds": [25], "res": 7},

    # ── Phase 4: Admin Dashboard ─────────────────────────────────────
    {"uid": 27, "name": "Phase 4: Admin Dashboard",
     "level": 1, "start": "2026-02-03", "finish": "2026-02-10",
     "dur": 6, "pct": 100, "preds": [], "res": None},
    {"uid": 28, "name": "Entra ID OIDC integration (Auth.js v5)",
     "level": 2, "start": "2026-02-03", "finish": "2026-02-04",
     "dur": 2, "pct": 100, "preds": [20], "res": 4},
    {"uid": 29, "name": "Admin auth guard (dual-method)",
     "level": 2, "start": "2026-02-04", "finish": "2026-02-04",
     "dur": 1, "pct": 100, "preds": [28], "res": 4},
    {"uid": 30, "name": "Photo management grid (virtualized)",
     "level": 2, "start": "2026-02-04", "finish": "2026-02-06",
     "dur": 3, "pct": 100, "preds": [29], "res": 5},
    {"uid": 31, "name": "Photo filter bar + search",
     "level": 2, "start": "2026-02-05", "finish": "2026-02-06",
     "dur": 2, "pct": 100, "preds": [30], "res": 5},
    {"uid": 32, "name": "Photo detail sidebar + inline editing",
     "level": 2, "start": "2026-02-06", "finish": "2026-02-07",
     "dur": 2, "pct": 100, "preds": [30], "res": 5},
    {"uid": 33, "name": "Bulk operations (delete/tag/download)",
     "level": 2, "start": "2026-02-06", "finish": "2026-02-07",
     "dur": 2, "pct": 100, "preds": [30], "res": 5},
    {"uid": 34, "name": "Tag system (CRUD + assignment)",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-08",
     "dur": 2, "pct": 100, "preds": [33], "res": 4},
    {"uid": 35, "name": "Photo editor (crop/rotate/flip)",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-08",
     "dur": 2, "pct": 100, "preds": [32], "res": 5},
    {"uid": 36, "name": "EXIF extraction + display",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-08",
     "dur": 1, "pct": 100, "preds": [35], "res": 4},
    {"uid": 37, "name": "Multi-rendition pipeline (3 variants)",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-09",
     "dur": 2, "pct": 100, "preds": [35], "res": 4},
    {"uid": 38, "name": "Session manager component",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-09",
     "dur": 1, "pct": 100, "preds": [29], "res": 5},
    {"uid": 39, "name": "Admin audit log table",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-10",
     "dur": 2, "pct": 100, "preds": [34], "res": 4},
    {"uid": 40, "name": "Database migration endpoint",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-10",
     "dur": 2, "pct": 100, "preds": [39], "res": 4},

    # ── Phase 5: Infrastructure & CDN ────────────────────────────────
    {"uid": 41, "name": "Phase 5: Infrastructure & CDN",
     "level": 1, "start": "2026-02-05", "finish": "2026-02-10",
     "dur": 4, "pct": 100, "preds": [], "res": None},
    {"uid": 42, "name": "Azure Front Door Premium setup",
     "level": 2, "start": "2026-02-05", "finish": "2026-02-06",
     "dur": 2, "pct": 100, "preds": [11], "res": 8},
    {"uid": 43, "name": "WAF policy (OWASP DRS 2.1 + bot)",
     "level": 2, "start": "2026-02-06", "finish": "2026-02-07",
     "dur": 2, "pct": 100, "preds": [42], "res": 7},
    {"uid": 44, "name": "Private Link origin (blob storage)",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-07",
     "dur": 1, "pct": 100, "preds": [42], "res": 8},
    {"uid": 45, "name": "Private Link origin (app service)",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-07",
     "dur": 1, "pct": 100, "preds": [42], "res": 8},
    {"uid": 46, "name": "CDN endpoint configuration",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-08",
     "dur": 2, "pct": 100, "preds": [44, 45], "res": 8},
    {"uid": 47, "name": "Health probe setup (/api/health)",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-08",
     "dur": 1, "pct": 100, "preds": [46], "res": 8},
    {"uid": 48, "name": "Private Link approval + testing",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-10",
     "dur": 3, "pct": 100, "preds": [46], "res": 8},
    {"uid": 49, "name": "Security policy binding (WAF to endpoint)",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-10",
     "dur": 2, "pct": 100, "preds": [43, 46], "res": 7},

    # ── Phase 6: CI/CD & Deployment ──────────────────────────────────
    {"uid": 50, "name": "Phase 6: CI/CD & Deployment",
     "level": 1, "start": "2026-02-07", "finish": "2026-02-10",
     "dur": 4, "pct": 100, "preds": [], "res": None},
    {"uid": 51, "name": "GitHub Actions workflow creation",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-07",
     "dur": 1, "pct": 100, "preds": [17], "res": 9},
    {"uid": 52, "name": "Publish profile auth setup",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-08",
     "dur": 2, "pct": 100, "preds": [51], "res": 9},
    {"uid": 53, "name": "Standalone build + artifact packaging",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-08",
     "dur": 1, "pct": 100, "preds": [51], "res": 9},
    {"uid": 54, "name": "ZipDeploy to App Service",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-09",
     "dur": 2, "pct": 100, "preds": [52, 53], "res": 9},
    {"uid": 55, "name": "Post-deploy migration trigger",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-09",
     "dur": 1, "pct": 100, "preds": [40, 54], "res": 9},
    {"uid": 56, "name": "App Service configuration",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-10",
     "dur": 2, "pct": 100, "preds": [54], "res": 8},
    {"uid": 57, "name": "End-to-end deploy verification",
     "level": 2, "start": "2026-02-10", "finish": "2026-02-10",
     "dur": 1, "pct": 100, "preds": [55, 56], "res": 10},

    # ── Phase 7: UI/UX Polish ────────────────────────────────────────
    {"uid": 58, "name": "Phase 7: UI/UX Polish",
     "level": 1, "start": "2026-02-05", "finish": "2026-02-10",
     "dur": 4, "pct": 100, "preds": [], "res": None},
    {"uid": 59, "name": "ASPR branding + color system",
     "level": 2, "start": "2026-02-05", "finish": "2026-02-06",
     "dur": 2, "pct": 100, "preds": [14], "res": 6},
    {"uid": 60, "name": "Glassmorphic design system",
     "level": 2, "start": "2026-02-06", "finish": "2026-02-07",
     "dur": 2, "pct": 100, "preds": [59], "res": 6},
    {"uid": 61, "name": "Framer Motion animations",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-08",
     "dur": 2, "pct": 100, "preds": [60], "res": 5},
    {"uid": 62, "name": "ASPR logo preloader",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-08",
     "dur": 1, "pct": 100, "preds": [61], "res": 5},
    {"uid": 63, "name": "Smooth page transitions (sync overlap)",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-09",
     "dur": 2, "pct": 100, "preds": [61], "res": 5},
    {"uid": 64, "name": "WebP hero images + cache headers",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-09",
     "dur": 1, "pct": 100, "preds": [63], "res": 5},
    {"uid": 65, "name": "Responsive layout testing",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-10",
     "dur": 2, "pct": 100, "preds": [63], "res": 10},

    # ── Phase 8: Documentation ───────────────────────────────────────
    {"uid": 66, "name": "Phase 8: Documentation",
     "level": 1, "start": "2026-02-05", "finish": "2026-02-10",
     "dur": 4, "pct": 100, "preds": [], "res": None},
    {"uid": 67, "name": "SRS v2.0 (post-deployment update)",
     "level": 2, "start": "2026-02-05", "finish": "2026-02-06",
     "dur": 2, "pct": 100, "preds": [26], "res": 11},
    {"uid": 68, "name": "SDD finalization",
     "level": 2, "start": "2026-02-05", "finish": "2026-02-06",
     "dur": 2, "pct": 100, "preds": [7], "res": 11},
    {"uid": 69, "name": "Security Plan finalization",
     "level": 2, "start": "2026-02-06", "finish": "2026-02-07",
     "dur": 2, "pct": 100, "preds": [26], "res": 7},
    {"uid": 70, "name": "Deployment & Operations Guide",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-08",
     "dur": 2, "pct": 100, "preds": [57], "res": 11},
    {"uid": 71, "name": "User Guide",
     "level": 2, "start": "2026-02-07", "finish": "2026-02-08",
     "dur": 2, "pct": 100, "preds": [32], "res": 11},
    {"uid": 72, "name": "API & Data Reference",
     "level": 2, "start": "2026-02-08", "finish": "2026-02-09",
     "dur": 2, "pct": 100, "preds": [40], "res": 11},
    {"uid": 73, "name": "Executive Summary PPTX v2.0",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-10",
     "dur": 2, "pct": 100, "preds": [72], "res": 11},
    {"uid": 74, "name": "Project Plan XML",
     "level": 2, "start": "2026-02-09", "finish": "2026-02-10",
     "dur": 2, "pct": 100, "preds": [73], "res": 1},
    {"uid": 75, "name": "Document package review",
     "level": 2, "start": "2026-02-10", "finish": "2026-02-10",
     "dur": 1, "pct": 100, "preds": [73, 74], "res": 1},

    # ── Phase 9: UAT & ATO ───────────────────────────────────────────
    {"uid": 76, "name": "Phase 9: UAT & ATO",
     "level": 1, "start": "2026-02-10", "finish": "2026-03-07",
     "dur": 20, "pct": 50, "preds": [], "res": None},
    {"uid": 77, "name": "UAT test plan creation",
     "level": 2, "start": "2026-02-10", "finish": "2026-02-12",
     "dur": 3, "pct": 100, "preds": [75], "res": 10},
    {"uid": 78, "name": "Field team UAT sessions",
     "level": 2, "start": "2026-02-12", "finish": "2026-02-21",
     "dur": 8, "pct": 75, "preds": [77], "res": 10},
    {"uid": 79, "name": "UAT defect remediation",
     "level": 2, "start": "2026-02-17", "finish": "2026-02-28",
     "dur": 10, "pct": 50, "preds": [78], "res": 4},
    {"uid": 80, "name": "Security assessment",
     "level": 2, "start": "2026-02-17", "finish": "2026-02-28",
     "dur": 10, "pct": 50, "preds": [26], "res": 7},
    {"uid": 81, "name": "ATO package preparation",
     "level": 2, "start": "2026-02-24", "finish": "2026-03-03",
     "dur": 6, "pct": 25, "preds": [80], "res": 7},
    {"uid": 82, "name": "Stakeholder signoff",
     "level": 2, "start": "2026-03-03", "finish": "2026-03-07",
     "dur": 5, "pct": 0, "preds": [81], "res": 1},
    {"uid": 83, "name": "ATO approval",
     "level": 2, "start": "2026-03-03", "finish": "2026-03-07",
     "dur": 5, "pct": 0, "preds": [81], "res": 12},

    # ── Phase 10: Production Operations ──────────────────────────────
    {"uid": 84, "name": "Phase 10: Production Operations",
     "level": 1, "start": "2026-03-10", "finish": "2026-04-04",
     "dur": 20, "pct": 0, "preds": [76], "res": None},
    {"uid": 85, "name": "Azure Monitor + App Insights setup",
     "level": 2, "start": "2026-03-10", "finish": "2026-03-12",
     "dur": 3, "pct": 0, "preds": [83], "res": 8},
    {"uid": 86, "name": "Application Insights integration",
     "level": 2, "start": "2026-03-10", "finish": "2026-03-12",
     "dur": 3, "pct": 0, "preds": [83], "res": 9},
    {"uid": 87, "name": "Operations staff training",
     "level": 2, "start": "2026-03-12", "finish": "2026-03-14",
     "dur": 3, "pct": 0, "preds": [85], "res": 1},
    {"uid": 88, "name": "Field pilot exercise",
     "level": 2, "start": "2026-03-17", "finish": "2026-03-28",
     "dur": 10, "pct": 0, "preds": [87], "res": 1},
    {"uid": 89, "name": "v1.1 feature planning",
     "level": 2, "start": "2026-03-24", "finish": "2026-04-04",
     "dur": 10, "pct": 0, "preds": [88], "res": 3},
    {"uid": 90, "name": "Login.gov + ID.me integration",
     "level": 2, "start": "2026-03-24", "finish": "2026-04-04",
     "dur": 10, "pct": 0, "preds": [88], "res": 4},
]


# ══════════════════════════════════════════════════════════════════════
#  XML BUILDER
# ══════════════════════════════════════════════════════════════════════

def _se(parent, tag, text=None):
    """SubElement shorthand."""
    el = SubElement(parent, tag)
    if text is not None:
        el.text = str(text)
    return el


def build_calendar(parent):
    """Standard 5-day work-week calendar."""
    calendars = _se(parent, "Calendars")
    cal = _se(calendars, "Calendar")
    _se(cal, "UID", "1")
    _se(cal, "Name", "Standard")
    _se(cal, "IsBaseCalendar", "1")

    week_days = _se(cal, "WeekDays")

    # Mon-Fri: working (type=0)
    for day_num in range(2, 7):  # 2=Mon .. 6=Fri
        wd = _se(week_days, "WeekDay")
        _se(wd, "DayType", str(day_num))
        _se(wd, "DayWorking", "1")
        wt = _se(wd, "WorkingTimes")
        wt1 = _se(wt, "WorkingTime")
        _se(wt1, "FromTime", "08:00:00")
        _se(wt1, "ToTime", "12:00:00")
        wt2 = _se(wt, "WorkingTime")
        _se(wt2, "FromTime", "13:00:00")
        _se(wt2, "ToTime", "17:00:00")

    # Sat (7) + Sun (1): non-working
    for day_num in [1, 7]:
        wd = _se(week_days, "WeekDay")
        _se(wd, "DayType", str(day_num))
        _se(wd, "DayWorking", "0")


def build_tasks(parent):
    """Build <Tasks> element from TASKS list."""
    tasks_el = _se(parent, "Tasks")

    for task in TASKS:
        t = _se(tasks_el, "Task")
        _se(t, "UID", str(task["uid"]))
        _se(t, "ID", str(task["uid"]))
        _se(t, "Name", task["name"])
        _se(t, "OutlineLevel", str(task["level"]))
        _se(t, "Start", f"{task['start']}T08:00:00")
        _se(t, "Finish", f"{task['finish']}T17:00:00")
        _se(t, "Duration", f"PT{task['dur'] * 8}H0M0S")
        _se(t, "DurationFormat", "7")   # days
        _se(t, "PercentComplete", str(task["pct"]))
        _se(t, "Summary", "1" if task["level"] == 1 else "0")
        _se(t, "Type", "1")             # Fixed duration
        _se(t, "ConstraintType", "0")   # As soon as possible

        for pred_uid in task.get("preds", []):
            pl = _se(t, "PredecessorLink")
            _se(pl, "PredecessorUID", str(pred_uid))
            _se(pl, "Type", "1")        # Finish-to-Start
            _se(pl, "CrossProject", "0")
            _se(pl, "LinkLag", "0")
            _se(pl, "LagFormat", "7")


def build_resources(parent):
    """Build <Resources> element."""
    resources_el = _se(parent, "Resources")
    for res in RESOURCES:
        r = _se(resources_el, "Resource")
        _se(r, "UID", str(res["uid"]))
        _se(r, "ID", str(res["uid"]))
        _se(r, "Name", res["name"])
        _se(r, "Initials", res["initials"])
        _se(r, "Type", "1")             # Work resource
        _se(r, "MaxUnits", "1.0")


def build_assignments(parent):
    """Build <Assignments> linking tasks to resources."""
    assignments_el = _se(parent, "Assignments")
    assign_uid = 1
    for task in TASKS:
        if task.get("res") and task["level"] > 1:
            a = _se(assignments_el, "Assignment")
            _se(a, "UID", str(assign_uid))
            _se(a, "TaskUID", str(task["uid"]))
            _se(a, "ResourceUID", str(task["res"]))
            _se(a, "Units", "1")
            assign_uid += 1


def build_project():
    """Build the complete Project XML."""
    root = Element("Project")
    root.set("xmlns", NS)

    # Project properties
    _se(root, "Name", "ASPR Photo Repository - Project Plan")
    _se(root, "Title", "ASPR Photo Repository Application")
    _se(root, "Subject", "Project Schedule")
    _se(root, "Author", "HHS ASPR / Leidos")
    _se(root, "Company", "Leidos / HHS ASPR")
    _se(root, "Manager", "Project Manager")
    _se(root, "CreationDate", datetime.now().isoformat())
    _se(root, "LastSaved", datetime.now().isoformat())
    _se(root, "StartDate", "2026-01-06T08:00:00")
    _se(root, "FinishDate", "2026-04-04T17:00:00")
    _se(root, "CalendarUID", "1")
    _se(root, "DefaultStartTime", "08:00:00")
    _se(root, "DefaultFinishTime", "17:00:00")
    _se(root, "MinutesPerDay", "480")
    _se(root, "MinutesPerWeek", "2400")
    _se(root, "DaysPerMonth", "20")
    _se(root, "ScheduleFromStart", "1")
    _se(root, "CurrencySymbol", "$")
    _se(root, "CurrencyDigits", "2")

    build_calendar(root)
    build_tasks(root)
    build_resources(root)
    build_assignments(root)

    return root


# ══════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("  ASPR Photo Repository \u2014 Project Plan XML Generation")
    print("=" * 60)
    print()

    root = build_project()
    indent(root, space="  ")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    tree = ElementTree(root)
    tree.write(str(OUT), encoding="utf-8", xml_declaration=True)

    size_kb = OUT.stat().st_size / 1024
    work_tasks = [t for t in TASKS if t["level"] > 1]
    summary_tasks = [t for t in TASKS if t["level"] == 1]
    complete = [t for t in work_tasks if t["pct"] == 100]

    print(f"  [OK] Project Plan XML generated: {OUT}")
    print(f"  Size: {size_kb:.1f} KB")
    print(f"  Phases: {len(summary_tasks)}")
    print(f"  Tasks: {len(work_tasks)}")
    print(f"  Complete: {len(complete)} / {len(work_tasks)}")
    print(f"  Resources: {len(RESOURCES)}")
    print()
    print("  Open in Microsoft Project, Project Online, or import")
    print("  into Azure DevOps / Jira / Smartsheet.")
    print("=" * 60)
