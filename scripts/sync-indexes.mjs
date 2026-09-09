import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

function loadEnvFile() {
  const file = resolve(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value.replace(/\\n/g, "\n");
  }
}

loadEnvFile();

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  throw new Error("MONGODB_URI is missing. Set it in .env");
}

console.log("Connecting:", uri.replace(/:[^:@/]+@/, ":****@"));
await mongoose.connect(uri);

const db = mongoose.connection.db;
if (!db) throw new Error("No database");

const devices = db.collection("devices");
const reminders = db.collection("reminders");

await devices.createIndexes([
  { key: { deviceId: 1 }, unique: true, name: "deviceId_1" },
  { key: { enabled: 1, updatedAt: -1 }, name: "enabled_1_updatedAt_-1" },
]);

await reminders.createIndexes([
  { key: { id: 1 }, name: "id_1" },
  { key: { deviceId: 1 }, name: "deviceId_1" },
  { key: { deviceId: 1, id: 1 }, unique: true, name: "deviceId_1_id_1" },
  { key: { deviceId: 1, status: 1, remindAtUtc: 1 }, name: "deviceId_1_status_1_remindAtUtc_1" },
  { key: { status: 1, remindAtUtc: 1 }, name: "status_1_remindAtUtc_1" },
  { key: { petId: 1, deviceId: 1 }, name: "petId_1_deviceId_1" },
]);

const [deviceIdx, reminderIdx] = await Promise.all([
  devices.indexes(),
  reminders.indexes(),
]);

console.log("devices indexes:");
for (const idx of deviceIdx) console.log(" ", idx.name, JSON.stringify(idx.key), idx.unique ? "unique" : "");
console.log("reminders indexes:");
for (const idx of reminderIdx) console.log(" ", idx.name, JSON.stringify(idx.key), idx.unique ? "unique" : "");

await mongoose.disconnect();
