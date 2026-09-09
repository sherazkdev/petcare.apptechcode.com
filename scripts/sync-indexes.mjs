import mongoose from "mongoose";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/petcare_reminders";
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
