import { ApiError } from "@/shared/http/errors";

export type DeviceContext = {
  deviceId: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function requireDeviceContext(request: Request): DeviceContext {
  const apiKey = process.env.X_API_KEY;
  if (apiKey) {
    const given = request.headers.get("x-api-key");
    if (given !== apiKey) {
      throw new ApiError(401, "MISSING_DEVICE_ID", "Invalid or missing X-Api-Key");
    }
  }

  const deviceId = request.headers.get("x-device-id")?.trim() ?? "";
  if (!deviceId) {
    throw new ApiError(401, "MISSING_DEVICE_ID", "X-Device-Id is required");
  }
  if (!isUuid(deviceId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "X-Device-Id must be a UUID");
  }
  return { deviceId };
}
