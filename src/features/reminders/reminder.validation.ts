import { isUuid } from "@/shared/http/device-context";
import { ApiError } from "@/shared/http/errors";

export type ReminderInput = {
  id?: string;
  petId?: unknown;
  petName?: unknown;
  title?: unknown;
  notes?: unknown;
  remindAt?: unknown;
};

const OFFSET_RE = /([+-]\d{2}:\d{2}|Z)$/;

export function parseReminderInput(body: ReminderInput, options: { requireId: boolean }) {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (options.requireId && (!id || !isUuid(id))) {
    throw new ApiError(400, "VALIDATION_ERROR", "id is required and must be a UUID");
  }

  const petId = typeof body.petId === "string" ? body.petId.trim() : "";
  if (!petId) throw new ApiError(400, "VALIDATION_ERROR", "petId is required");

  const petName = typeof body.petName === "string" ? body.petName.trim() : "";
  if (!petName) throw new ApiError(400, "VALIDATION_ERROR", "petName is required");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 80) {
    throw new ApiError(400, "VALIDATION_ERROR", "title must be 1-80 characters");
  }

  let notes: string | null = null;
  if (body.notes != null && body.notes !== "") {
    if (typeof body.notes !== "string") {
      throw new ApiError(400, "VALIDATION_ERROR", "notes must be a string");
    }
    if (body.notes.length > 200) {
      throw new ApiError(400, "VALIDATION_ERROR", "notes must be at most 200 characters");
    }
    notes = body.notes;
  }

  const remindAt = typeof body.remindAt === "string" ? body.remindAt.trim() : "";
  if (!remindAt || !OFFSET_RE.test(remindAt) || Number.isNaN(Date.parse(remindAt))) {
    throw new ApiError(400, "VALIDATION_ERROR", "remindAt must be ISO-8601 with offset");
  }

  const remindAtUtc = new Date(remindAt);
  if (remindAtUtc.getTime() <= Date.now()) {
    throw new ApiError(400, "REMIND_AT_IN_PAST", "remindAt must be in the future");
  }

  return { id, petId, petName, title, notes, remindAt, remindAtUtc };
}
