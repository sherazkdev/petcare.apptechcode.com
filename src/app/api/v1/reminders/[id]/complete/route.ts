import { completeReminder } from "@/features/reminders/reminder.service";
import { requireDeviceContext } from "@/shared/http/device-context";
import { jsonError } from "@/shared/http/errors";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { deviceId } = requireDeviceContext(request);
    const { id } = await context.params;
    const result = await completeReminder(deviceId, id);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
