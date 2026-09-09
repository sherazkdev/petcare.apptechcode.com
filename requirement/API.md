# Pet Care — Reminder Push API (simplified)

Base path: `/api/v1`  
Local example: `http://localhost:3000/api/v1`

App reminders stay on the phone (Hive). Backend is **only** for FCM:

1. Save FCM token
2. On **add** → schedule push at `remindAt`
3. On **edit** → cancel old job, schedule new time
4. On **delete / mark done** → cancel job so push is not sent

Do **not** send `timezone`, `appVersion`, or `locale`.  
`remindAt` already includes the timezone offset.

---

## Headers (every request)

| Header | Required | Example |
| --- | --- | --- |
| `X-Device-Id` | Yes | UUID, same for that phone install |
| `X-Api-Key` | If server has `X_API_KEY` | Same as env |
| `Content-Type` | Yes on JSON | `application/json` |

No login. All reminders belong to `X-Device-Id`.

---

## Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title must be 1-80 characters"
  }
}
```

| HTTP | `error.code` |
| --- | --- |
| 400 | `VALIDATION_ERROR` |
| 400 | `REMIND_AT_IN_PAST` |
| 401 | `MISSING_DEVICE_ID` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 500 | `INTERNAL` |

---

## 1. Register FCM token

`POST /api/v1/devices/fcm-token`

**Body**

| Field | Type | Required |
| --- | --- | --- |
| `fcmToken` | string | Yes |
| `platform` | `"android"` \| `"ios"` | Yes |

```json
{
  "fcmToken": "cNZZxxxx:APA91b...",
  "platform": "android"
}
```

**Response `200`**

```json
{
  "ok": true,
  "deviceId": "8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70"
}
```

Upsert by `X-Device-Id`. New token **replaces** the old one.

---

## 2. Add reminder (schedule FCM)

`POST /api/v1/reminders`

**Body**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string (UUID) | Yes | Client-generated. Same id as in the app. |
| `petId` | string | Yes | Selected pet id |
| `petName` | string | Yes | Selected pet’s name (FCM title `🐾 {petName} Reminder`) |
| `title` | string | Yes | 1–80 chars |
| `notes` | string \| null | No | Max 200. Empty notes → `null` or omit |
| `remindAt` | string | Yes | ISO-8601 **with offset**, future. Example: `2026-09-10T09:30:00+05:00` |

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "petId": "pet-uuid",
  "petName": "Pookie",
  "title": "Vaccination",
  "notes": "Bring booklet",
  "remindAt": "2026-09-10T09:30:00+05:00"
}
```

**Response `201`**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "scheduled",
  "remindAtUtc": "2026-09-10T04:30:00.000Z"
}
```

Same `id` + same `remindAt` → `200` (idempotent).  
Same `id` + different `remindAt` → `409 CONFLICT` (use PUT).

---

## 3. Edit reminder (reschedule FCM)

`PUT /api/v1/reminders/{id}`

**Body**

| Field | Type | Required |
| --- | --- | --- |
| `petId` | string | Yes |
| `petName` | string | Yes |
| `title` | string | Yes |
| `notes` | string \| null | No |
| `remindAt` | string (ISO with offset, future) | Yes |

```json
{
  "petId": "pet-uuid",
  "petName": "Pookie",
  "title": "Vaccination",
  "notes": "Bring booklet",
  "remindAt": "2026-09-10T11:00:00+05:00"
}
```

Cancels the old job and schedules a new one. Status = `scheduled`.  
Cannot update if `sent` or `completed` → `409`.

**Response `200`** — same shape as create.

---

## 4. Delete reminder (cancel FCM)

`DELETE /api/v1/reminders/{id}`

Cancel the pending job. Status `cancelled`. No FCM.

**Response `204`** empty body.

---

## 5. Mark complete (cancel FCM)

`POST /api/v1/reminders/{id}/complete`

No body. If still `scheduled`, cancel the job. Status = `completed`.

**Response `200`**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed"
}
```

---

## App will call

| User action | API |
| --- | --- |
| App open | `POST /api/v1/devices/fcm-token` |
| Save new reminder | `POST /api/v1/reminders` |
| Edit reminder | `PUT /api/v1/reminders/{id}` |
| Delete reminder | `DELETE /api/v1/reminders/{id}` |
| Mark done | `POST /api/v1/reminders/{id}/complete` |

Removed: `timezone`, `appVersion`, `locale`, `GET /api/v1`, `GET /api/v1/reminders`.
