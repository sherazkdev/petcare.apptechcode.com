import { upsertFcmToken } from "@/features/devices/device.service";
import { requireDeviceContext } from "@/shared/http/device-context";
import { ApiError, jsonError } from "@/shared/http/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { deviceId } = await requireDeviceContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const fcmToken = typeof body.fcmToken === "string" ? body.fcmToken.trim() : "";
    if (!fcmToken) throw new ApiError(400, "VALIDATION_ERROR", "fcmToken is required");
    const platform = body.platform;
    if (platform !== "android" && platform !== "ios") {
      throw new ApiError(400, "VALIDATION_ERROR", "platform must be android or ios");
    }

    await upsertFcmToken({ deviceId, fcmToken, platform });
    return Response.json({ ok: true, deviceId });
  } catch (error) {
    return jsonError(error);
  }
}
