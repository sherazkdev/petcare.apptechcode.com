export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Pet Care Reminder Push API",
    version: "1.0.0",
    description:
      "Backend is only for FCM. App stores reminders in Hive. Headers: X-Device-Id (required UUID), Authorization Bearer Firebase ID token (when FIREBASE_ID_TOKEN_REQUIRED), optional legacy X-Api-Key.",
  },
  servers: [
    { url: "https://petcare.apptechcode.com", description: "Production" },
    { url: "http://localhost:3018", description: "Local / PM2" },
  ],
  tags: [
    { name: "Device" },
    { name: "Reminders" },
  ],
  components: {
    securitySchemes: {
      DeviceId: {
        type: "apiKey",
        in: "header",
        name: "X-Device-Id",
        description: "Per-install UUID. Same value for token + reminders.",
      },
      ApiKey: {
        type: "apiKey",
        in: "header",
        name: "X-Api-Key",
        description: "Legacy shared key when ALLOW_LEGACY_API_KEY or FIREBASE_ID_TOKEN_REQUIRED=false.",
      },
      FirebaseBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Firebase Auth ID token from the app (FirebaseAuth.instance.currentUser.getIdToken()).",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                enum: [
                  "VALIDATION_ERROR",
                  "REMIND_AT_IN_PAST",
                  "MISSING_DEVICE_ID",
                  "INVALID_AUTH_TOKEN",
                  "FORBIDDEN",
                  "NOT_FOUND",
                  "CONFLICT",
                  "INTERNAL",
                ],
              },
              message: { type: "string" },
            },
          },
        },
      },
      FcmTokenBody: {
        type: "object",
        required: ["fcmToken", "platform"],
        properties: {
          fcmToken: { type: "string", example: "cNZZxxxx:APA91b..." },
          platform: { type: "string", enum: ["android", "ios"] },
        },
      },
      ReminderCreateBody: {
        type: "object",
        required: ["id", "petId", "petName", "title", "remindAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          petId: { type: "string" },
          petName: { type: "string", example: "Pookie" },
          title: { type: "string", minLength: 1, maxLength: 80, example: "Vaccination" },
          notes: { type: "string", nullable: true, maxLength: 200 },
          remindAt: {
            type: "string",
            example: "2026-09-10T09:30:00+05:00",
            description: "ISO-8601 with offset, must be in the future",
          },
        },
      },
      ReminderUpdateBody: {
        type: "object",
        required: ["petId", "petName", "title", "remindAt"],
        properties: {
          petId: { type: "string" },
          petName: { type: "string" },
          title: { type: "string", minLength: 1, maxLength: 80 },
          notes: { type: "string", nullable: true, maxLength: 200 },
          remindAt: { type: "string", example: "2026-09-10T11:00:00+05:00" },
        },
      },
      ReminderShape: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: ["scheduled", "sent", "completed", "cancelled", "failed"],
          },
          remindAtUtc: { type: "string", format: "date-time" },
        },
      },
    },
  },
  security: [{ DeviceId: [], FirebaseBearer: [] }],
  paths: {
    "/api/v1/devices/fcm-token": {
      post: {
        tags: ["Device"],
        summary: "Register or replace FCM token",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/FcmTokenBody" } },
          },
        },
        responses: {
          "200": {
            description: "Upserted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    deviceId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Missing device id / API key" },
        },
      },
    },
    "/api/v1/reminders": {
      post: {
        tags: ["Reminders"],
        summary: "Add reminder and schedule FCM",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReminderCreateBody" } },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ReminderShape" } } },
          },
          "200": { description: "Idempotent same id + same remindAt" },
          "400": { description: "Validation or remindAt in the past" },
          "409": { description: "Same id, different remindAt — use PUT" },
        },
      },
    },
    "/api/v1/reminders/{id}": {
      put: {
        tags: ["Reminders"],
        summary: "Edit reminder (cancel old job, schedule new time)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReminderUpdateBody" } },
          },
        },
        responses: {
          "200": {
            description: "Rescheduled",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ReminderShape" } } },
          },
          "403": { description: "Another device" },
          "404": { description: "Unknown id" },
          "409": { description: "Already sent or completed" },
        },
      },
      delete: {
        tags: ["Reminders"],
        summary: "Delete reminder (cancel FCM)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "204": { description: "Cancelled" },
          "403": { description: "Another device" },
          "404": { description: "Unknown id" },
        },
      },
    },
    "/api/v1/reminders/{id}/complete": {
      post: {
        tags: ["Reminders"],
        summary: "Mark complete (cancel FCM if still scheduled)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Completed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    status: { type: "string", example: "completed" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
