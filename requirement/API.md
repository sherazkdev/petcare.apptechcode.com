# Pet Care Reminder API — Developer guide

Live base: `https://petcare.apptechcode.com`  
Swagger: [https://petcare.apptechcode.com/docs](https://petcare.apptechcode.com/docs)  
OpenAPI JSON: `GET /api/v1/openapi`

Reminders **Hive mein phone pe** rehti hain. Backend **sirf FCM** ke liye hai:

| App action | API call | Backend kya karta hai |
| --- | --- | --- |
| App open / token refresh | `POST /api/v1/devices/fcm-token` | Token save |
| Add reminder | `POST /api/v1/reminders` | Us time pe push schedule |
| Edit reminder | `PUT /api/v1/reminders/{id}` | Purana job cancel, naya time |
| Delete | `DELETE /api/v1/reminders/{id}` | Job cancel, **push nahi** |
| Mark done | `POST /api/v1/reminders/{id}/complete` | Job cancel, **push nahi** |

**List reminders API nahi hai.** App apni Hive list dikhati hai.

**Mat bhejo:** `timezone`, `appVersion`, `locale`, alag `date` / `time`. Time sirf `remindAt` mein (offset ke sath).

---

## 1. Headers (har API pe)

Query params nahi. Identity **headers** se aati hai.

| Header | Required | Type | Kaise set karo |
| --- | --- | --- | --- |
| `X-Device-Id` | **Hamesha yes** | UUID | Pehli launch pe generate karo, SharedPreferences / Hive mein save, **us install pe hamesha wahi**. FCM token nahi hai. |
| `Authorization` | **Yes** jab server pe `FIREBASE_ID_TOKEN_REQUIRED=true` | `Bearer <Firebase ID token>` | `FirebaseAuth.instance.currentUser` se `getIdToken()` — har API call se pehle fresh token lo. |
| `X-Api-Key` | **Legacy** — sirf jab server allow kare | string | Remote Config se hata dena jab Firebase token live ho; phir server pe key **rotate**. |
| `Content-Type` | JSON body wali calls pe **yes** | `application/json` | Token, add, edit pe. Delete / complete pe body nahi to optional. |

Example (production / audit):

```
X-Device-Id: 8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Content-Type: application/json
```

UUID format (RFC): `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`  
Galat / missing `X-Device-Id` → `401` ya `400`.  
Missing / galat Firebase token (jab required) → `401` `INVALID_AUTH_TOKEN`.  
Galat legacy `X-Api-Key` → `401`.  
Dusre phone ki reminder → `403`.

**Server env (deploy):** `FIREBASE_ID_TOKEN_REQUIRED=true`, `ALLOW_LEGACY_API_KEY=false` audit ke mutabiq. Migration ke dauran purani app ke liye `ALLOW_LEGACY_API_KEY=true` rakho, phir app update ke baad band karo.

Ek device = ek `X-Device-Id`. Token register aur reminder **same UUID** se.

---

## 2. `remindAt` kaise banao

Screen pe user **date + time** choose karta hai. API ko **ek string** do.

Format: ISO-8601 **offset ke sath** (Z ya `+05:00`).

| Theek | Galat |
| --- | --- |
| `2026-09-10T09:30:00+05:00` | `2026-09-10 09:30` |
| `2026-09-10T04:30:00Z` | `09:30` (sirf time) |
| | `2026-09-10T09:30:00` (offset nahi) |

Pakistan: `+05:00`. Server isko UTC mein convert karta hai.

**Future** hona zaroori hai. Past → `400 REMIND_AT_IN_PAST`.

Dart example:

```dart
final remindAt = DateTime(
  date.year, date.month, date.day, time.hour, time.minute,
).toLocal().toIso8601String();
// ensure offset: e.g. 2026-09-10T09:30:00.000+05:00
```

---

## 3. Error shape (sab endpoints)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title must be 1-80 characters"
  }
}
```

| HTTP | `code` | Matlab |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Header / body galat |
| 400 | `REMIND_AT_IN_PAST` | Time past hai |
| 401 | `MISSING_DEVICE_ID` | `X-Device-Id` missing **ya** legacy `X-Api-Key` galat |
| 401 | `INVALID_AUTH_TOKEN` | Firebase Bearer missing / expire / invalid |
| 403 | `FORBIDDEN` | Reminder is device ki nahi |
| 404 | `NOT_FOUND` | `id` nahi mila |
| 409 | `CONFLICT` | Duplicate id (alag time) **ya** sent/completed edit |
| 500 | `INTERNAL` | Server error |

---

## 4. Register FCM token

**Kab:** App launch, aur jab Firebase naya token de.

`POST /api/v1/devices/fcm-token`

### Path / query params

Koi nahi.

### Headers

`X-Device-Id`, `X-Api-Key`, `Content-Type`

### Body params

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `fcmToken` | string | Yes | Firebase Messaging token. Empty nahi. |
| `platform` | string | Yes | Sirf `"android"` ya `"ios"` |

```json
{
  "fcmToken": "cNZZxxxx:APA91b...",
  "platform": "android"
}
```

Naya token **purane ko replace** karta hai (usi `X-Device-Id` pe).

### Response `200`

```json
{
  "ok": true,
  "deviceId": "8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70"
}
```

`deviceId` header wala UUID hai.

---

## 5. Add reminder (schedule push)

**Kab:** User Save (naya reminder). Pehle Hive mein save, **wahi UUID** API `id` mein bhejo.

`POST /api/v1/reminders`

### Path / query params

Koi nahi.

### Headers

`X-Device-Id`, `X-Api-Key`, `Content-Type`

### Body params

| Field | Type | Required | Screen se | Rules |
| --- | --- | --- | --- | --- |
| `id` | UUID string | Yes | Form pe nahi. App generate kare (Hive id). | Valid UUID |
| `petId` | string | Yes | Selected pet | Empty nahi |
| `petName` | string | Yes | Selected pet **name** (user type nahi) | Push title: `🐾 {petName} Reminder` |
| `title` | string | Yes | Title field | 1–80 chars |
| `notes` | string \| null | No | Notes | Max 200. Empty → omit ya `null` |
| `remindAt` | string | Yes | Date + time milake | ISO + offset, future |

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

### Response

**`201`** naya schedule:

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "scheduled",
  "remindAtUtc": "2026-09-10T04:30:00.000Z"
}
```

**`200`** — same `id` + **same** `remindAt` dobara (idempotent, doosri job nahi).  
**`409 CONFLICT`** — same `id` + **alag** `remindAt` → edit ke liye **PUT** use karo.

---

## 6. Edit reminder (reschedule)

**Kab:** User time / pet / title / notes change kare.

`PUT /api/v1/reminders/{id}`

### Path params

| Param | Where | Required | Value |
| --- | --- | --- | --- |
| `id` | URL | Yes | Wahi UUID jo add pe bheja tha |

Example: `PUT /api/v1/reminders/a1b2c3d4-e5f6-7890-abcd-ef1234567890`

### Query params

Koi nahi.

### Body params

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `petId` | string | Yes | |
| `petName` | string | Yes | |
| `title` | string | Yes | 1–80 |
| `notes` | string \| null | No | Max 200 |
| `remindAt` | string | Yes | Future, ISO + offset |

Body mein **`id` mat bhejo** — path mein hai.

```json
{
  "petId": "pet-uuid",
  "petName": "Pookie",
  "title": "Vaccination",
  "notes": "Bring booklet",
  "remindAt": "2026-09-10T11:00:00+05:00"
}
```

### Response `200`

Create jaisa: `{ "id", "status": "scheduled", "remindAtUtc" }`

`sent` ya `completed` edit → `409`.  
Nahi mila → `404`. Dusra device → `403`.

---

## 7. Delete reminder (push cancel)

**Kab:** User delete.

`DELETE /api/v1/reminders/{id}`

### Path params

| Param | Required |
| --- | --- |
| `id` | Yes (UUID) |

### Body

Koi nahi.

### Response `204`

Empty body. Job cancel. FCM nahi jayegi.

---

## 8. Mark complete (push cancel)

**Kab:** User done / notification ke baad complete.

`POST /api/v1/reminders/{id}/complete`

### Path params

| Param | Required |
| --- | --- |
| `id` | Yes (UUID) |

### Body

Koi nahi.

### Response `200`

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed"
}
```

Agar abhi `scheduled` thi to job cancel.

---

## 9. Phone pe FCM kya aayega

App FCM **send nahi** karti. Server bhejta hai `remindAt` pe **ek dafa**.

Notification:

- Title: `🐾 Pookie Reminder`
- Body: `Vaccination` ya `Vaccination\nBring booklet` (agar notes hon)

Data (strings):

| Key | Example |
| --- | --- |
| `type` | `pet_reminder` |
| `reminderId` | add wala UUID |
| `petId` | pet id |
| `petName` | `Pookie` |
| `title` | `Vaccination` |

Android channel: `pet_reminders_channel`  
Package: `com.pettracker.timetopet.petcare`

Tap → Reminders screen. Phir optionally `POST .../complete`.

---

## 10. Status (server; app list API se nahi leti)

| Status | Matlab |
| --- | --- |
| `scheduled` | Push abhi bhej sakte hain |
| `sent` | FCM accept |
| `completed` | User done |
| `cancelled` | Delete |
| `failed` | FCM fail / invalid token |

---

## 11. Flutter checklist

1. Install pe UUID generate + save (`X-Device-Id`).
2. Launch: Firebase token → `POST /devices/fcm-token` (`fcmToken` + `platform`).
3. Add: Hive save + `POST /reminders` with same `id`, `remindAt` with `+05:00`.
4. Edit: Hive update + `PUT /reminders/{id}` (body mein `id` nahi).
5. Delete: Hive delete + `DELETE /reminders/{id}`.
6. Done: Hive complete + `POST /reminders/{id}/complete`.
7. `timezone` / `locale` / `appVersion` **mat bhejo**.

Swagger Try it out: [https://petcare.apptechcode.com/docs](https://petcare.apptechcode.com/docs) → Authorize → `X-Device-Id` + Firebase Bearer (ya legacy `X-Api-Key`).
