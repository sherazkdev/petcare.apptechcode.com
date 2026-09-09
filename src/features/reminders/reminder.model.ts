import mongoose, { Schema } from "mongoose";

export const REMINDER_STATUSES = [
  "scheduled",
  "sent",
  "completed",
  "cancelled",
  "failed",
] as const;

export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export type ReminderDoc = {
  id: string;
  deviceId: string;
  petId: string;
  petName: string;
  title: string;
  notes: string | null;
  remindAt: string;
  remindAtUtc: Date;
  status: ReminderStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  fcmMessageId: string | null;
  jobId: string | null;
};

const reminderSchema = new Schema<ReminderDoc>(
  {
    id: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    petId: { type: String, required: true },
    petName: { type: String, required: true },
    title: { type: String, required: true, maxlength: 80 },
    notes: { type: String, default: null, maxlength: 200 },
    remindAt: { type: String, required: true },
    remindAtUtc: { type: Date, required: true },
    status: {
      type: String,
      enum: REMINDER_STATUSES,
      required: true,
      default: "scheduled",
    },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
    fcmMessageId: { type: String, default: null },
    jobId: { type: String, default: null },
  },
  { versionKey: false },
);

reminderSchema.index({ deviceId: 1, id: 1 }, { unique: true });
reminderSchema.index({ deviceId: 1, status: 1, remindAtUtc: 1 });
reminderSchema.index({ status: 1, remindAtUtc: 1 });
reminderSchema.index({ petId: 1, deviceId: 1 });

export const ReminderModel =
  mongoose.models.Reminder ?? mongoose.model<ReminderDoc>("Reminder", reminderSchema);
