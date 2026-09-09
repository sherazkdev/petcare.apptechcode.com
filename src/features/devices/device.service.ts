import { DeviceModel, type DeviceDoc, type DevicePlatform } from "@/features/devices/device.model";
import { MemoryCache } from "@/shared/cache/memory-cache";
import { connectDb } from "@/shared/db/mongoose";

const deviceCache = new MemoryCache<DeviceDoc>(60_000);

export type FcmTokenInput = {
  deviceId: string;
  fcmToken: string;
  platform: DevicePlatform;
};

export async function upsertFcmToken(input: FcmTokenInput) {
  await connectDb();
  const now = new Date();
  const doc = await DeviceModel.findOneAndUpdate(
    { deviceId: input.deviceId },
    {
      $set: {
        fcmToken: input.fcmToken,
        platform: input.platform,
        enabled: true,
        updatedAt: now,
      },
      $setOnInsert: { deviceId: input.deviceId },
    },
    { upsert: true, returnDocument: "after" },
  ).lean<DeviceDoc>();

  if (doc) deviceCache.set(input.deviceId, doc);
  return doc;
}

export async function getDevice(deviceId: string): Promise<DeviceDoc | null> {
  const cached = deviceCache.get(deviceId);
  if (cached) return cached;
  await connectDb();
  const doc = await DeviceModel.findOne({ deviceId }).lean<DeviceDoc>();
  if (doc) deviceCache.set(deviceId, doc);
  return doc;
}

export async function disableDevice(deviceId: string) {
  await connectDb();
  await DeviceModel.updateOne(
    { deviceId },
    { $set: { enabled: false, updatedAt: new Date() } },
  );
  deviceCache.delete(deviceId);
}
