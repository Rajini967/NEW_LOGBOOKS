# Digital Log Book (LOG_BOOKS) – Tester README

This README is for **testers** who want to verify **every functionality** in **Equipment Master**, **Settings (Chiller daily limits)**, the full **Chiller module**, and how **Dashboard/Reports** work **internally** (fetch → calculate → store, including **table names**).

Related docs:
- `LOG_BOOKS/DASHBOARD_TESTING_GUIDE.md`
- `LOG_BOOKS/COMPREHENSIVE_TESTING_GUIDE.md`
- Frontend-only template: `LOG_BOOKS/frontend/README.md`
- Boiler-specific tests: `LOG_BOOKS/BOILER_README.md`

---

## Roles (what to test for each)

Backend permissions come from `LOG_BOOKS/backend/accounts/permissions.py`:

- **CanLogEntries**: `super_admin`, `admin`, `supervisor`, `operator`
- **CanApproveReports**: `super_admin`, `admin`, `supervisor`
- **IsAdminOrSuperAdmin**: `super_admin`, `admin`

### Role-wise access summary (core modules)

- **super_admin / admin**
  - Equipment Master: create/update/delete departments, categories, equipment
  - Settings: update session settings + set Chiller daily limits
  - Chiller: create/edit logs + approve/reject logs
  - Dashboard: all sections visible
  - Reports: view/export/print

- **supervisor**
  - Equipment Master: no CRUD
  - Settings: no access
  - Chiller: create logs + approve/reject
  - Dashboard: all sections visible
  - Reports: view/export/print

- **operator**
  - Equipment Master: no access
  - Settings: no access
  - Chiller: create logs (cannot approve)
  - Dashboard: all sections visible + Quick Actions
  - Reports: access depends on UI role rules (currently shown in sidebar for operator)

- **manager** (formerly client/customer; stored role value `manager`)
  - Dashboard: limited (no Scheduled Readings / no Equipment Status; summary APIs skipped)
  - Reports + Trends: view-only

---

## Key database tables and “source_table” tracking (Reports)

### Where log data is stored

- **Chiller logs table**: `chiller_logs`  
  Model: `LOG_BOOKS/backend/chiller_logs/models.py` → `ChillerLog`

- **Chiller daily limits table**: `chiller_equipment_limits` (Django model `ChillerEquipmentLimit`)  
  Model: `LOG_BOOKS/backend/chiller_logs/models.py`

- **Reports table**: `reports`  
  Model: `LOG_BOOKS/backend/reports/models.py` → `Report`

### How Reports link to original data (table name + id)

When an entry is **approved**, backend creates a row in `reports`:
- `report_type`: e.g. `utility`, `filter_register`, …
- `source_id`: UUID of the approved record
- `source_table`: **string name of the source table**, e.g.:
  - `chiller_logs`
  - `boiler_logs`
  - `compressor_logs`
  - `chemical_preparations`
  - `hvac_validations`
  - `filter_master`

Example (Chiller approve creates report):
- `LOG_BOOKS/backend/chiller_logs/views.py` calls `create_report_entry(...)` with `source_table='chiller_logs'`

This is the “store date with table names” concept: the Report row stores the approved timestamp (`approved_at`) and the **source_table** + **source_id** so the UI can fetch the original record for view/print/export.

---

## Chiller module – end-to-end flow (with roles)

```mermaid
flowchart TD
  OperatorOrAbove[Operator/Supervisor/Admin/SuperAdmin] --> CreateLog[POST /api/chiller-logs/]
  CreateLog --> DBChiller[(Table: chiller_logs)]
  DBChiller --> SubmitPending[Status: draft/pending]
  SupervisorOrAbove[Supervisor/Admin/SuperAdmin] --> ApproveReject[POST /api/chiller-logs/{id}/approve/]
  ApproveReject -->|approve| Approved[Status: approved]
  ApproveReject -->|reject| Rejected[Status: rejected]
  Approved --> CreateReport[Insert into reports (source_table=chiller_logs, source_id=log.id)]
  CreateReport --> ReportsUI[Reports Page: export/print]
```

### Step-by-step testing (Operator)

1. **Login** as `operator`.
2. Go to `E Log Book → Chiller → New Entry`.
3. Select **Equipment ID** (must exist in Equipment Master).
4. Fill required fields + optional fields (see “Fill all fields” in `COMPREHENSIVE_TESTING_GUIDE.md` or your test script).
5. Save as Draft / Submit (depending on UI button).
6. Verify:
   - Entry appears in list
   - Status is `draft` or `pending`

### Step-by-step testing (Supervisor / Admin / Super Admin)

1. Login as `supervisor` (or admin/super_admin).
2. Open a `pending` chiller entry.
3. Click **Approve**.
4. Verify:
   - Status becomes `approved`
   - A **Report row** is created (Reports page shows a new approved report)

### Step-by-step testing (Reject + correction path)

1. Approver rejects a pending entry **with remarks**.
2. Verify:
   - Status becomes `rejected`
3. Create a correction (if UI supports “Correct”):
   - New entry created as correction and can require secondary approval.

---

## Chiller “ALL fields” testing (step-by-step with examples)

Goal: prove that **every field** in the Chiller form is **editable (where applicable)**, **saved**, **reloaded correctly**, **validated**, **role-protected**, and **printed/exported** after approval.

### 1) What “all fields” means (backend truth)

Chiller log data is stored in DB table **`chiller_logs`** (model `ChillerLog`).

**Required numeric fields** (cannot be blank):
- `evap_water_inlet_pressure`, `evap_water_outlet_pressure`
- `evap_entering_water_temp`, `evap_leaving_water_temp`, `evap_approach_temp`
- `cond_water_inlet_pressure`, `cond_water_outlet_pressure`
- `cond_entering_water_temp`, `cond_leaving_water_temp`, `cond_approach_temp`

**Optional fields** (can be blank/null):
- Evaporator: `evap_water_inlet_pressure`, `evap_water_outlet_pressure`, `evap_entering_water_temp`, `evap_leaving_water_temp`, `evap_approach_temp`
- Condenser: `cond_water_inlet_pressure`, `cond_water_outlet_pressure`, `cond_entering_water_temp`, `cond_leaving_water_temp`, `cond_approach_temp`
- Electrical/control: `chiller_control_signal`, `avg_motor_current`, `compressor_running_time_min`, `starter_energy_kwh`
- Status: `cooling_tower_pump_status`, `chilled_water_pump_status`, `cooling_tower_fan_status`, `cooling_tower_blowoff_valve_status`, `cooling_tower_blowdown_time_min`
- Daily water (liters): `daily_water_consumption_ct1_liters`, `daily_water_consumption_ct2_liters`, `daily_water_consumption_ct3_liters`
- Chemicals: `cooling_tower_chemical_name`, `cooling_tower_chemical_qty_per_day`, `chilled_water_pump_chemical_name`, `chilled_water_pump_chemical_qty_kg`, `cooling_tower_fan_chemical_name`, `cooling_tower_fan_chemical_qty_kg`
- Sign/remarks: `recording_frequency`, `operator_sign`, `verified_by`, `remarks`, `comment`

**System/workflow fields** (read-only in UI/API):
- `operator_id`, `operator_name`, `status`
- `approved_by_id`, `approved_at`, `secondary_approved_by_id`, `secondary_approved_at`
- `corrects_id`, `has_corrections`
- `created_at`, `updated_at`

### 2) Pre-conditions

- Equipment exists in Equipment Master (example `CH-001`) and is selectable as `equipment_id`.
- Role access:
  - Operator: can create/update
  - Supervisor/Admin/Super Admin: can approve/reject
  - Admin/Super Admin: can set daily limits (Settings)

### 3) Positive test: submit one “FULL fields” entry (Operator)

1. Login as **Operator**
2. Go to `E Log Book → Chiller → New Entry`
3. Select equipment `CH-001`
4. Fill the form using these **example values**:

**Required**
- Evaporator:
  - `evap_water_inlet_pressure`: `2.6`
  - `evap_water_outlet_pressure`: `2.3`
  - `evap_entering_water_temp`: `13.0`
  - `evap_leaving_water_temp`: `7.0`
  - `evap_approach_temp`: `3.0`
- Condenser:
  - `cond_water_inlet_pressure`: `1.7`
  - `cond_water_outlet_pressure`: `1.2`
  - `cond_entering_water_temp`: `32.0`
  - `cond_leaving_water_temp`: `36.0`
  - `cond_approach_temp`: `3.0`
- Electrical/control:
  - `chiller_control_signal`: `62`
  - `avg_motor_current`: `98`
  - `compressor_running_time_min`: `240`
  - `starter_energy_kwh`: `45`
- Status:
  - `cooling_tower_pump_status`: `On`
  - `chilled_water_pump_status`: `On`
  - `cooling_tower_fan_status`: `On`
  - `cooling_tower_blowoff_valve_status`: `Close`
  - `cooling_tower_blowdown_time_min`: `5`
- Daily water (liters):
  - `daily_water_consumption_ct1_liters`: `1200`
  - `daily_water_consumption_ct2_liters`: `1100`
  - `daily_water_consumption_ct3_liters`: `900`
- Chemicals:
  - `cooling_tower_chemical_name`: `Biocide A`
  - `cooling_tower_chemical_qty_per_day`: `1.2`
  - `chilled_water_pump_chemical_name`: `Inhibitor B`
  - `chilled_water_pump_chemical_qty_kg`: `0.6`
  - `cooling_tower_fan_chemical_name`: `Anti-scale C`
  - `cooling_tower_fan_chemical_qty_kg`: `0.4`
- Sign/remarks:
  - `recording_frequency`: `Once in 4 hours`
  - `operator_sign`: `OP-01 / 2026-03-09`
  - `verified_by`: `SUP-01 / pending`
  - `remarks`: `All parameters within range.`
  - `comment`: `Test entry full fields`

5. Click Save/Submit
6. Verify:
   - Entry appears in list
   - Status is `draft` or `pending`

### 4) Persistence check (most important “all fields” proof)

1. Open the saved entry again
2. Verify every filled field:
   - Still shows the same value after reload
   - No unexpected rounding, blanking, or unit mismatch

### 5) Validation tests (required + non-negative)

Backend enforces `MinValueValidator(0)` on numeric fields.

- **Missing required**: clear `evap_water_inlet_pressure` → Save should fail
- **Negative number**: set `starter_energy_kwh = -1` → Save should fail

### 6) Daily limits tests (Settings → Chiller daily limits)

This proves “daily limit is working”.

1. As **Admin/Super Admin**, set small limit for `CH-001`, e.g.:
   - `daily_power_limit_kw = 50`
2. As **Operator**, create 2 entries on same date:
   - Entry 1: `starter_energy_kwh = 40` (should save)
   - Entry 2: `starter_energy_kwh = 20` (should fail: exceeded)

Repeat for water limits using:
- water: `daily_water_consumption_ct1_liters` etc.

### 7) Role tests (security)

- Operator cannot access Settings / cannot approve
- Supervisor/Admin/Super Admin can approve/reject

### 8) Approval → Report row → PDF contains all fields

1. As Supervisor/Admin/Super Admin, approve a pending entry
2. Verify in Reports:
   - Report appears
   - Internally, `reports.source_table = chiller_logs` and `reports.source_id = <log uuid>`
3. Export/Print:
   - First page keeps original summary format
   - Additional pages/sections contain remaining fields (raw details)

## Equipment Master – step-by-step testing (Admin/Super Admin)

Routes:
- Departments: `/equipment/departments`
- Categories: `/equipment/categories`
- Equipment List: `/equipment/list`

### A) Create master data (baseline for Chiller testing)

1. **Create Department**
   - Example: `Production`
2. **Create Equipment Category**
   - Example: `Chiller`
3. **Create Equipment**
   - Equipment Number: `CH-01`
   - Name: `Chiller 1`
   - Department: `Production`
   - Category: `Chiller`

Verify:
- Equipment appears in Equipment List
- It is selectable in Chiller log entry “Equipment ID”

### B) Delete negative test (used by other modules)

If equipment is referenced by protected relations (e.g., filter assignment), deletion should return **400** with a clear message (not 500).

---

## Settings – session settings + Chiller daily limits (Admin/Super Admin)

Route:
- `/settings`

### A) Session settings (affects Dashboard scheduled readings + auto logout)

1. Open Settings.
2. Set:
   - Auto logout minutes (example: `30`)
   - Log entry interval: `hourly` / `shift` / `daily`
   - Shift duration hours (if interval = shift): example `8`
3. Save.
4. Verify:
   - Auto logout triggers after inactivity (for test, set small value like 1–2 minutes).
   - Dashboard “Scheduled readings status” changes based on interval.

### B) Chiller daily limits (the feature you asked to test)

Where:
- Settings page loads all equipment in category “Chiller/Chillers” and lets you save limits.

API:
- Read: `GET /api/chiller-limits/{equipment_number}/`
- Create: `POST /api/chiller-limits/`
- Update: `PATCH /api/chiller-limits/{equipment_number}/`

### Fields to fill (UI label → API field)

- **Daily power limit (kWh)** → `daily_power_limit_kw`
- **Cooling Tower 1 – Water limit (L)** → `daily_water_ct1_liters`
- **Cooling Tower 2 – Water limit (L)** → `daily_water_ct2_liters`
- **Cooling Tower 3 – Water limit (L)** → `daily_water_ct3_liters`

### Example: fill ALL fields (one chiller)

For equipment `CH-01`, enter these example values (any `0+` number is valid; blank means “No limit”):

- `daily_power_limit_kw`: `250`
- `daily_water_ct1_liters`: `5000`
- `daily_water_ct2_liters`: `4200`
- `daily_water_ct3_liters`: `3800`

Click **Save limits**, then do a hard refresh and re-open Settings:
- Re-select `CH-01`
- Confirm every field still shows the same values (persistence check)

### “No limit” behavior (blank → unlimited)

1. Clear (blank) one field (example: `daily_water_ct2_liters`)
2. Save limits
3. Refresh page and re-select chiller
4. Expected:
   - Field shows `No limit`
   - Logs are not blocked for that category by limits (only blocked if a limit value is set)

### How the backend enforces daily limits (internal)

Backend validates at log create/update using:
- `LOG_BOOKS/backend/chiller_logs/views.py` → `_validate_chiller_daily_limits(...)`

It aggregates totals for the same equipment and date:
- power: sum of `starter_energy_kwh`
- water CT1/CT2/CT3: sum of `daily_water_consumption_ct1_liters` etc.

If totals exceed the configured limit, it returns a validation error like:
- “Daily power limit (…) exceeded for this chiller.”
- “Cooling tower 1 daily water consumption limit exceeded.”

### Step-by-step daily limit tests (works/doesn’t work)

Note: Chiller logs are also constrained by the “one entry per time slot per equipment” rule (hourly/shift/daily). For “limit exceeded” tests, create logs in different time slots (or update an existing log) on the same date.

#### 1) Power limit

1. As Admin/Super Admin, set `daily_power_limit_kw = 10` for `CH-01` and save.
2. As Operator, create a chiller log on date \(D\) with `starter_energy_kwh = 9` (save ok).
3. Create another log for the same chiller on the same date \(D\) with `starter_energy_kwh = 5`.
4. Expected: second save fails with “Daily power limit (10 kWh) exceeded…”.

#### 2) Water limits (3 fields)

1. Set `daily_water_ct1_liters = 1000` (Cooling Tower 1 – Water limit) for `CH-01`.
2. Create log on date \(D\) with `daily_water_consumption_ct1_liters = 800` (ok).
3. Create another log on date \(D\) with `daily_water_consumption_ct1_liters = 300`.
4. Expected: second save fails with “Cooling tower 1 daily water consumption limit exceeded.”

Repeat similarly for:
- `daily_water_ct2_liters` ↔ `daily_water_consumption_ct2_liters`
- `daily_water_ct3_liters` ↔ `daily_water_consumption_ct3_liters`

---

## Dashboard – how it fetches and calculates (internal)

### Main summary cards API

Endpoint:
- `GET /api/reports/dashboard_summary/` (`LOG_BOOKS/backend/reports/dashboard_views.py`)

Key calculations:
- **Active Chillers**: count of active Equipment where category name is `chiller/chillers`
- **Pending Approvals**: count of pending/draft/pending_secondary_approval across log types
- **Approved Today**: count of `reports` rows approved today
- **Active Alerts**: overdue FilterSchedule count
- **Compliance Score**: `round(100 * approved_today / (approved_today + pending))` else null
- **Avg Pressure**: last 24h average of available pressure readings (chiller inlet + boiler steam + compressor pressure)
- **HVAC Validations**: pending HVAC validations count

### Chiller dashboard section

Endpoint:
- `GET /api/chiller-logs/dashboard_summary/?period_type=day|month|year&date=YYYY-MM-DD&equipment_id=...`

Inputs:
- Chiller logs + chiller limits + dashboard config (projected values)

Outputs:
- `actual_power_kwh`, `limit_power_kwh`, `utilization_pct`, projected values, and cost if configured.

---

## Reports export/print – “all fields” for Chiller/Boiler/Chemical/Filter Register

Where it happens:
- `LOG_BOOKS/frontend/src/pages/ReportsPage.tsx` (export/print actions)
- React-PDF templates:
  - `frontend/src/components/pdf/certificates/ChillerMonitoringCertificate.tsx`
  - `frontend/src/components/pdf/certificates/BoilerMonitoringCertificate.tsx`
  - `frontend/src/components/pdf/certificates/ChemicalMonitoringCertificate.tsx`

Behavior (current implementation):
- Page 1 keeps the old table format
- Extra pages include additional fields so no values are hidden
- Filter Register print/export now fetches full FilterMaster record and prints all fields (plus an “Additional Fields” section)

---

## Practical tester checklist (Chiller-focused)

### Admin/Super Admin checklist
- Can create Department, Category, Equipment
- Can set Chiller daily limits in Settings
- Can approve/reject chiller logs
- Can export/print full chiller monitoring PDF with all fields

### Supervisor checklist
- Can approve/reject chiller logs
- Can see dashboard + reports

### Operator checklist
- Can create chiller logs
- Cannot access Equipment Master or Settings
- Sees dashboard scheduled readings and can navigate to chiller entry quickly

### Client checklist
- Dashboard limited view
- Reports/trends view-only

