import { verifyFirebaseIdToken } from "@/shared/firebase/admin";
import { ApiError } from "@/shared/http/errors";

export type DeviceContext = {
  deviceId: string;
  /** Set when request includes a valid Firebase ID token. */
  firebaseUid?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === "true" || v === "1";
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token || null;
}

function assertLegacyApiKey(request: Request): void {
  const apiKey = process.env.X_API_KEY;
  if (!apiKey) return;
  const given = request.headers.get("x-api-key");
  if (given !== apiKey) {
    throw new ApiError(401, "MISSING_DEVICE_ID", "Invalid or missing X-Api-Key");
  }
}

async function assertFirebaseAuth(request: Request): Promise<string | undefined> {
  const tokenRequired = envFlag("FIREBASE_ID_TOKEN_REQUIRED");
  const allowLegacyApiKey = envFlag("ALLOW_LEGACY_API_KEY");
  const bearer = readBearerToken(request);

  if (bearer) {
    try {
      const { uid } = await verifyFirebaseIdToken(bearer);
      return uid;
    } catch {
      throw new ApiError(401, "INVALID_AUTH_TOKEN", "Invalid or expired Firebase ID token");
    }
  }

  if (tokenRequired) {
    if (allowLegacyApiKey) {
      assertLegacyApiKey(request);
      return undefined;
    }
    throw new ApiError(
      401,
      "INVALID_AUTH_TOKEN",
      "Authorization Bearer Firebase ID token is required",
    );
  }

  assertLegacyApiKey(request);
  return undefined;
}

export async function requireDeviceContext(request: Request): Promise<DeviceContext> {
  const firebaseUid = await assertFirebaseAuth(request);

  const deviceId = request.headers.get("x-device-id")?.trim() ?? "";
  if (!deviceId) {
    throw new ApiError(401, "MISSING_DEVICE_ID", "X-Device-Id is required");
  }
  if (!isUuid(deviceId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "X-Device-Id must be a UUID");
  }
  return { deviceId, firebaseUid };
}
