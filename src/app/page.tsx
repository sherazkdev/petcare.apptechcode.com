export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">Pet Care Reminder API</h1>
      <p className="mt-2 text-zinc-600">
        Feature-based FCM reminder backend. Samples live at{" "}
        <a className="underline" href="/api/v1">
          /api/v1
        </a>
        .
      </p>
      <ul className="mt-6 list-disc space-y-1 pl-5 text-sm">
        <li>POST /api/v1/devices/fcm-token</li>
        <li>POST /api/v1/reminders</li>
        <li>GET /api/v1/reminders</li>
        <li>PUT /api/v1/reminders/:id</li>
        <li>DELETE /api/v1/reminders/:id</li>
        <li>POST /api/v1/reminders/:id/complete</li>
      </ul>
    </main>
  );
}
