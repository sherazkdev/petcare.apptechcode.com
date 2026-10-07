import { disableDevice, getDevice } from "@/features/devices/device.service";
import type { ReminderDoc } from "@/features/reminders/reminder.model";

export type FcmResult =
  | { ok: true; messageId: string }
  | { ok: false; invalidToken: boolean; skipRetry: boolean };

function payloadFor(reminder: ReminderDoc, token: string) {
  const body = reminder.notes ? `${reminder.title}\n${reminder.notes}` : reminder.title;
  return {
    token,
    notification: {
      title: `🐾 ${reminder.petName} Reminder`,
      body,
    },
    data: {
      type: "pet_reminder",
      reminderId: reminder.id,
      petId: reminder.petId,
      petName: reminder.petName,
      title: reminder.title,
    },
    android: {
      priority: "high" as const,
      notification: {
        channelId: "pet_reminders_channel",
      },
    },
  };
}

async function sendWithAdmin(reminder: ReminderDoc, token: string): Promise<FcmResult> {
  const { getFirebaseApp } = await import("@/shared/firebase/admin");
  const { getMessaging } = await import("firebase-admin/messaging");
  await getFirebaseApp();

  try {
    const messageId = await getMessaging().send(payloadFor(reminder, token));
    return { ok: true, messageId };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const invalid =
      code.includes("registration-token-not-registered") ||
      code.includes("invalid-registration-token") ||
      code.includes("invalid-argument");
    if (invalid) return { ok: false, invalidToken: true, skipRetry: true };
    throw error;
  }
}

export async function sendReminderPush(reminder: ReminderDoc): Promise<FcmResult> {
  const device = await getDevice(reminder.deviceId);
  if (!device?.enabled || !device.fcmToken) {
    return { ok: false, invalidToken: false, skipRetry: true };
  }

  if (process.env.FCM_DRY_RUN === "true") {
    console.info("[fcm dry-run]", payloadFor(reminder, device.fcmToken));
    return { ok: true, messageId: `dry-run-${reminder.id}` };
  }

  const result = await sendWithAdmin(reminder, device.fcmToken);
  if (!result.ok && result.invalidToken) {
    await disableDevice(reminder.deviceId);
  }
  return result;
}
