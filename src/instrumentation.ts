export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { restoreScheduledJobs, startDuePoller } = await import("@/features/scheduler/job-queue");
  await restoreScheduledJobs();
  startDuePoller();
}
