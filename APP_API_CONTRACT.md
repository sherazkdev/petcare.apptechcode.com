# Pet Care Reminder API — Mobile App Contract

**Audience:** Flutter / mobile developers integrating with this backend.  
**Source of truth:** Current backend source code (not legacy requirement docs).  
**Last verified against:** repository `src/` API routes, validation, services, and models.

---

## 1. Overview

### Architecture

```text
Flutter App
  → Firebase Auth (when server requires Bearer token)
  → Device registration (FCM token + platform)
  → Reminder create / update / delete / complete
  → MongoDB (devices + reminders)
  → In-process scheduler (setTimeout + 30s poller)
  → Firebase Admin (FCM)
  → Mobile push notification
```

### Division of responsibility

| Layer | Responsibility |
|--------|----------------|
| **Flutter app** | Reminder list UI, local persistence (e.g. Hive), generating stable `X-Device-Id`, Firebase sign-in when required, FCM token lifecycle, encoding `remindAt` with correct UTC offset, calling API on add/edit/delete/complete |
| **Backend** | Store FCM token per device, persist reminder schedule metadata, fire one push at the scheduled instant, update reminder/device status after send |

### Reminder list / UI source of truth

- **There is no `GET /api/v1/reminders` or `GET /api/v1/reminders/:id` in the current backend.**
- The app must treat **local storage (e.g. Hive) as the source of truth** for listing and displaying reminders.
- The backend is **push-scheduling only**: it does not serve reminder lists or sync full reminder documents back to the client (create/update responses return a minimal shape only).

---

## 2. Base API Information

| Item | Value |
|------|--------|
| **API version** | `v1` (path prefix `/api/v1/`) |
| **Production base URL** | `https://petcare.apptechcode.com` (from `src/shared/http/openapi.ts` and `nginx/petcare.apptechcode.com.conf`) |
| **Local base URL** | `http://localhost:3018` (OpenAPI servers entry; PM2/nginx may use port `3018`) |
| **Content-Type** | `application/json` for requests with a JSON body |
| **Request format** | JSON object in body where documented |
| **Success error envelope** | N/A |
| **Error envelope** | `{ "error": { "code": "<CODE>", "message": "<text>" } }` |

```http
Content-Type: application/json
```

**OpenAPI JSON (developer tooling, not required for the app):** `GET /api/v1/openapi` — returns the machine-readable spec; no auth in code.

There are **no** dedicated health or readiness endpoints in the current codebase.

---

## 3. Authentication Requirements

Authentication is implemented in `requireDeviceContext()` (`src/shared/http/device-context.ts`). There is **no** Next.js `middleware.ts`; each route calls this helper directly.

### Environment variables (server-side)

| Variable | Meaning when `true` / `1` |
|----------|---------------------------|
| `FIREBASE_ID_TOKEN_REQUIRED` | When no valid `Authorization: Bearer` token, request fails (unless legacy escape hatch below). |
| `ALLOW_LEGACY_API_KEY` | When Firebase token is required but missing, allow `X-Api-Key` instead (only if `X_API_KEY` env is set on server). |
| `X_API_KEY` | If set on server, legacy key checks compare `x-api-key` header to this value. If **unset**, legacy key check is a **no-op**. |

**Default in `.env.example` (local):** `FIREBASE_ID_TOKEN_REQUIRED=false`, `ALLOW_LEGACY_API_KEY=false`, `X_API_KEY=` (empty).

**Recommended production (`deploy/SETUP.md`):** `FIREBASE_ID_TOKEN_REQUIRED=true`, `ALLOW_LEGACY_API_KEY=false`, Firebase Admin credentials configured.

### Firebase ID token

- Header: `Authorization: Bearer <Firebase ID token>`
- Verified with Firebase Admin `verifyIdToken()` (`src/shared/firebase/admin.ts`).
- On success, `firebaseUid` is available inside `requireDeviceContext()` but **is not passed to route handlers or stored in MongoDB** (see §15).

**Missing Bearer when Firebase is required:** `401` — code `INVALID_AUTH_TOKEN`, message *"Authorization Bearer Firebase ID token is required"* (unless `ALLOW_LEGACY_API_KEY` allows legacy key).

**Invalid or expired Bearer:** `401` — code `INVALID_AUTH_TOKEN`, message *"Invalid or expired Firebase ID token"* (no fallback to API key when Bearer is present but invalid).

### `X-Api-Key` (legacy)

- Still supported in code when the auth matrix allows it.
- Wrong/missing key when check applies: `401` — code `MISSING_DEVICE_ID`, message *"Invalid or missing X-Api-Key"*.

### Production request headers (recommended)

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
X-Device-Id: <DEVICE_UUID>
Content-Type: application/json
```

When `FIREBASE_ID_TOKEN_REQUIRED=false` and `X_API_KEY` is empty on the server, **Bearer is optional in code** — only `X-Device-Id` is strictly required. **Do not rely on this in production;** configure Firebase as required on the server.

### Environment / Auth Matrix

Logic from `assertFirebaseAuth()` + `assertLegacyApiKey()`. “API key check” means `X_API_KEY` is set on the server and header must match.

| FIREBASE_ID_TOKEN_REQUIRED | ALLOW_LEGACY_API_KEY | Bearer token | X-Api-Key | Result |
|---------------------------|----------------------|--------------|-----------|--------|
| any | any | Valid | any | **Allowed**; `firebaseUid` set |
| any | any | Invalid | any | **401** `INVALID_AUTH_TOKEN` |
| `true` | `false` | Absent | any | **401** Bearer required |
| `true` | `true` | Absent | Matches (if `X_API_KEY` set) | **Allowed**; no `firebaseUid` |
| `true` | `true` | Absent | Missing/wrong (if `X_API_KEY` set) | **401** invalid API key |
| `true` | `true` | Absent | any (if `X_API_KEY` **not** set) | **Allowed** (legacy check no-op) |
| `false` | any | Absent | Matches (if `X_API_KEY` set) | **Allowed** |
| `false` | any | Absent | Missing/wrong (if `X_API_KEY` set) | **401** invalid API key |
| `false` | any | Absent | any (if `X_API_KEY` **not** set) | **Allowed** (no Bearer required) |

All successful paths still require a valid **`X-Device-Id`** header (see §4).

---

## 4. Device Identity

### Header: `X-Device-Id`

| Rule | Detail |
|------|--------|
| **Location** | HTTP header only (not in JSON body for device or reminder routes) |
| **Required** | Yes, on every mobile-facing endpoint |
| **Format** | UUID (RFC-style regex in code: version nibble `1–8`, variant `8/9/a/b`) |
| **Missing** | `401` — `MISSING_DEVICE_ID`, *"X-Device-Id is required"* |
| **Invalid format** | `400` — `VALIDATION_ERROR`, *"X-Device-Id must be a UUID"* |

### App-side requirements (not enforced by persistence on server)

| Topic | Guidance |
|--------|----------|
| **Who generates it** | Flutter app (first install / first launch) |
| **Persistence** | Same value for the lifetime of that app installation (e.g. secure storage / SharedPreferences / Hive) |
| **Per request** | **Do not** generate a new UUID for every API call |
| **After restart** | Send the same stored UUID |

The backend upserts devices and reminders by this string but does **not** verify that the same physical phone always sends the same id; consistency is an **app responsibility**.

---

## 5. Firebase / FCM Tokens

These are **different** tokens.

### Firebase Auth ID token

- **Purpose:** API authentication (when server requires it).
- **Header:**

```http
Authorization: Bearer <Firebase ID Token>
```

- Obtain from Firebase Auth on the client (e.g. `getIdToken()`). Refresh when you receive `401` `INVALID_AUTH_TOKEN`.

### FCM registration token

- **Purpose:** Push delivery address for this device.
- **Body field** on `POST /api/v1/devices/fcm-token`:

```json
{
  "fcmToken": "<FCM registration token from Firebase Messaging>",
  "platform": "android"
}
```

### When to call `POST /api/v1/devices/fcm-token`

- App startup (after you have a device id and FCM token).
- Whenever FCM issues a new token (`onTokenRefresh` / equivalent).
- After user grants notification permission if token was unavailable before.

Use the **same** `X-Device-Id`; backend **replaces** `fcmToken` on each successful upsert.

---

## 6. Complete Endpoint List

| Method | Endpoint | Purpose | Auth | Device ID | Request body | Success |
|--------|----------|---------|------|-----------|--------------|---------|
| `POST` | `/api/v1/devices/fcm-token` | Register or replace FCM token | `requireDeviceContext` | Header `X-Device-Id` | `fcmToken`, `platform` | `200` `{ "ok": true, "deviceId": "..." }` |
| `POST` | `/api/v1/reminders` | Create reminder + schedule push | Same | Same | See §8 | `201` or idempotent `200` |
| `PUT` | `/api/v1/reminders/:id` | Update reminder + reschedule | Same | Same | See §11 | `200` |
| `DELETE` | `/api/v1/reminders/:id` | Cancel reminder + cancel timer | Same | Same | None | `204` no body |
| `POST` | `/api/v1/reminders/:id/complete` | Mark completed + cancel timer | Same | Same | None | `200` `{ "id", "status": "completed" }` |
| `GET` | `/api/v1/openapi` | OpenAPI JSON (tooling) | None in code | No | None | `200` JSON spec |

**Verified absent (do not implement client calls):**

- `GET /api/v1/reminders`
- `GET /api/v1/reminders/:id`

> There is currently no reminder list/read API.

---

## 7. POST /api/v1/devices/fcm-token

### Headers

```http
Authorization: Bearer <Firebase-ID-Token>   (when required by server env)
X-Device-Id: <UUID>
Content-Type: application/json
```

`X-Api-Key` only when legacy auth path applies (§3).

### Request body

```json
{
  "fcmToken": "<FCM_TOKEN>",
  "platform": "android"
}
```

| Field | Required | Validation |
|--------|----------|------------|
| `fcmToken` | Yes | Non-empty string after trim |
| `platform` | Yes | Exactly `"android"` or `"ios"` |

No other fields are read by the handler.

### Response

- **Status:** `200`
- **Body:** `{ "ok": true, "deviceId": "<same as X-Device-Id>" }`

### Errors

| HTTP | Code | When |
|------|------|------|
| `400` | `VALIDATION_ERROR` | Missing `fcmToken` or invalid `platform` |
| `401` | `MISSING_DEVICE_ID` / `INVALID_AUTH_TOKEN` | Auth / device header (§3, §4) |
| `500` | `INTERNAL` | Unexpected (e.g. Firebase Admin misconfiguration on auth path) |

### Backend behavior

1. Resolve `deviceId` from `X-Device-Id`.
2. Upsert MongoDB device document by `deviceId`.
3. Set `fcmToken`, `platform`, `enabled: true`, `updatedAt`.
4. On insert, set `deviceId` via `$setOnInsert`.

### MongoDB device fields (current schema)

| Field | Stored? |
|--------|---------|
| `deviceId` | Yes |
| `fcmToken` | Yes |
| `platform` | Yes (`android` \| `ios`) |
| `enabled` | Yes (default `true`; set `true` on upsert) |
| `updatedAt` | Yes |
| `firebaseUid` | **No** |
| `timezone` | **No** |

---

## 8. POST /api/v1/reminders

### Headers

Same as §7.

### Request body example

```json
{
  "id": "8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70",
  "petId": "pet-42",
  "petName": "Buddy",
  "title": "Medicine",
  "notes": "Give medicine",
  "remindAt": "2026-10-10T09:00:00-04:00"
}
```

### Field table

| Field | Type | Required | Validation | Example |
|--------|------|:--------:|------------|---------|
| `id` | string | Yes | Non-empty UUID | `"8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70"` |
| `petId` | string | Yes | Non-empty after trim (**not** validated as UUID) | `"pet-42"` or any app-defined id string |
| `petName` | string | Yes | Non-empty after trim | `"Buddy"` |
| `title` | string | Yes | Length 1–80 | `"Medicine"` |
| `notes` | string | No | If present: string, max 200 chars; omit or `null` for none | `"Give medicine"` |
| `remindAt` | string | Yes | ISO-8601 with `Z` or `±HH:MM` suffix; must parse; must be **strictly in the future** vs server clock | `"2026-10-10T09:00:00-04:00"` |

`deviceId` is **not** in the body; it comes from `X-Device-Id`.

### Success responses

**Created — `201`:**

```json
{
  "id": "8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70",
  "status": "scheduled",
  "remindAtUtc": "2026-10-10T13:00:00.000Z"
}
```

**Idempotent retry — `200`:** Same body shape when the same `id` + same `remindAt` string already exists for this `deviceId`.

### Errors

| HTTP | Code | When |
|------|------|------|
| `400` | `VALIDATION_ERROR` | Field validation, bad `remindAt` format |
| `400` | `REMIND_AT_IN_PAST` | `remindAt` ≤ now (server time) |
| `401` | … | Device / auth |
| `409` | `CONFLICT` | Same `id`, different `remindAt` — use `PUT` |
| `500` | `INTERNAL` | Unexpected |

### Backend side effects

- Inserts reminder with `status: "scheduled"`, `remindAt` (original string), `remindAtUtc` (`Date`), `deviceId`.
- Schedules in-memory job (`setTimeout`) from `remindAtUtc`.
- Stores `jobId` on the document.

---

## 9. Reminder Time / Timezone Contract

The backend validates `remindAt` with a regex requiring a **timezone offset or `Z` at the end of the string**:

- Valid suffix: `Z`, `+HH:MM`, or `-HH:MM`
- Invalid: naive local string without offset

### Valid examples

Pakistan:

```text
2026-10-10T09:00:00+05:00
```

New York (EDT example):

```text
2026-10-10T09:00:00-04:00
```

Los Angeles (PDT example):

```text
2026-10-10T09:00:00-07:00
```

UTC:

```text
2026-10-10T13:00:00Z
```

### Invalid example

```text
2026-10-10T09:00:00
```

**Why invalid:** Fails validation — `"remindAt must be ISO-8601 with offset"`.

### Rules for Flutter

- **Do not** hardcode `+05:00` for all users.
- Encode the user’s **local** date/time choice with the **correct offset for that instant** (including DST).
- The server does **not** use its OS timezone to interpret wall-clock time; it parses the instant and stores/schedules in UTC.
- **Do not send** a separate `timezone` field — it is **not** read or stored by current code.

> Do not send `timezone` as a required field. Current API schedules from the offset contained in `remindAt`.

**Warning:** If the app sends the wrong offset, the backend will schedule the wrong instant. Scheduling logic is UTC-safe; **client encoding is not validated against IANA zones.**

### Pipeline

```text
User-selected local time
  → correct ISO-8601 with offset (or Z)
  → POST /reminders
  → new Date(remindAt) → remindAtUtc in MongoDB
  → scheduler (delay = remindAtUtc - now)
  → at due time → FCM
```

---

## 10. Flutter DateTime Requirement

When the user selects **9:00 AM local time**, the JSON `remindAt` must represent **that same local instant** (via offset or Z).

Verify serialization in your app — this repo does not contain the Flutter app; do not assume `DateTime.toIso8601String()` behavior without logging on device (offset presence varies with `isUtc` / `toLocal()`).

### Mandatory QA check

```text
Log the exact JSON request sent to POST /reminders.

Verify remindAt includes:
  Z
  or +HH:MM
  or -HH:MM
```

Test at least: Pakistan, US Eastern, US Pacific, and a DST boundary date.

---

## 11. PUT /api/v1/reminders/:id

### Headers

Same as create.

### Path parameter

- `id` — reminder UUID (must match the reminder you own on this device).

### Request body

Same fields as create **except** `id` is taken from the URL (handler merges `{ ...body, id }`). OpenAPI lists required: `petId`, `petName`, `title`, `remindAt` (and optional `notes`).

### Validation

Same rules as §8 for parsed fields.

### Success — `200`

Same minimal shape as create response: `{ "id", "status", "remindAtUtc" }` with `status` `"scheduled"` after update.

### Errors

| HTTP | Code | When |
|------|------|------|
| `403` | `FORBIDDEN` | Reminder exists but different `deviceId` |
| `404` | `NOT_FOUND` | Unknown `id` |
| `409` | `CONFLICT` | Status is `sent` or `completed` |
| `400` / `401` | … | Validation / auth |

### Server behavior

1. Load reminder by `id`; enforce `deviceId` ownership.
2. Reject if `sent` or `completed`.
3. `cancelJob(id)` — clear in-memory timer.
4. Update document fields including `remindAt`, `remindAtUtc`, `status: "scheduled"`, clear `fcmMessageId`.
5. `scheduleReminderJob` with new `remindAtUtc`.

---

## 12. DELETE /api/v1/reminders/:id

### Behavior

- **Does not** delete the MongoDB row.
- Sets `status` to **`cancelled`**, `jobId` to `null`, updates `updatedAt`.
- If status was `scheduled`, calls `cancelJob(id)` first.

### Request

- Headers only (no body).

### Response

- **`204`** empty body on success.

### Errors

`403` / `404` / `401` / `400` as applicable (§16).

Future push for that reminder should not fire because status is no longer `scheduled` and the timer is cleared.

---

## 13. POST /api/v1/reminders/:id/complete

### Request

- Headers only; **no JSON body** in handler.

### Behavior

1. Ownership check (`deviceId`).
2. If `scheduled`, `cancelJob(id)`.
3. Set `status: "completed"`, `completedAt: now`, `jobId: null`.

### Response — `200`

```json
{
  "id": "8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70",
  "status": "completed"
}
```

Completing prevents future notification: job cancelled and `runReminderJob` exits if status ≠ `scheduled`.

### Errors

Same patterns as delete (`403`, `404`, etc.).

---

## 14. Reminder Statuses

From `REMINDER_STATUSES` in `reminder.model.ts`:

| Status | Meaning | Can send notification? |
|--------|---------|-------------------------|
| `scheduled` | Waiting for due time | **Yes** (when due, if device/token OK) |
| `sent` | FCM send succeeded | **No** |
| `failed` | Send failed or no token / disabled device | **No** (no automatic retry in code) |
| `cancelled` | Deleted via API | **No** |
| `completed` | Marked done via complete endpoint | **No** |

---

## 15. Ownership Rules

**Current behavior: `deviceId` only.**

- Reminders are keyed by client `id` globally; ownership check compares `row.deviceId` to header `X-Device-Id`.
- **`firebaseUid` is not stored** on devices or reminders and **is not used** for authorization in route handlers.
- Firebase token verification (when used) only gates **whether the request is authenticated**, not whether the token’s user “owns” the device.

Unique index: `{ deviceId, id }` — same reminder UUID on two different devices would be two separate rows.

---

## 16. Response Codes

Error body: `{ "error": { "code": "<CODE>", "message": "<message>" } }`.

| HTTP | Code | Meaning (backend) | Flutter action (recommendation) |
|------|------|-------------------|----------------------------------|
| `200` | — | OK / idempotent create / update / complete | Update local state if needed |
| `201` | — | Reminder created | Keep local reminder; store returned `remindAtUtc` if useful |
| `204` | — | Delete succeeded | Mark cancelled locally |
| `400` | `VALIDATION_ERROR` | Bad input (incl. bad `X-Device-Id` format, bad `remindAt`) | Fix payload; do not blind retry |
| `400` | `REMIND_AT_IN_PAST` | Time not in future | Ask user to pick a future time |
| `401` | `MISSING_DEVICE_ID` | Missing/invalid device header or legacy API key | Ensure `X-Device-Id`; check API key only if legacy |
| `401` | `INVALID_AUTH_TOKEN` | Missing/invalid Firebase token when required | Refresh `getIdToken()` / re-authenticate |
| `403` | `FORBIDDEN` | Reminder belongs to another `deviceId` | Data mismatch — wrong device id or wrong reminder id |
| `404` | `NOT_FOUND` | Unknown reminder `id` | Remove or reconcile local copy |
| `409` | `CONFLICT` | Duplicate id with different time, or update on sent/completed | Use `PUT` or fix local state |
| `500` | `INTERNAL` | Unexpected server error | Retry with backoff; report if persistent |

---

## 17. FCM Notification Flow

```text
remindAtUtc reached
  → runReminderJob(id, deviceId)
  → load reminder (status must be "scheduled")
  → sendReminderPush(reminder)
       → getDevice(deviceId)
       → if !enabled or !fcmToken → failed (no send)
       → if FCM_DRY_RUN=true → log + fake success
       → else Firebase Admin messaging.send(...)
  → success → status "sent", fcmMessageId set
  → failure → status "failed"
  → invalid token → device enabled=false, reminder failed
```

### Notification payload (actual code)

| Part | Value |
|------|--------|
| **notification.title** | `🐾 {petName} Reminder` |
| **notification.body** | `{title}` or `{title}\n{notes}` if notes set |
| **data.type** | `pet_reminder` |
| **data.reminderId** | reminder `id` |
| **data.petId** | `petId` |
| **data.petName** | `petName` |
| **data.title** | `title` |
| **android.priority** | `high` |
| **android.notification.channelId** | `pet_reminders_channel` |

iOS-specific keys beyond the default FCM message are not customized in code.

---

## 18. App Lifecycle / Registration Flow

```text
App start
  ↓
Firebase.initializeApp() (client)
  ↓
Authentication / session (client — strategy chosen by app; not defined in this backend repo)
  ↓
Load or create persistent Device UUID
  ↓
Request notification permission + obtain FCM token (client)
  ↓
POST /api/v1/devices/fcm-token
  ↓
App ready for reminder sync calls
```

### Future / integration decision

- **Anonymous Firebase Auth** (or any specific auth provider) is **not** implemented in this backend repository; only ID token verification is supported when enabled.
- Decide with backend ops: production values for `FIREBASE_ID_TOKEN_REQUIRED` and whether all installs must sign in before API calls.
- Decide whether to later bind `firebaseUid` to devices (not in current code).

---

## 19. Create Reminder Flow

```text
User creates reminder
  ↓
Save to Hive / local storage (app responsibility)
  ↓
Build remindAt with correct offset
  ↓
POST /api/v1/reminders
  ↓
201 (or 200 idempotent)
  ↓
Keep local reminder; optionally store remindAtUtc from response
```

**If API fails (recommended app behavior — not defined by backend):**

- Keep local reminder but mark sync state failed / pending retry for transient errors (`500`, network).
- On `400` validation / past time, fix local time before retry.
- On `409`, switch to `PUT` if updating an existing server row.

---

## 20. Edit Reminder Flow

```text
User edits local reminder
  ↓
Build updated remindAt with offset
  ↓
PUT /api/v1/reminders/:id
  ↓
Backend cancels old timer, saves new remindAtUtc, schedules new job
  ↓
Update local store after success
```

Cannot edit reminders already `sent` or `completed` (`409`).

---

## 21. Delete Reminder Flow

```text
DELETE /api/v1/reminders/:id
  ↓
Backend cancels timer if scheduled
  ↓
status = cancelled (row retained)
  ↓
Update / remove item in Hive per app UX
```

---

## 22. Complete Reminder Flow

```text
POST /api/v1/reminders/:id/complete
  ↓
Backend cancels timer if scheduled
  ↓
status = completed, completedAt set
  ↓
Update Hive
```

---

## 23. FCM Token Refresh Flow

```text
FCM onTokenRefresh (or new token after reinstall)
  ↓
POST /api/v1/devices/fcm-token
  ↓
Same X-Device-Id
  ↓
New fcmToken in body
```

Backend **upserts** and **replaces** `fcmToken` for that `deviceId` (supported in code).

---

## 24. Important Mobile Developer Rules

API-enforced where noted; others are app recommendations.

```text
[ ] Keep one persistent X-Device-Id per installation (app — API requires header, not persistence proof)
[ ] Never generate a new device ID for every request (app recommendation)
[ ] Send Authorization Bearer when server has FIREBASE_ID_TOKEN_REQUIRED=true (API)
[ ] Register/refresh FCM token via POST /devices/fcm-token (integration)
[ ] Use stable reminder UUID as id (API: id must be UUID)
[ ] Always send remindAt with Z or ±HH:MM suffix (API)
[ ] Never hardcode +05:00 for all users (app)
[ ] Never send naive local datetime without offset (API rejects)
[ ] Use PUT when changing an existing reminder id (API: POST + same id different time → 409)
[ ] Call DELETE when user deletes locally (integration)
[ ] Call complete endpoint when user marks done (integration)
[ ] Handle 401/403/409/validation errors appropriately (app)
```

---

## 25. What Flutter Must NOT Do

```text
❌ Do not send remindAt without offset or Z.
❌ Do not assume server timezone equals user timezone.
❌ Do not hardcode Pakistan offset for every user.
❌ Do not regenerate X-Device-Id on each request.
❌ Do not use FCM token as Firebase Auth Bearer token.
❌ Do not use POST /reminders to change time for an existing id (use PUT).
❌ Do not expect GET /reminders or GET /reminders/:id — they do not exist.
❌ Do not send timezone as a separate required field — backend ignores it.
❌ Do not assume firebaseUid links devices on the server — it does not today.
```

---

## 26. Complete Working Request Examples

Replace placeholders. Production base: `https://petcare.apptechcode.com`.

### 1. Register device

```http
POST /api/v1/devices/fcm-token
Host: petcare.apptechcode.com
Authorization: Bearer <Firebase-ID-Token>
X-Device-Id: 8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70
Content-Type: application/json

{
  "fcmToken": "<FCM_REGISTRATION_TOKEN>",
  "platform": "android"
}
```

### 2. Create reminder

```http
POST /api/v1/reminders
Host: petcare.apptechcode.com
Authorization: Bearer <Firebase-ID-Token>
X-Device-Id: 8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70
Content-Type: application/json

{
  "id": "a1b2c3d4-e5f6-4789-a012-3456789abcde",
  "petId": "pet-42",
  "petName": "Buddy",
  "title": "Medicine",
  "notes": "With food",
  "remindAt": "2026-10-10T09:00:00-04:00"
}
```

### 3. Edit reminder

```http
PUT /api/v1/reminders/a1b2c3d4-e5f6-4789-a012-3456789abcde
Host: petcare.apptechcode.com
Authorization: Bearer <Firebase-ID-Token>
X-Device-Id: 8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70
Content-Type: application/json

{
  "petId": "pet-42",
  "petName": "Buddy",
  "title": "Medicine",
  "notes": "With food",
  "remindAt": "2026-10-10T10:00:00-04:00"
}
```

### 4. Delete reminder

```http
DELETE /api/v1/reminders/a1b2c3d4-e5f6-4789-a012-3456789abcde
Host: petcare.apptechcode.com
Authorization: Bearer <Firebase-ID-Token>
X-Device-Id: 8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70
```

### 5. Complete reminder

```http
POST /api/v1/reminders/a1b2c3d4-e5f6-4789-a012-3456789abcde/complete
Host: petcare.apptechcode.com
Authorization: Bearer <Firebase-ID-Token>
X-Device-Id: 8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70
```

---

## 27. Flutter Integration Checklist

### Firebase

- [ ] Firebase initialized on client
- [ ] Authentication strategy agreed with backend ops
- [ ] Firebase ID token attached when `FIREBASE_ID_TOKEN_REQUIRED=true`
- [ ] FCM token obtained
- [ ] FCM token refresh re-registers via `POST /devices/fcm-token`

### Device

- [ ] Persistent device UUID generated once per install
- [ ] `X-Device-Id` on every API call above

### Reminder

- [ ] Local reminder `id` is UUID
- [ ] `POST /reminders` integrated
- [ ] `PUT /reminders/:id` integrated
- [ ] `DELETE /reminders/:id` integrated
- [ ] `POST /reminders/:id/complete` integrated
- [ ] No reliance on GET list from API

### Time

- [ ] `remindAt` includes correct offset or `Z`
- [ ] Pakistan / US / DST scenarios tested
- [ ] Request body logged once in QA

### Push

- [ ] Notification received at scheduled local time
- [ ] Foreground / background / terminated tested
- [ ] Android channel `pet_reminders_channel` configured in app if required

---

## 28. Required QA Scenarios

Expected results verified against current backend logic.

| Scenario | Expected |
|----------|----------|
| Pakistan user selects 9 AM, sends `…T09:00:00+05:00` | Push at that instant (= 9 AM PKT) |
| New York user selects 9 AM, sends correct `-04:00` or `-05:00` for date | Push at 9 AM local for that offset |
| Los Angeles user selects 9 AM, sends correct `-07:00` / `-08:00` | Push at 9 AM local for that offset |
| Missing offset in `remindAt` | `400` `VALIDATION_ERROR` |
| Past `remindAt` | `400` `REMIND_AT_IN_PAST` |
| Wrong `X-Device-Id` for existing reminder | `403` `FORBIDDEN` |
| Edit reminder | Old timer cancelled; new `remindAtUtc` scheduled |
| Delete reminder | `cancelled`; no send when due |
| Complete reminder | `completed`; no send when due |
| FCM token refreshed | New token stored on same `deviceId` |
| Invalid Firebase token (when required) | `401` `INVALID_AUTH_TOKEN` |
| Server restart | `restoreScheduledJobs` reloads `scheduled` reminders; poller every 30s |

**Caveat:** Duplicate push in edge race between timer and poller is possible (see §29).

---

## 29. Known Backend Limitations

Verified from current code only — not part of the normal contract:

- `firebaseUid` may be verified but is **never persisted** or used for reminder/device ownership.
- Ownership is **`deviceId` header only**.
- **No** GET reminder list or single-reminder read API.
- Scheduler uses **in-memory** `setTimeout` per process; PM2 config uses **one instance**.
- **Possible duplicate FCM** if timer and 30s poller both run `runReminderJob` before status flips to `sent`.
- **No retry** for `failed` reminders or transient FCM errors.
- Missing/disabled FCM token at fire time → reminder `failed` (not rescheduled when token fixed later unless app updates reminder).
- **No IANA `timezone` field** — only offset embedded in `remindAt`.
- `petId` is any non-empty string (no UUID enforcement).
- Default `.env.example` allows calls with **only** `X-Device-Id` (no Bearer) — production must tighten env.

---

## 30. Final App Developer Summary

### Mobile developer: minimum required implementation

1. Generate and persist one **UUID** per install; send it as **`X-Device-Id`** on every call.
2. When production server requires it, send **`Authorization: Bearer <Firebase ID token>`** on every call.
3. On startup and FCM refresh, **`POST /api/v1/devices/fcm-token`** with `fcmToken` and `platform` (`android` \| `ios`).
4. Keep the **reminder list in local storage**; the backend does not list reminders.
5. On create, **`POST /api/v1/reminders`** with client-generated reminder **UUID**, pet fields, and **`remindAt` with `Z` or `±HH:MM`**.
6. On edit, **`PUT /api/v1/reminders/:id`** with full updatable fields and new `remindAt`.
7. On delete, **`DELETE /api/v1/reminders/:id`**; on done, **`POST .../complete`**.
8. Never send naive datetimes; never hardcode Pakistan offset for all users.
9. Handle **`401`** (refresh token), **`409`** (use PUT), **`403`** (device/id mismatch), **`400`** (fix payload).
10. Configure the app to handle FCM payload `type: pet_reminder` and Android channel **`pet_reminders_channel`**.

---

## Appendix: Code vs older docs

| Topic | Older / informal docs | Actual code |
|--------|----------------------|-------------|
| `timezone` field | Sometimes described in requirement notes | **Not accepted or stored** |
| `petId` format | May imply UUID | **Any non-empty string** |
| `firebaseUid` on device | May imply binding | **Not stored** |
| Firebase auth | Production guide says required | **Env-dependent**; `.env.example` default is `false` |
| Reminder list API | N/A | **Does not exist** |
| DELETE semantics | “delete” | **Soft cancel** (`status: cancelled`) |
