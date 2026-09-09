import mongoose, { Schema } from "mongoose";

export type DevicePlatform = "android" | "ios";

export type DeviceDoc = {
  deviceId: string;
  fcmToken: string;
  platform: DevicePlatform;
  enabled: boolean;
  updatedAt: Date;
};

const deviceSchema = new Schema<DeviceDoc>(
  {
    deviceId: { type: String, required: true, unique: true },
    fcmToken: { type: String, required: true },
    platform: { type: String, enum: ["android", "ios"], required: true },
    enabled: { type: Boolean, default: true },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

deviceSchema.index({ enabled: 1, updatedAt: -1 });

export const DeviceModel =
  mongoose.models.Device ?? mongoose.model<DeviceDoc>("Device", deviceSchema);
