/**
 * Local smoke test — run: node --env-file=.env scripts/smoke-local.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3018";
const deviceId = "8f3c9a10-4b21-4d6e-9c11-2a7b8d5e6f70";
const reminderId = "b2c3d4e5-f6a7-4890-b123-456789abcdef";

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", "X-Device-Id": deviceId, ...extra };
  if (process.env.X_API_KEY) h["x-api-key"] = process.env.X_API_KEY;
  return h;
}

async function req(method, path, { body, headers: h, expect } = {}) {
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
  console.log(`${pass ? "PASS" : "FAIL"} ${method} ${path} -> ${res.status} (expected ${expect})`);
  if (!pass) console.log(json);
  return { pass, res, json };
}

const results = [];
results.push(await req("GET", "/api/v1/openapi", { headers: {}, expect: 200 }));

results.push(
  await req("POST", "/api/v1/reminders", {
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

results.push(
  await req("POST", "/api/v1/reminders", {
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

const failed = results.filter((r) => !r.pass).length;
console.log(`\nSmoke summary: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
