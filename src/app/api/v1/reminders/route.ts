import { createReminder } from "@/features/reminders/reminder.service";
import { requireDeviceContext } from "@/shared/http/device-context";
import { jsonError } from "@/shared/http/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { deviceId } = await requireDeviceContext(request);
    const body = await request.json();
    const result = await createReminder(deviceId, body);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return jsonError(error);
  }
}
