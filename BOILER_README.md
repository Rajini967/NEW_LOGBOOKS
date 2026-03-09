## Boiler module – tester guide (Settings + Log Book)

This file is for **testing all Boiler features**:
- Boiler **daily limits in Settings**
- **Boiler Log Book** form (all fields)
- How **daily limits** block boiler entries

Route summary:
- Boiler Log Book: `/e-log-book/boiler`
- Settings: `/settings` → **Boiler daily limits**

---

## 1. Settings – Boiler daily limits (Manager / Super Admin)

### 1.1 Fields (UI label → API field)

On the Settings page, in **Boiler daily limits**, each field maps to `BoilerEquipmentLimit`:

- **Daily power limit (kWh)** → `daily_power_limit_kw`
- **Daily water limit (L)** → `daily_water_limit_liters`
- **Daily chemical limit (kg)** → `daily_chemical_limit_kg`
- **Diesel limit (L)** → `daily_diesel_limit_liters`
- **Furnace oil limit (L)** → `daily_furnace_oil_limit_liters`
- **Brigade limit (kg)** → `daily_brigade_limit_kg`
- **Steam limit (kg/hr)** → `daily_steam_limit_kg_hr`
- **Electricity rate (Rs/kWh)** → `electricity_rate_rs_per_kwh`
- **Diesel rate (Rs/L)** → `diesel_rate_rs_per_liter`
- **Furnace oil rate (Rs/L)** → `furnace_oil_rate_rs_per_liter`
- **Brigade rate (Rs/kg)** → `brigade_rate_rs_per_kg`

**Blank = “No limit”** for that category.

### 1.2 Example: fill ALL limit fields for one boiler

For equipment `BL-001`, enter:

- `daily_power_limit_kw`: `500`
- `daily_water_limit_liters`: `8000`
- `daily_chemical_limit_kg`: `5`
- `daily_diesel_limit_liters`: `600`
- `daily_furnace_oil_limit_liters`: `400`
- `daily_brigade_limit_kg`: `200`
- `daily_steam_limit_kg_hr`: `9000`
- `electricity_rate_rs_per_kwh`: `9`
- `diesel_rate_rs_per_liter`: `95`
- `furnace_oil_rate_rs_per_liter`: `80`
- `brigade_rate_rs_per_kg`: `60`

Steps:
1. Login as **Manager/Super Admin**.
2. Open `/settings` → **Boiler daily limits**.
3. Select boiler `BL-001 – Boiler 1`.
4. Fill values above and click **Save limits**.
5. Hard refresh (**Ctrl+F5**), return to Settings, re‑select `BL-001`.
6. **Expected**: all fields still show the same numbers.

### 1.3 How boiler daily limits are enforced

Backend function: `LOG_BOOKS/backend/boiler_logs/views.py` → `_validate_boiler_daily_limits(...)`.

For each **equipment + date**, it sums these fields from `BoilerLog`:

- Power: `daily_power_consumption_kwh`
- Water: `daily_water_consumption_liters`
- Chemical: `daily_chemical_consumption_kg`
- Diesel: `daily_diesel_consumption_liters`
- Furnace oil: `daily_furnace_oil_consumption_liters`
- Brigade: `daily_brigade_consumption_kg`
- Steam: `steam_consumption_kg_hr`

If the total **existing logs + new log** exceeds the corresponding limit in `BoilerEquipmentLimit`, it returns errors such as:

- “Daily power limit (…) exceeded for this boiler.”
- “Daily diesel consumption limit exceeded for this boiler.”
- “Steam consumption limit exceeded for this boiler.”

The ViewSet calls `_validate_boiler_daily_limits` on **create**, **update**, and **correction**, so limits always apply.

### 1.4 Daily limits test matrix (works / doesn’t work)

Use **same equipment** and **same date**. Change only the daily fields being tested.

#### Power

1. In Settings for `BL-001`, set `daily_power_limit_kw = 10`.
2. Boiler entry #1: `daily_power_consumption_kwh = 8` → should **save**.
3. Boiler entry #2 (same date): `daily_power_consumption_kwh = 4`.
4. **Expected**: #2 fails with **Daily power limit (10 kWh) exceeded for this boiler.**

#### Diesel / Furnace oil / Brigade / Steam

Use the same pattern:

- Diesel:
  - Limit: `daily_diesel_limit_liters = 100`
  - Logs on same date: 60L then 50L → second log should fail.

- Furnace oil:
  - Limit: `daily_furnace_oil_limit_liters = 80`
  - Logs: 50L then 40L → second fails.

- Brigade:
  - Limit: `daily_brigade_limit_kg = 30`
  - Logs: 20kg then 15kg → second fails.

- Steam:
  - Limit: `daily_steam_limit_kg_hr = 5000`
  - Logs: 3000 then 2500 kg/hr → second fails.

#### Water / Chemical

- Water:
  - Limit: `daily_water_limit_liters = 5000`
  - Logs: 3000L then 2500L → second fails.

- Chemical:
  - Limit: `daily_chemical_limit_kg = 3`
  - Logs: 2kg then 1.5kg → second fails.

If you **clear** a limit field (blank) and save:
- That category becomes **unlimited**, and the backend will no longer block entries on that metric.

---

## 2. Boiler Log Book – ALL fields (with examples)

Boiler log data is stored in table **`boiler_logs`** (`BoilerLog` model).

### 2.1 Required vs optional (backend truth)

From `BoilerLog`:

- **Required numeric** (cannot be blank):
  - `feed_water_temp`
  - `oil_temp`
  - `steam_temp`
  - `steam_pressure`

- **Optional numeric / text** (blank allowed):
  - Hourly parameters:
    - `steam_flow_lph`
    - `fo_hsd_ng_day_tank_level`
    - `feed_water_tank_level`
    - `fo_pre_heater_temp`
    - `burner_oil_pressure`
    - `burner_heater_temp`
    - `boiler_steam_pressure`
    - `stack_temperature`
    - `steam_pressure_after_prv`
  - Shift parameters:
    - `feed_water_hardness_ppm`
    - `feed_water_tds_ppm`
    - `fo_hsd_ng_consumption`
    - `mobrey_functioning`
    - `manual_blowdown_time`
  - Fuel stock:
    - `diesel_stock_liters`, `diesel_cost_rupees`
    - `furnace_oil_stock_liters`, `furnace_oil_cost_rupees`
    - `brigade_stock_kg`, `brigade_cost_rupees`
  - Daily consumption:
    - `daily_power_consumption_kwh`
    - `daily_water_consumption_liters`
    - `daily_chemical_consumption_kg`
    - `daily_diesel_consumption_liters`
    - `daily_furnace_oil_consumption_liters`
    - `daily_brigade_consumption_kg`
    - `steam_consumption_kg_hr`
  - Remarks / list comment:
    - `remarks`
    - `comment` (edited from list view)

- **System fields (read‑only in API/UI)**:
  - `operator_id`, `operator_name`
  - `status`
  - `approved_by_id`, `approved_at`
  - `secondary_approved_by_id`, `secondary_approved_at`
  - `corrects_id`, `has_corrections`
  - `timestamp`, `created_at`, `updated_at`

### 2.2 Example – one full Boiler entry (Operator)

Goal: prove that every field is **editable, saved, and reloaded**.

1. Login as **Operator**.
2. Go to `E Log Book → Boiler → New Entry`.
3. Select `equipmentId = BL-001`.
4. Fill with these example values (modify as needed for your test):

**Required:**

- `feed_water_temp`: `65`
- `oil_temp`: `70`
- `steam_temp`: `180`
- `steam_pressure`: `7`

**Hourly parameters:**

- `steam_flow_lph`: `9500`
- `fo_hsd_ng_day_tank_level`: `450`
- `feed_water_tank_level`: `3.2`
- `fo_pre_heater_temp`: `66`
- `burner_oil_pressure`: `22`
- `burner_heater_temp`: `120`
- `boiler_steam_pressure`: `6`
- `stack_temperature`: `210`
- `steam_pressure_after_prv`: `5.5`

**Shift parameters:**

- `feed_water_hardness_ppm`: `3`
- `feed_water_tds_ppm`: `550`
- `fo_hsd_ng_consumption`: `140`
- `mobrey_functioning`: `Yes`
- `manual_blowdown_time`: `14:30`

**Fuel stock:**

- `diesel_stock_liters`: `900`
- `diesel_cost_rupees`: `85000`
- `furnace_oil_stock_liters`: `600`
- `furnace_oil_cost_rupees`: `48000`
- `brigade_stock_kg`: `250`
- `brigade_cost_rupees`: `30000`

**Daily consumption (for limits):**

- `daily_power_consumption_kwh`: `8`
- `daily_water_consumption_liters`: `3200`
- `daily_chemical_consumption_kg`: `1.5`
- `daily_diesel_consumption_liters`: `60`
- `daily_furnace_oil_consumption_liters`: `40`
- `daily_brigade_consumption_kg`: `10`
- `steam_consumption_kg_hr`: `4200`

**Remarks:**

- `remarks`: `Boiler running stable, within limits.`

5. Click **Save Entry**.
6. Verify:
   - Entry appears in Boiler Log Book list.
   - Status is `draft` or `pending`.

### 2.3 Persistence check

1. Open the saved entry via **Edit** (or **View Readings**).
2. Confirm all filled fields match the values you entered.
3. Especially validate:
   - Shift parameters (`feed_water_hardness_ppm`, `feed_water_tds_ppm`) not reset.
   - Daily consumption fields still populated.
   - Remarks text preserved.

### 2.4 Validation tests (required + numeric)

Backend applies `MinValueValidator(0)` to all numeric fields, and the UI enforces required numeric fields for:

- `feed_water_temp`, `oil_temp`, `steam_temp`, `steam_pressure`.

Test cases:

- Clear `feed_water_temp` and try to save → UI should block with “Please enter Feed water temp.”.
- Set `steam_pressure = -1` directly via API (if you have tools) → backend should reject with a 400 error.

---

## 3. Role behaviour (Boiler)

Same as Chiller:

- **Operator**:
  - Can create/update Boiler logs.
  - Cannot approve/reject.

- **Supervisor / Manager / Super Admin**:
  - Can approve/reject Boiler logs.
  - Settings (Boiler daily limits) only for Manager / Super Admin.

Boiler approvals create a row in centralized `reports` table with:

- `report_type = 'utility'`
- `source_table = 'boiler_logs'`
- `source_id = <boiler_log_id>`

You can view/print those from the **Reports** page (E Log Book type). 

