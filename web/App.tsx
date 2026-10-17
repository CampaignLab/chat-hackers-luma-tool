import "./App.css";
import { useEffect, useState } from "react";
import { getStatus, postSync } from "./requests";

type Status = {
  calendar?: string;
  error?: string;
  pollMinutes: number;
  rooms: { roomId: string, subscribedAt: string, announced: number }[];
  lastSync?: { time: string, posted: number, failed: string[], error?: string };
  upcoming?: { id: string, name: string, visibility?: string, shared: boolean, preview: string }[];
};

export default function App() {
  const [status, setStatus] = useState<Status>();
  const [syncing, setSyncing] = useState(false);

  async function loadStatus() {
    setStatus(await getStatus());
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function syncNow() {
    setSyncing(true);
    await postSync();
    await loadStatus();
    setSyncing(false);
  }

  if (!status) return <p>Loading…</p>;

  return (
    <>
      <h1>Luma Bridge</h1>
      <h3>{status.calendar ? `Sharing events from ${status.calendar}` : "Can't reach Luma"}</h3>
      {status.error && <p className="error">{status.error}</p>}

      <p>
        Checks the calendar every {status.pollMinutes} minutes.{" "}
        {status.lastSync && `Last check ${new Date(status.lastSync.time).toLocaleString()}: ${status.lastSync.posted} posted.`}
      </p>
      {status.lastSync?.error && <p className="error">{status.lastSync.error}</p>}
      {status.lastSync?.failed.map(failure => <p key={failure} className="error">Not posted: {failure}</p>)}
      <button disabled={syncing} onClick={syncNow}>{syncing ? "Checking…" : "Check now"}</button>

      <h3>Groups ({status.rooms.length})</h3>
      {status.rooms.length === 0 && <p>No groups yet. Send "!luma on" in a group with the tool switched on.</p>}
      {status.rooms.map(room => (
        <p key={room.roomId}>{room.roomId}: since {new Date(room.subscribedAt).toLocaleDateString()}, {room.announced} events tracked</p>
      ))}

      <h3>Upcoming events, as they'd be announced</h3>
      {status.upcoming?.map(event => (
        <div key={event.id} className={event.shared ? "bubble" : "bubble not-shared"}>
          {!event.shared && <small>Not shared ({event.visibility})</small>}
          {(event.shared ? "" : "\n") + event.preview}
        </div>
      ))}
    </>
  );
}
