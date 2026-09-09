import { deleteReminder, updateReminder } from "@/features/reminders/reminder.service";
import { requireDeviceContext } from "@/shared/http/device-context";
import { jsonError } from "@/shared/http/errors";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteCtx) {
  try {
    const { deviceId } = requireDeviceContext(request);
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateReminder(deviceId, id, body);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteCtx) {
  try {
    const { deviceId } = requireDeviceContext(request);
    const { id } = await context.params;
    await deleteReminder(deviceId, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
