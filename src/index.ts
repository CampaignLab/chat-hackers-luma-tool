import express from "express";
import * as fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import handleMessage from "./commands";
import { runSync, lastSync, isShareable } from "./sync";
import { getState } from "./store";
import { getCalendar, listUpcomingEvents } from "./luma";
import { newEventMessage } from "./announce";

const port = Number(process.env.PORT ?? 5059);

// The Tool Hub has to reach this URL, so set TOOL_URL to your ngrok / Cloudflare tunnel address
const url = process.env.TOOL_URL ?? `http://localhost:${port}`;
const pollMinutes = Number(process.env.LUMA_POLL_MINUTES ?? 10);

const moduleRegistration = {
  id: "luma",
  uuid: uuidv4(),
  url,
  emoji: "📅",
  introduction: "Send !luma on to have new events from our Luma calendar posted here automatically, with updates if the time or place changes. !luma next shows what's coming up, !luma off stops it.",
  title: "Luma Events",
  description: "Shares events from a Luma calendar into the group, and keeps them up to date.",
  // needed for posting new events without being asked
  secret: process.env.LUMA_TOOL_SECRET,
  event_types: [
    "m.room.message"
  ]
}

function generateRegistrationFile() {
  fs.writeFileSync(`./${moduleRegistration.id}.json`, JSON.stringify(moduleRegistration, null, 2));
}

let syncTimer: NodeJS.Timeout | undefined;

// Luma webhooks only prompt a sync; the event is always re-fetched from the API rather than trusting the payload
function syncSoon() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, 5000);
}

async function start() {
  const app = express();
  app.use(express.json());

  app.get("/", async (req, res) => {
    const htmlPath = path.resolve(__dirname, "../web/dist/index.html")

    res.sendFile(htmlPath);
  })

  app.post("/", async (req, res) => {
    const { event } = req.body;

    console.log("event received", event)

    const response = event.type === "m.room.message" ? await handleMessage(event) : undefined;

    console.log("response", response);

    res.send({ success: true, response });
  });

  app.post("/luma/webhook", async (req, res) => {
    const { LUMA_WEBHOOK_TOKEN } = process.env;
    if (LUMA_WEBHOOK_TOKEN && req.query.token !== LUMA_WEBHOOK_TOKEN)
      return res.status(403).send({ success: false });

    console.log("luma webhook", req.body?.type);
    syncSoon();
    res.send({ success: true });
  })

  // Dashboard: the calendar, subscribed groups, last sync and a preview of each upcoming announcement
  app.get("/api/status", async (req, res) => {
    const state = getState();
    const rooms = Object.entries(state.rooms).map(([roomId, room]) => ({
      roomId, subscribedAt: room.subscribedAt, announced: Object.keys(room.events).length
    }));

    try {
      const [calendar, events] = await Promise.all([getCalendar(), listUpcomingEvents()]);
      const upcoming = events.slice(0, 20).map(event => ({
        id: event.id, name: event.name, visibility: event.visibility, shared: isShareable(event), preview: newEventMessage(event)
      }));

      res.send({ calendar: calendar.name, rooms, lastSync, pollMinutes, upcoming });
    }
    catch (err) {
      res.send({ rooms, lastSync, pollMinutes, error: String(err) });
    }
  })

  app.post("/api/sync", async (req, res) => {
    res.send(await runSync());
  })

  app.listen(port);
  console.log(`Luma tool listening on port ${port}, registered at ${url}, syncing every ${pollMinutes} minutes`);

  setInterval(runSync, pollMinutes * 60 * 1000);
  runSync();
};

generateRegistrationFile();
start();
