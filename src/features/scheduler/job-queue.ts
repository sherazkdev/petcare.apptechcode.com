import { sendReminderPush } from "@/features/notifications/fcm.service";
import { ReminderModel, type ReminderDoc } from "@/features/reminders/reminder.model";
import { connectDb } from "@/shared/db/mongoose";

const timers = new Map<string, NodeJS.Timeout>();
const POLL_MS = 30_000;

export function cancelJob(reminderId: string) {
  const timer = timers.get(reminderId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(reminderId);
  }
}

export async function scheduleReminderJob(reminder: ReminderDoc) {
  cancelJob(reminder.id);
  const delay = Math.max(0, reminder.remindAtUtc.getTime() - Date.now());
  const jobId = `mem:${reminder.id}:${reminder.remindAtUtc.toISOString()}`;
  await connectDb();
  await ReminderModel.updateOne({ id: reminder.id, deviceId: reminder.deviceId }, { $set: { jobId } });

  const timer = setTimeout(() => {
    void runReminderJob(reminder.id, reminder.deviceId);
  }, delay);
  timers.set(reminder.id, timer);
  return jobId;
}

async function runReminderJob(id: string, deviceId: string) {
  timers.delete(id);
  await connectDb();
  const reminder = await ReminderModel.findOne({ id, deviceId }).lean<ReminderDoc>();
  if (!reminder || reminder.status !== "scheduled") return;

  try {
    const result = await sendReminderPush(reminder);
    if (result.ok) {
      await ReminderModel.updateOne(
        { id, deviceId, status: "scheduled" },
        {
          $set: {
            status: "sent",
            fcmMessageId: result.messageId,
            updatedAt: new Date(),
          },
        },
      );
      return;
    }
    await ReminderModel.updateOne(
      { id, deviceId, status: "scheduled" },
      { $set: { status: "failed", updatedAt: new Date() } },
    );
  } catch (error) {
    console.error("FCM send failed", error);
    await ReminderModel.updateOne(
      { id, deviceId, status: "scheduled" },
      { $set: { status: "failed", updatedAt: new Date() } },
    );
  }
}

export async function restoreScheduledJobs() {
  await connectDb();
  const dueOrFuture = await ReminderModel.find({ status: "scheduled" }).lean<ReminderDoc[]>();
  for (const row of dueOrFuture) {
    await scheduleReminderJob(row);
  }
}

let pollStarted = false;
export function startDuePoller() {
  if (pollStarted) return;
  pollStarted = true;
  setInterval(() => {
    void (async () => {
      await connectDb();
      const due = await ReminderModel.find({
        status: "scheduled",
        remindAtUtc: { $lte: new Date() },
      }).lean<ReminderDoc[]>();
      for (const row of due) {
        if (!timers.has(row.id)) void runReminderJob(row.id, row.deviceId);
      }
    })();
  }, POLL_MS);
}
