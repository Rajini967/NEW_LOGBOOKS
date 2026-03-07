# Log Books System - Comprehensive Codebase Analysis

---

## Quick reference (full codebase scan)

| Layer | Location | Purpose |
|-------|----------|--------|
| **Backend** | `LOG_BOOKS/backend/` | Django 4.2 REST API (PostgreSQL, JWT, DRF) |
| **Frontend** | `LOG_BOOKS/frontend/` | React 18 + TypeScript + Vite + shadcn/ui |
| **Config** | `backend/.env` | DB and app settings (see [Database](#28-database-configuration)) |
| **API base** | `frontend/src/lib/api.ts` | Axios client; base URL from `VITE_API_URL` or `http://103.168.18.24:8000/api` |

**Active Django apps (in `core/settings.py`):**  
`accounts`, `logbooks`, `sites`, `instruments`, `chemical_prep`, `chiller_logs`, `boiler_logs`, `filter_logs`, `compressor_logs`, `air_validation`, `test_certificates`, `reports`, `equipment`, `filter_master`.

**Note:** Chiller/boiler/compressor/filter logbooks are served by `chiller_logs`, `boiler_logs`, `compressor_logs`, and `filter_logs`. Equipment master data (departments, categories, equipment) is in `equipment`. Filter register and schedules are in `filter_master`.

**Known issue:** `makemigrations` / DB access can fail with  
`FATAL: password authentication failed for user "postgres"`.  
Fix: ensure PostgreSQL is running, `.env` has correct `DB_USER`/`DB_PASSWORD`/`DB_HOST`/`DB_PORT`, and that the Postgres user and DB exist and match (e.g. database `Log_Books` and user `postgres` with password from `.env`).

---

## Executive Summary

This is a **full-stack web application** for managing industrial logbooks, HVAC validation tests, utility monitoring (chillers, boilers, compressors), chemical preparations, and test certificates. The system implements role-based access control with a multi-tenant architecture supporting multiple clients and sites.

**Tech Stack:**
- **Backend:** Django 4.2.7 + Django REST Framework + PostgreSQL
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Authentication:** JWT (Simple JWT) with token blacklisting
- **PDF Generation:** @react-pdf/renderer (client-side)
- **Async/Background:** Celery + Redis (broker/result backend configured)
- **Email:** SMTP backend for password reset (configurable via .env)

---

## 1. Architecture Overview

### 1.1 Project Structure

```
Log_Books/
├── backend/          # Django REST API
│   ├── accounts/    # User management & authentication
│   ├── logbooks/    # Dynamic logbook schema system
│   ├── sites/       # Site/location management
│   ├── instruments/ # Instrument calibration tracking
│   ├── chemical_prep/      # Chemical preparation logs
│   ├── chiller_logs/       # Chiller monitoring
│   ├── boiler_logs/        # Boiler monitoring
│   ├── filter_logs/        # Filter log entries (install/integrity/cleaning/replacement)
│   ├── compressor_logs/    # Compressor monitoring
│   ├── air_validation/     # HVAC validation tests
│   ├── test_certificates/  # Test certificate management
│   ├── reports/            # Centralized reports + AuditEvent
│   ├── equipment/         # Departments, EquipmentCategory, Equipment master
│   ├── filter_master/      # FilterCategory, FilterMaster, FilterAssignment, FilterSchedule
│   └── core/               # Django settings & configuration
│
└── frontend/         # React SPA
    ├── src/
    │   ├── pages/    # Route pages
    │   ├── components/ # Reusable components
    │   ├── contexts/  # React contexts (Auth)
    │   ├── lib/      # Utilities & API client
    │   └── types/    # TypeScript definitions
```

### 1.2 Design Patterns

- **RESTful API:** Standard CRUD operations via DRF ViewSets
- **Role-Based Access Control (RBAC):** 5-tier permission system
- **Soft Delete:** Users can be soft-deleted (is_deleted flag)
- **Multi-tenant:** Client-based data isolation (client_id)
- **Workflow System:** Draft → Pending → Approved/Rejected workflow
- **PDF Generation:** Client-side PDF generation using React components

---

## 2. Backend Analysis

### 2.1 Authentication & Authorization

**User Model (`accounts/models.py`):**
- UUID-based primary keys
- Email-based authentication (no username)
- Custom user manager with soft-delete support
- 5 roles: Super Admin, Manager, Supervisor, Operator, Client

**Permission Classes (`accounts/permissions.py`):**
- `IsSuperAdmin` - Full system access
- `IsManager` - Can manage non-admin users
- `CanCreateUsers` - Super Admin & Manager only
- `CanManageUsers` - Hierarchical user management
- `CanApproveReports` - Super Admin, Manager, Supervisor
- `CanLogEntries` - Super Admin, Manager, Operator
- `CanViewReports` - All authenticated users (Clients see approved only)

**JWT Configuration:**
- Access token: 60 minutes
- Refresh token: 7 days
- Token rotation enabled
- Blacklist after rotation
- Custom token serializer for email authentication

### 2.2 Core Models

#### **User Model**
```python
- id: UUID (primary key)
- email: Unique, indexed
- name: Optional
- role: Enum (super_admin, manager, supervisor, operator, client)
- is_active, is_staff, is_superuser: Boolean flags
- is_deleted, deleted_at: Soft delete support
- created_at, updated_at: Timestamps
```

#### **Logbook Schema System**
**Purpose:** Dynamic logbook creation with role-based access

**Models:**
- `LogbookSchema`: Template definition (name, fields, workflow, display config)
- `LogbookRoleAssignment`: Maps roles to logbooks
- `LogbookEntry`: Individual logbook records with JSON data field

**Features:**
- JSON-based field definitions (flexible schema)
- Role-based access control per logbook
- Workflow configuration (approval process)
- Display configuration for UI rendering

#### **Site Model**
```python
- id: UUID
- name, location, address
- client_id: Multi-tenant identifier
- is_active: Boolean
```

#### **Instrument Model**
```python
- id: UUID
- name, make, model
- serial_number: Unique, indexed
- calibration_date, calibration_due_date
- certificate_url: Optional
- site_id: Optional foreign key
- status: Computed property (valid/expiring/expired)
```

### 2.3 Utility Logs

Three separate models for equipment monitoring:

#### **ChillerLog**
- Equipment ID, Site ID
- Temperature readings (supply, return, cooling tower)
- Pressure readings
- Water flow measurements
- Status workflow (draft/pending/approved/rejected)

#### **BoilerLog**
- Equipment ID, Site ID
- Temperature readings (feed water, oil, steam)
- Steam pressure & flow
- Status workflow

#### **CompressorLog**
- Equipment ID, Site ID
- Temperature readings (supply, return)
- Pressure & flow measurements
- Status workflow

#### **FilterLog** (`filter_logs`)
- Equipment ID, category, filter_no, micron, size, tag_info
- Dates: installed, integrity done/due, cleaning done/due, replacement due
- Operator, status workflow (draft → pending → approved/rejected, pending_secondary_approval)
- corrects FK for correction entries

**Common Pattern:**
- All logs have operator tracking (FK + name string)
- Approval workflow with remarks
- Timestamp tracking

### 2.4 Chemical Preparation

**Model:** `ChemicalPreparation`
- Equipment name, chemical name
- Concentration percentages
- Water & chemical quantities
- Checked by field
- Standard workflow (draft/pending/approved/rejected)

### 2.5 HVAC Validation

**Model:** `HVACValidation`
- Room name, ISO class (5/6/7/8)
- Room volume, grid readings (JSON array)
- Calculated metrics: average velocity, flow rate (CFM), ACH
- Design spec comparison
- Pass/Fail result
- Standard workflow

### 2.6 Equipment & Filter Master

**Equipment app:**
- `Department`: name, client_id (multi-tenant)
- `EquipmentCategory`: name, client_id
- `Equipment`: equipment_number (unique), name, capacity, department FK, category FK, site_id optional

**Filter Master app:**
- `FilterCategory`: name, client_id, description, micron_costs (JSON), is_active
- `FilterMaster`: category FK, make, model, serial_number, size_l/w/h, micron_size, certificate_file, status (draft/pending/approved/rejected/inactive), filter_id (assigned on approval)
- `FilterAssignment`: links filter to equipment/location
- `FilterSchedule`: schedule and approval workflow for filter tasks

### 2.7 Reports & Audit

**Report model:** Central store for all approved report types. Fields: report_type (utility, chemical, validation, filter_register, air_velocity, filter_integrity, recovery, differential_pressure, nvpc), source_id, source_table, title, site, created_by/at, approved_by/at, remarks.

**AuditEvent model:** Generic audit trail for limit updates, config updates, log updates/corrections, user lifecycle (created, password changed, locked/unlocked). Fields: user, event_type, object_type, object_id, field_name, old_value, new_value, extra (JSON).

### 2.8 Test Certificates

**Complex nested structure** with separate tables for each test type:

#### **Air Velocity Test**
- Main table: `AirVelocityTest` (certificate metadata)
- Sub-tables:
  - `AirVelocityRoom` (room-level data)
  - `AirVelocityFilter` (filter-level readings)

#### **Filter Integrity Test**
- Main: `FilterIntegrityTest`
- Sub-tables:
  - `FilterIntegrityRoom`
  - `FilterIntegrityReading` (upstream/downstream concentrations)

#### **Recovery Test**
- Main: `RecoveryTest`
- Sub-table: `RecoveryDataPoint` (time-series particle counts)

#### **Differential Pressure Test**
- Main: `DifferentialPressureTest`
- Sub-table: `DifferentialPressureReading` (room-to-room pressure)

#### **NVPC Test (Non-Viable Particle Count)**
- Main: `NVPCTest`
- Sub-tables:
  - `NVPCRoom` (room-level aggregates)
  - `NVPCSamplingPoint` (point-level readings with JSON arrays)

**Common Features:**
- Certificate number (unique, indexed)
- Client information (name, address)
- Instrument details (full calibration tracking)
- Approval workflow
- Prepared by / Approved by tracking

### 2.9 API Endpoints

**Authentication:**
- `POST /api/auth/login/` - JWT login
- `POST /api/auth/refresh/` - Token refresh
- `POST /api/auth/logout/` - Token blacklist

**User Management:**
- `GET /api/users/` - List users (role-filtered)
- `GET /api/users/me/` - Current user
- `POST /api/users/` - Create user (Manager+)
- `PUT /api/users/{id}/` - Update user
- `DELETE /api/users/{id}/` - Soft delete

**Logbooks:**
- `GET /api/logbooks/schemas/` - List schemas (role-filtered)
- `POST /api/logbooks/schemas/` - Create schema (Manager+)
- `POST /api/logbooks/schemas/{id}/assign_roles/` - Assign roles
- `GET /api/logbooks/entries/` - List entries
- `POST /api/logbooks/entries/` - Create entry

**Utility Logs:**
- Standard CRUD for chiller-logs, boiler-logs, compressor-logs, filter-logs (via `filter_logs` app)
- `POST /api/{type}-logs/{id}/approve/` - Approval action (and secondary approval where applicable)

**Equipment & Filter Master:**
- `api/` includes equipment URLs (departments, categories, equipment) and filter_master URLs (categories, filters, assignments, schedules)

**Test Certificates:**
- Separate endpoints for each test type:
  - `/api/air-velocity-tests/`
  - `/api/filter-integrity-tests/`
  - `/api/recovery-tests/`
  - `/api/differential-pressure-tests/`
  - `/api/nvpc-tests/`

### 2.10 Database Configuration

- **Engine:** PostgreSQL
- **Connection:** Environment variables (python-decouple)
- **Migrations:** Django migrations in each app
- **UUID Primary Keys:** All models use UUID4

---

## 3. Frontend Analysis

### 3.1 Technology Stack

- **Framework:** React 18.3.1 with TypeScript
- **Build Tool:** Vite 5.4.19
- **Routing:** React Router DOM 6.30.1
- **State Management:** React Context (AuthContext)
- **Data Fetching:** TanStack Query 5.83.0
- **HTTP Client:** Axios 1.13.2
- **UI Library:** shadcn/ui (Radix UI components)
- **Styling:** Tailwind CSS 3.4.17
- **Forms:** React Hook Form 7.61.1 + Zod 3.25.76
- **PDF:** @react-pdf/renderer 4.3.2
- **Icons:** Lucide React
- **Notifications:** Sonner

### 3.2 Application Structure

#### **Routing (`App.tsx`)**
```
/login, /forgot-password, /reset-password
/change-password          - Change password (under dashboard)
/dashboard                - Main dashboard
/e-log-book               - E-logbook landing
/e-log-book/chiller       - Chiller log entries
/e-log-book/boiler        - Boiler log entries
/e-log-book/chemical      - Chemical landing (Manager+), else redirect to entry
/e-log-book/chemical/entry, /stock, /assignment
/e-log-book/filter         - Filter landing (Manager+), else redirect to entry
/e-log-book/filter/entry   - Filter log entries
/e-log-book/filter/settings, /settings/categories, /settings/register, /settings/schedules
/hvac-validation          - HVAC validation overview
/hvac-validation/air-velocity-test, filter-integrity-test, recovery-test, differential-pressure-test, nvpc-test
/instruments              - Instrument management
/equipment                - Equipment master landing
/equipment/departments, /equipment/categories, /equipment/list
/reports                  - Reports & approvals
/logbook-builder          - Create logbook schemas (Manager+)
/users                    - User management (Manager+)
/settings                 - Settings page
```

#### **Authentication (`AuthContext.tsx`)**
- JWT token storage (localStorage)
- Auto token refresh on 401
- Role mapping (backend 'client' → frontend 'customer')
- Protected routes via `DashboardLayout`

#### **API Client (`lib/api.ts`)**
- Axios instance with interceptors
- Automatic token injection
- Token refresh on 401
- Centralized error handling
- Separate API modules:
  - `authAPI`, `userAPI`, `logbookAPI`
  - `siteAPI`, `instrumentAPI`
  - `chemicalPrepAPI`
  - `chillerLogAPI`, `boilerLogAPI`, `compressorLogAPI`
  - `hvacValidationAPI`
  - `testCertificateAPI` (with sub-modules)

### 3.3 Key Pages

#### **DashboardPage**
- Metric cards (chillers, pressure, log entries, validations)
- Recent activity feed
- Consumption charts
- Equipment status
- Quick actions for operators

#### **ELogBookPage**
- Dynamic logbook entry form (based on schema)
- Entry listing with filters
- Status workflow management
- PDF export capability

#### **HVACValidationPage**
- Overview of HVAC validations
- Filter by status, date, room
- Create/edit/approve validations
- Links to detailed test pages

#### **Test Certificate Pages**
Each test type has dedicated page:
- **AirVelocityTestPage:** Room & filter management
- **FilterIntegrityTestPage:** Room & reading management
- **RecoveryTestPage:** Time-series data entry
- **DifferentialPressureTestPage:** Room-to-room pressure
- **NVPCTestPage:** Room & sampling point management

**Common Features:**
- Certificate number generation
- Client information form
- Instrument selection/entry
- Nested data entry (rooms → filters/readings)
- PDF generation & download
- Approval workflow

#### **InstrumentsPage**
- Instrument CRUD
- Calibration tracking
- Status indicators (valid/expiring/expired)
- Certificate URL management

#### **ReportsPage**
- Unified report listing
- Filter by type, status, date
- View/Approve/Reject actions
- PDF export for all report types
- Approval remarks

#### **LogbookBuilderPage**
- Schema creation (Manager+)
- Field definition (JSON editor)
- Role assignment
- Workflow configuration

#### **UsersPage**
- User listing (role-filtered)
- Create/Edit/Delete users
- Role assignment
- Soft delete support

### 3.4 PDF Generation

**Location:** `lib/pdf-generator.tsx`

**PDF Components:**
- `AirVelocityCertificate`
- `FilterIntegrityCertificate`
- `RecoveryTestCertificate`
- `DifferentialPressureCertificate`
- `NVPCCertificate`
- `ChillerMonitoringCertificate`
- `BoilerMonitoringCertificate`
- `ChemicalMonitoringCertificate`

**Process:**
1. React component renders PDF structure
2. `@react-pdf/renderer` converts to Blob
3. Browser downloads PDF file

**Features:**
- Professional certificate layouts
- Tables for data presentation
- Headers & footers
- Client branding support

### 3.5 Component Library

**UI Components (shadcn/ui):**
- Button, Input, Label, Textarea
- Select, Checkbox, Radio Group
- Dialog, Alert Dialog
- Badge, Card, Tabs
- Table, Scroll Area
- Toast notifications
- Tooltip, Popover
- Date Picker
- And more...

**Custom Components:**
- `DashboardLayout` - Main layout with sidebar
- `Header` - Page header component
- `NavLink` - Navigation link component
- PDF certificate components
- Dashboard widgets (MetricCard, RecentActivity, etc.)

### 3.6 Type Definitions

**Location:** `src/types/`

- `index.ts` - Core types (User, Site, Instrument, etc.)
- `test-certificates.ts` - Test certificate data structures
- Additional type files as needed

---

## 4. Security Analysis

### 4.1 Authentication
- ✅ JWT with secure token storage
- ✅ Token refresh mechanism
- ✅ Token blacklisting on logout
- ✅ Email-based authentication (no username)
- ⚠️ Tokens stored in localStorage (XSS risk)

### 4.2 Authorization
- ✅ Role-based permissions
- ✅ Hierarchical access control
- ✅ Object-level permissions
- ✅ Soft delete prevents data loss
- ✅ Self-deletion prevention

### 4.3 Data Protection
- ✅ UUID primary keys (no enumeration)
- ✅ Multi-tenant isolation (client_id)
- ✅ Soft delete for audit trail
- ✅ Approval workflow prevents unauthorized changes

### 4.4 Recommendations
- Consider httpOnly cookies for token storage
- Implement CSRF protection for state-changing operations
- Add rate limiting for authentication endpoints
- Implement audit logging for sensitive operations

---

## 5. Data Flow

### 5.1 User Login Flow
1. User submits email/password
2. Backend validates credentials
3. JWT tokens returned (access + refresh)
4. Tokens stored in localStorage
5. User data fetched via `/users/me/`
6. AuthContext updated
7. Redirect to dashboard

### 5.2 Log Entry Creation Flow
1. User selects logbook schema
2. Dynamic form rendered from schema.fields
3. User fills form data
4. POST to `/api/logbooks/entries/`
5. Backend creates entry with operator tracking
6. Status set to 'draft'
7. User can submit for approval (status → 'pending')
8. Supervisor/Manager approves (status → 'approved')

### 5.3 Approval Workflow
1. Entry created with status 'draft'
2. Operator submits (status → 'pending')
3. Approver views in Reports page
4. Approver approves/rejects with remarks
5. Backend updates entry (status, approved_by, approved_at)
6. Entry visible to clients (if approved)

### 5.4 PDF Generation Flow
1. User clicks "Generate PDF" on report
2. Frontend fetches full report data
3. React PDF component renders
4. `@react-pdf/renderer` converts to Blob
5. Browser downloads PDF file
6. No server-side PDF generation

---

## 6. Key Features

### 6.1 Dynamic Logbook System
- **Flexible Schema:** JSON-based field definitions
- **Role-Based Access:** Assign logbooks to specific roles
- **Workflow Configuration:** Customizable approval process
- **Display Configuration:** UI rendering hints

### 6.2 Multi-Tenant Support
- Client-based data isolation
- Site management per client
- User roles per tenant

### 6.3 Comprehensive Test Certificates
- 5 different test types
- Nested data structures (rooms → filters/readings)
- Certificate number generation
- Professional PDF output

### 6.4 Instrument Calibration Tracking
- Calibration date tracking
- Due date monitoring
- Status calculation (valid/expiring/expired)
- Certificate URL storage

### 6.5 Approval Workflow
- Draft → Pending → Approved/Rejected
- Remarks support
- Approval tracking (who, when)
- Role-based approval permissions

---

## 7. Code Quality Observations

### 7.1 Strengths
- ✅ Clean separation of concerns
- ✅ Consistent naming conventions
- ✅ TypeScript for type safety
- ✅ DRF ViewSets for consistent API
- ✅ Reusable permission classes
- ✅ Soft delete pattern
- ✅ UUID primary keys
- ✅ Comprehensive error handling

### 7.2 Areas for Improvement

**Backend:**
- Add pagination to all list endpoints (some may be missing)
- Implement filtering/searching on list views
- Add validation for JSON fields in logbook schemas
- Consider adding database indexes on frequently queried fields
- Add unit tests (test files exist but may be empty)

**Frontend:**
- Consider state management library (Redux/Zustand) for complex state
- Add loading states for all async operations
- Implement error boundaries
- Add form validation feedback
- Consider code splitting for large pages
- Add E2E tests

**Security:**
- Move JWT tokens to httpOnly cookies
- Add CSRF protection
- Implement rate limiting
- Add input sanitization
- Add audit logging

**Performance:**
- Implement API response caching
- Add database query optimization
- Consider pagination for large lists
- Optimize PDF generation (may be slow for large datasets)

---

## 8. Dependencies

### Backend
```
Django==4.2.7
djangorestframework==3.14.0
djangorestframework-simplejwt==5.3.0
drf-spectacular==0.26.5
psycopg2-binary==2.9.9
python-decouple==3.8
django-cors-headers==4.3.1
celery==5.3.6
redis==5.0.1
```

### Frontend
```
react, react-dom: ^18.3.1
typescript: ^5.8.3
vite: ^5.4.19
@tanstack/react-query: ^5.83.0
axios: ^1.13.2
react-router-dom: ^6.30.1
@react-pdf/renderer: ^4.3.2
react-hook-form: ^7.61.1
zod: ^3.25.76
tailwindcss: ^3.4.17
lucide-react: ^0.462.0
```

---

## 9. Deployment Considerations

### 9.1 Environment Variables

**Backend (.env):**
```
SECRET_KEY
DEBUG
ALLOWED_HOSTS
DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
CELERY_BROKER_URL, CELERY_RESULT_BACKEND  (default: redis://localhost:6379/0)
EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
EMAIL_USE_TLS, EMAIL_USE_SSL, DEFAULT_FROM_EMAIL
FRONTEND_BASE_URL  (for password reset links)
```

**Frontend (.env):**
```
VITE_API_URL
```

### 9.2 Database
- PostgreSQL required
- Run migrations: `python manage.py migrate`
- Create superuser: `python manage.py createsuperuser`

### 9.3 Static Files
- Django static files configuration needed
- Frontend build output should be served separately or via Django

### 9.4 CORS
- Configured for localhost development
- Update `CORS_ALLOWED_ORIGINS` for production

---

## 10. Testing Status

- Test files exist in backend apps (`tests.py`)
- Frontend testing setup not visible
- No E2E tests observed
- **Recommendation:** Implement comprehensive test suite

---

## 11. Documentation Status

- ✅ Code comments present
- ✅ Type definitions in TypeScript
- ✅ Model docstrings in Django
- ⚠️ No API documentation (consider drf-spectacular/Swagger)
- ⚠️ No user documentation

---

## 12. Conclusion

This is a **well-structured, feature-rich industrial logbook management system** with:

- **Strong architecture:** Clean separation, RESTful API, modern frontend
- **Comprehensive features:** Multiple log types, test certificates, approval workflows
- **Security considerations:** RBAC, JWT, soft delete, approval workflows
- **Scalability:** Multi-tenant support, UUID keys, flexible schema system

**Recommended Next Steps:**
1. Add comprehensive test coverage
2. Implement API documentation (Swagger/OpenAPI)
3. Enhance security (httpOnly cookies, rate limiting)
4. Add performance optimizations (caching, pagination)
5. Create user documentation
6. Set up CI/CD pipeline
7. Add monitoring and logging


