# MyCampus API — Authentication & Planner

Express + Mongoose implementation of the MyCampus backend for the Flutter
client in [`../flutter_app`](../flutter_app). Covers FR-AUTH, FR-NAV, FR-SUB,
FR-TASK, FR-CAL, FR-CLASS, FR-ASG and FR-REM.

> **SRS deviations** (agreed for this build):
> 1. The SRS baseline specifies Supabase Auth + PostgreSQL + RLS. This service
>    is Express + Mongoose and enforces the same authorization rules in the
>    controllers instead.
> 2. The SRS requires atomic membership + audit writes (FR-CLASS-009). The dev
>    MongoDB is standalone (no replica set), so multi-document transactions are
>    unavailable; membership state and its `MembershipEvent` are written
>    sequentially. Run a replica set before production.
> 3. Local persistence is SharedPreferences on the client rather than
>    Drift/SQLCipher. The API contracts already carry tombstones, revisions and
>    conflict codes so a Drift client can replace it.

## Quick start

```powershell
cd server
npm install
copy .env.example .env      # adjust JWT_SECRET
docker compose up -d mongo  # or use a local MongoDB on :27017
npm start                   # http://localhost:4000
```

The project is **ES modules** (`"type": "module"`). Relative imports include the
`.js` extension, single-value modules use default exports, and env loading uses
`import 'dotenv/config'`.

Health check: `GET /health` and `GET /api/health`.

### Tests

Start MongoDB and the API first; the scripts create their own accounts.

```powershell
node scripts/smoke-test.mjs    # 24 auth assertions
node scripts/modules-smoke.mjs # 108 planner assertions
```

## Endpoints

All routes below are under `/api` and require `Authorization: Bearer <jwt>`
unless marked public.

### Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account with immutable `student`/`teacher` role — FR-AUTH-001/002/003 |
| POST | `/auth/verify-email` | Verify code, receive JWT — FR-AUTH-001/006 |
| POST | `/auth/resend-verification` | Re-issue verification code |
| POST | `/auth/login` | Sign in; 403 `EMAIL_NOT_VERIFIED` before verification — FR-AUTH-004 |
| GET | `/auth/me` | Revalidate session/role/profile — FR-AUTH-009 |
| PATCH | `/auth/profile` | Update full name, academic timezone, `timeFormat` — FR-AUTH-007/FR-CAL-004 |
| POST | `/auth/forgot-password` | Issue reset code — FR-AUTH-005 |
| POST | `/auth/reset-password` | Set new password — FR-AUTH-005 |
| POST | `/auth/logout` | 204; the client discards the token — FR-AUTH-010 |

### Planner

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/subjects` | List/create personal subjects — FR-SUB-001 |
| GET/PATCH | `/subjects/:id` | Read/update one subject — FR-SUB-002/003 |
| GET | `/subjects/:id/impact` | Deletion impact counts — FR-SUB-004 |
| DELETE | `/subjects/:id?confirm=true` | Soft delete; tasks move to General, timetable entries are removed |
| GET/POST | `/tasks` | List/create tasks; filters `status`, `subject`, `priority`, `q`, sort — FR-TASK |
| PATCH/DELETE | `/tasks/:id` | Update/completion toggle or soft delete |
| GET/POST | `/events` | List (optionally `from`/`to`) and create academic events — FR-CAL-002/003 |
| PATCH/DELETE | `/events/:id` | Update/soft delete an event |
| GET/POST | `/timetable` | List (optionally `weekday`) and create weekly entries — FR-CAL-005/006 |
| PATCH/DELETE | `/timetable/:id` | Update/soft delete an entry; overlaps return warnings, not errors |
| GET | `/classrooms` | Classrooms the caller owns or actively belongs to |
| POST | `/classrooms` | Teacher-only creation; join code + frozen timezone — FR-CLASS-001/010 |
| POST | `/classrooms/join` | Student joins by case-insensitive code |
| GET | `/classrooms/:id` | Detail (member-scoped) |
| PATCH | `/classrooms/:id` | Teacher updates name/subject/description |
| POST | `/classrooms/:id/archive` | Teacher archives (joins rejected) |
| POST | `/classrooms/:id/reset-code` | Teacher rotates the join code |
| POST | `/classrooms/:id/leave` | Student leaves voluntarily |
| GET | `/classrooms/:id/members` | Teacher-only member list |
| DELETE | `/classrooms/:id/members/:memberId` | Teacher removes + blocks rejoin |
| POST | `/classrooms/:id/members/:memberId/unblock` | Teacher clears the rejoin block |
| GET | `/classrooms/:id/events` | Membership audit trail (teacher) |
| GET/POST | `/assignments` | Role-aware list; teacher authoring (draft by default) — FR-ASG-001/002 |
| GET/PATCH | `/assignments/:id` | Read/update; teacher edits never reset progress — FR-ASG-006 |
| POST | `/assignments/:id/publish` · `/archive` | Status transitions |
| DELETE | `/assignments/:id?confirm=true` | Soft delete with confirmation — FR-ASG-007 |
| PATCH | `/assignments/:id/progress` | Student-only completion; optional `baseRevision` |
| GET | `/dashboard` | Home payload with role-specific sections — FR-NAV-003/005 |
| GET | `/dashboard/schedule?date=YYYY-MM-DD` | Full-day drilldown — FR-NAV-004 |
| GET | `/reminders` | Due Soon / Overdue / Upcoming buckets — FR-REM-002/004 |

Errors are JSON: `{ "code": "…", "message": "…", "fields": {…} }`.
Rate limits: 60 auth attempts / 10 min, 20 email sends / 15 min.

## Data model

| Model | Notes |
|---|---|
| `User` | `role` immutable, `emailVerified`, hashed codes, `academicTimezone`, `timeFormat` (`12h` default / `24h`) |
| `Subject` | Owner-scoped, `code` uppercased, unique per owner while not deleted (`partialFilterExpression`) |
| `Task` | `subject` nullable (General Tasks), `pending`/`completed`, priority, optional `dueDate`/`dueTime`, soft delete |
| `AcademicEvent` | Wall-clock `date` + optional `startTime`/`endTime`, reminder offset in minutes |
| `TimetableEntry` | Weekday 1–7, `startTime`/`endTime`, optional room; overlap warnings |
| `Classroom` | Join code, `academicTimezone` `immutable`, archived flag |
| `ClassroomMember` | `active`/`left`/`removed`, `rejoinBlocked` |
| `MembershipEvent` | Append-only audit: join/leave/remove/unblock/reset-code |
| `Assignment` | `draft`/`published`/`archived`, soft delete |
| `AssignmentProgress` | Unique `{assignment, student}`, `revision`; never returned to teachers |

`toJSON` plugins strip hashes/secrets and expose `id` instead of `_id`.

### Key behaviors

- **Wall-clock preservation (FR-PROFILE-003):** personal dates are stored as
  `YYYY-MM-DD` and times as `HH:mm`. UTC deadline instants are derived with
  `Intl` in the owner's academic timezone, so changing timezone does not shift
  the stored wall-clock values.
- **Tombstones:** every user-owned record has `deletedAt`; deletes are soft and
  hidden from lists.
- **Subject deletion:** without `?confirm=true` the API returns
  `409 IMPACT_CONFIRMATION_REQUIRED` plus counts; after confirmation tasks keep
  a `null` subject and timetable entries for that subject are removed.
- **Progress privacy (FR-ASG-005):** teacher payloads never include
  `completed`, `progressRevision` or any aggregate completion data. Student
  updates accept an optional `baseRevision`; stale writes get
  `409 STALE_PROGRESS`.
- **Classroom timezone (FR-CLASS-010):** captured from the creating teacher and
  marked `immutable` in the schema.
- **Join codes:** 6 characters from an unambiguous alphabet, unique index and
  retry on collision; comparison is case-insensitive.
- **Reminders:** events resolve deadlines from `date` + `startTime`, tasks and
  assignments from `dueDate` + `dueTime`. Date-only deadlines resolve to
  end-of-day in the academic timezone. Windows has no guaranteed notification
  delivery, so the API powers the in-app Reminder Center (FR-REM-005).

## Environment

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/mycampus` | |
| `JWT_SECRET` | dev fallback | required in production |
| `JWT_EXPIRES_IN` | `7d` | |
| `CORS_ORIGIN` | `*` | comma-separated origins in production |
| `EXPOSE_DEV_CODES` | `true` | returns `devCode` + logs email; forced off when `NODE_ENV=production` |
| `DEFAULT_ACADEMIC_TIMEZONE` | `Asia/Yangon` | |

**Email:** no provider is configured, so verification/reset messages are logged
to the server console (`src/services/email.service.js`). Wire Nodemailer/SES
there when available.

## Structure

```
src/
├── config/        # env + Mongo connection
├── controllers/   # auth, subjects, tasks, events, timetable, classrooms,
│                  # assignments, dashboard, reminders
├── middlewares/   # JWT auth + role guard, Zod validation, error handling
├── models/        # 10 Mongoose models + toJSON plugin
├── routes/        # one router per module, mounted in app.js
├── services/      # email.service.js (console transport)
├── utils/         # dates (Intl wall-clock math), join codes, jwt, errors
├── validators/    # Zod schemas
├── app.js
└── server.js
scripts/
├── smoke-test.mjs   # 24 auth assertions
└── modules-smoke.mjs # 108 planner assertions
```

## Security notes

- Roles are never accepted by update endpoints; Mongo enforces `immutable`.
- Personal reads/writes are filtered by `owner`/`student`; classroom routes
  check active membership or teacher ownership.
- Student progress is stored separately from assignments so teacher queries
  cannot select it accidentally.
- Codes are hashed with HMAC-SHA256 and compared with `timingSafeEqual`; they
  expire after 15 minutes.
- Generic responses prevent account enumeration on resend/forgot-password.
- Add HTTPS termination and a strong `JWT_SECRET` before any non-local
  deployment.
