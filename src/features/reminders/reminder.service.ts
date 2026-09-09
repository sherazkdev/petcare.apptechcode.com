import {
  cancelJob,
  scheduleReminderJob,
} from "@/features/scheduler/job-queue";
import { ReminderModel, type ReminderDoc } from "@/features/reminders/reminder.model";
import { parseReminderInput, type ReminderInput } from "@/features/reminders/reminder.validation";
import { connectDb } from "@/shared/db/mongoose";
import { ApiError } from "@/shared/http/errors";

function createShape(doc: ReminderDoc) {
  return {
    id: doc.id,
    status: doc.status,
    remindAtUtc: doc.remindAtUtc.toISOString(),
  };
}

async function findOwned(id: string, deviceId: string) {
  await connectDb();
  const row = await ReminderModel.findOne({ id }).lean<ReminderDoc>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Unknown id");
  if (row.deviceId !== deviceId) throw new ApiError(403, "FORBIDDEN", "Reminder belongs to another device");
  return row;
}

export async function createReminder(deviceId: string, body: ReminderInput) {
  const parsed = parseReminderInput(body, { requireId: true });
  await connectDb();
  const existing = await ReminderModel.findOne({ id: parsed.id, deviceId }).lean<ReminderDoc>();
  if (existing) {
    const sameTime = existing.remindAt === parsed.remindAt;
    if (sameTime) return { status: 200 as const, body: createShape(existing) };
    throw new ApiError(409, "CONFLICT", "Reminder id already exists");
  }

  const now = new Date();
  const created = await ReminderModel.create({
    ...parsed,
    deviceId,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    fcmMessageId: null,
    jobId: null,
  });
  const lean = created.toObject() as ReminderDoc;
  const jobId = await scheduleReminderJob(lean);
  lean.jobId = jobId;
  return { status: 201 as const, body: createShape(lean) };
}

export async function updateReminder(deviceId: string, id: string, body: ReminderInput) {
  const existing = await findOwned(id, deviceId);
  if (existing.status === "sent" || existing.status === "completed") {
    throw new ApiError(409, "CONFLICT", "Cannot update a sent or completed reminder");
  }
  const parsed = parseReminderInput({ ...body, id }, { requireId: true });
  cancelJob(id);
  const now = new Date();
  await ReminderModel.updateOne(
    { id, deviceId },
    {
      $set: {
        petId: parsed.petId,
        petName: parsed.petName,
        title: parsed.title,
        notes: parsed.notes,
        remindAt: parsed.remindAt,
        remindAtUtc: parsed.remindAtUtc,
        status: "scheduled",
        updatedAt: now,
        fcmMessageId: null,
      },
    },
  );
  const updated = await ReminderModel.findOne({ id, deviceId }).lean<ReminderDoc>();
  if (!updated) throw new ApiError(404, "NOT_FOUND", "Unknown id");
  await scheduleReminderJob(updated);
  return createShape(updated);
}

export async function deleteReminder(deviceId: string, id: string) {
  const existing = await findOwned(id, deviceId);
  if (existing.status === "scheduled") cancelJob(id);
  await ReminderModel.updateOne(
    { id, deviceId },
    { $set: { status: "cancelled", updatedAt: new Date(), jobId: null } },
  );
}

export async function completeReminder(deviceId: string, id: string) {
  const existing = await findOwned(id, deviceId);
  if (existing.status === "scheduled") cancelJob(id);
  const now = new Date();
  await ReminderModel.updateOne(
    { id, deviceId },
    { $set: { status: "completed", completedAt: now, updatedAt: now, jobId: null } },
  );
  return { id, status: "completed" as const };
}
