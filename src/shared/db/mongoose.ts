import mongoose from "mongoose";

const globalForMongo = globalThis as typeof globalThis & {
  mongooseConn?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
};

const cache = globalForMongo.mongooseConn ?? { conn: null, promise: null };
globalForMongo.mongooseConn = cache;

export async function connectDb() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is missing. Set it in .env");
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, { bufferCommands: false });
  }
  cache.conn = await cache.promise;
  const { DeviceModel } = await import("@/features/devices/device.model");
  const { ReminderModel } = await import("@/features/reminders/reminder.model");
  await Promise.all([DeviceModel.createIndexes(), ReminderModel.createIndexes()]);
  return cache.conn;
}
