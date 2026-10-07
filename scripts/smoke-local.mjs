/**
 * API smoke test
 *
 * Local (no Firebase required):
 *   node --env-file=.env scripts/smoke-local.mjs http://localhost:3018
 *
 * Production (FIREBASE_ID_TOKEN_REQUIRED=true):
 *   SMOKE_FIREBASE_ID_TOKEN="<Firebase ID token from app getIdToken()>" \
 *     node --env-file=.env scripts/smoke-local.mjs https://petcare.apptechcode.com
 */
const base = process.argv[2] ?? "http://localhost:3018";
const deviceId = "8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70";
const reminderId = "b2c3d4e5-f6a7-4890-b123-456789abcdef";

function envFlag(name) {
  const v = process.env[name];
  return v === "true" || v === "1";
}

const firebaseRequired = envFlag("FIREBASE_ID_TOKEN_REQUIRED");
const bearer = process.env.SMOKE_FIREBASE_ID_TOKEN?.trim() || process.env.SMOKE_BEARER_TOKEN?.trim() || "";

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", "X-Device-Id": deviceId, ...extra };
  if (process.env.X_API_KEY) h["x-api-key"] = process.env.X_API_KEY;
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  return h;
}

async function req(method, path, { body, headers: h, expect, label } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: h ?? headers(),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const pass = res.status === expect;
  const name = label ?? `${method} ${path}`;
  console.log(`${pass ? "PASS" : "FAIL"} ${name} -> ${res.status} (expected ${expect})`);
  if (!pass) console.log(json);
  return { pass, res, json };
}

function skip(name, reason) {
  console.log(`SKIP ${name} — ${reason}`);
  return { pass: true, skipped: true };
}

console.log(`Base: ${base}`);
console.log(
  `Auth: FIREBASE_ID_TOKEN_REQUIRED=${firebaseRequired}, SMOKE_FIREBASE_ID_TOKEN=${bearer ? "set" : "not set"}, X_API_KEY=${process.env.X_API_KEY ? "set" : "empty"}`,
);

if (firebaseRequired && !bearer) {
  console.log(
    "\nNote: Production auth is on. Protected tests need a real Firebase ID token:\n" +
      "  SMOKE_FIREBASE_ID_TOKEN=\"<from app getIdToken()>\" node --env-file=.env scripts/smoke-local.mjs <baseUrl>\n",
);
}

const results = [];
results.push(await req("GET", "/api/v1/openapi", { headers: {}, expect: 200 }));

// No device id, no bearer (when Firebase required → auth error first)
results.push(
  await req("POST", "/api/v1/reminders", {
    label: "POST /reminders without X-Device-Id",
    headers: { "Content-Type": "application/json" },
    body: {
      id: reminderId,
      petId: "p",
      petName: "x",
      title: "t",
      remindAt: "2030-01-01T09:00:00Z",
    },
    expect: 401,
  }),
);

if (firebaseRequired && !bearer) {
  results.push(
    skip("validation tests + CRUD", "set SMOKE_FIREBASE_ID_TOKEN for Bearer auth"),
  );
} else {
  results.push(
    await req("POST", "/api/v1/reminders", {
      label: "POST /reminders bad X-Device-Id",
      headers: headers({ "X-Device-Id": "not-a-uuid" }),
      body: {
        id: reminderId,
        petId: "p",
        petName: "x",
        title: "t",
        remindAt: "2030-01-01T09:00:00Z",
      },
      expect: 400,
    }),
  );

  results.push(
    await req("POST", "/api/v1/reminders", {
      label: "POST /reminders naive remindAt",
      headers: headers(),
      body: {
        id: reminderId,
        petId: "p",
        petName: "x",
        title: "t",
        remindAt: "2030-01-01T09:00:00",
      },
      expect: 400,
    }),
  );

  results.push(
    await req("POST", "/api/v1/devices/fcm-token", {
      body: { fcmToken: "smoke-token", platform: "android" },
      expect: 200,
    }),
  );

  const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  results.push(
    await req("POST", "/api/v1/reminders", {
      body: {
        id: reminderId,
        petId: "pet-1",
        petName: "Buddy",
        title: "Med",
        remindAt: future,
      },
      expect: 201,
    }),
  );

  results.push(
    await req("PUT", `/api/v1/reminders/${reminderId}`, {
      body: {
        petId: "pet-1",
        petName: "Buddy",
        title: "Med2",
        remindAt: future,
      },
      expect: 200,
    }),
  );

  results.push(await req("POST", `/api/v1/reminders/${reminderId}/complete`, { expect: 200 }));

  results.push(await req("DELETE", `/api/v1/reminders/${reminderId}`, { expect: 204 }));
}

const ran = results.filter((r) => !r.skipped);
const failed = ran.filter((r) => !r.pass).length;
const skipped = results.filter((r) => r.skipped).length;
console.log(`\nSmoke summary: ${ran.length - failed}/${ran.length} passed${skipped ? `, ${skipped} skipped` : ""}`);
if (firebaseRequired && !bearer && skipped) process.exit(0);
process.exit(failed ? 1 : 0);
