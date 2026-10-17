// Offline tests for what gets posted: no Luma key or Tool Hub needed. Usage: npm test

import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import path from "path";
import { planSync, runSync } from "./sync";
import { formatWhen, formatLocation, snapshot } from "./announce";
import { LumaEvent } from "./luma";
import { State, getState } from "./store";

const now = new Date("2026-10-17T12:00:00Z");

const hackNight: LumaEvent = {
    id: "evt-hack",
    name: "Hack Night",
    start_at: "2026-11-12T19:00:00Z",
    end_at: "2026-11-12T21:30:00Z",
    timezone: "Europe/London",
    url: "https://luma.com/hack-night",
    visibility: "public",
    geo_address_json: { full_address: "Newspeak House, 133 Bethnal Green Rd, London", city: "London" }
};

const roomWith = (events: LumaEvent[] = []): State => ({
    rooms: { "!group": { subscribedAt: now.toISOString(), events: Object.fromEntries(events.map(event => [event.id, { ...snapshot(event), postedAt: now.toISOString() }])) } }
});

const tests: [string, () => void][] = [
    ["a new event is announced once", () => {
        const { actions } = planSync(roomWith(), [hackNight], now);
        assert.equal(actions.length, 1);
        assert.equal(actions[0].kind, "announce");
        assert.match(actions[0].message, /New event: Hack Night/);
    }],

    ["an event already announced isn't posted again", () => {
        const { actions, missing } = planSync(roomWith([hackNight]), [hackNight], now);
        assert.equal(actions.length, 0);
        assert.equal(missing.length, 0);
    }],

    ["changes that don't matter to attendees aren't reposted", () => {
        const { actions } = planSync(roomWith([hackNight]), [{ ...hackNight, visibility: "public", meeting_url: null }], now);
        assert.equal(actions.length, 0);
    }],

    ["a time change is posted, showing old and new times", () => {
        const moved = { ...hackNight, start_at: "2026-11-12T18:30:00Z", end_at: "2026-11-12T21:00:00Z" };
        const { actions } = planSync(roomWith([hackNight]), [moved], now);
        assert.equal(actions.length, 1);
        assert.equal(actions[0].kind, "update");
        assert.match(actions[0].message, /Now Thu 12 Nov, 18:30–21:00 GMT \(was Thu 12 Nov, 19:00–21:30 GMT\)/);
    }],

    ["a location change is posted", () => {
        const moved = { ...hackNight, geo_address_json: { full_address: "Somerset House, London", city: "London" } };
        const { actions } = planSync(roomWith([hackNight]), [moved], now);
        assert.match(actions[0].message, /Now at Somerset House, London \(was Newspeak House/);
    }],

    ["an announced event missing from the calendar is checked, not assumed cancelled", () => {
        const { actions, missing } = planSync(roomWith([hackNight]), [], now);
        assert.equal(actions.length, 0);
        assert.deepEqual(missing, [{ roomId: "!group", eventId: "evt-hack" }]);
    }],

    ["past events are never reported missing", () => {
        const past = { ...hackNight, start_at: "2026-10-01T19:00:00Z", end_at: "2026-10-01T21:00:00Z" };
        assert.equal(planSync(roomWith([past]), [], now).missing.length, 0);
    }],

    ["private and members-only events aren't shared", () => {
        const { actions } = planSync(roomWith(), [{ ...hackNight, visibility: "private" }, { ...hackNight, id: "evt-members", visibility: "members-only" }], now);
        assert.equal(actions.length, 0);
    }],

    ["every subscribed group gets its own announcement", () => {
        const state = roomWith();
        state.rooms["!other"] = { subscribedAt: now.toISOString(), events: {} };
        assert.deepEqual(planSync(state, [hackNight], now).actions.map(action => action.roomId), ["!group", "!other"]);
    }],

    ["times are shown in the event's own time zone, with the zone named", () => {
        assert.equal(formatWhen("2026-11-12T19:00:00Z", "2026-11-12T21:30:00Z", "Europe/London", now), "Thu 12 Nov, 19:00–21:30 GMT");
        assert.equal(formatWhen("2026-10-20T17:00:00Z", "2026-10-20T19:00:00Z", "Europe/London", now), "Tue 20 Oct, 18:00–20:00 BST");
        assert.equal(formatWhen("2026-11-12T23:00:00Z", "2026-11-13T01:00:00Z", "America/New_York", now), "Thu 12 Nov, 18:00–20:00 GMT-5");
    }],

    ["an event across midnight shows both dates", () => {
        assert.equal(formatWhen("2026-11-12T22:00:00Z", "2026-11-13T02:00:00Z", "Europe/London", now), "Thu 12 Nov, 22:00 – Fri 13 Nov, 02:00 GMT");
    }],

    ["next year's events show the year", () => {
        assert.equal(formatWhen("2027-01-14T19:00:00Z", "2027-01-14T21:00:00Z", "Europe/London", now), "Thu 14 Jan 2027, 19:00–21:00 GMT");
    }],

    ["a guests-only address is never posted", () => {
        assert.equal(formatLocation({ ...hackNight, location_visibility: "guests-only" }), "London (full address for registered guests)");
    }],

    ["online events say so", () => {
        assert.equal(formatLocation({ ...hackNight, geo_address_json: null, meeting_url: "https://zoom.us/j/1" }), "Online");
    }],
];

// The real sync, against a fake Luma and a fake Tool Hub
const fake = { events: [] as LumaEvent[], deleted: new Set<string>(), hubUp: true, posts: [] as string[] };

globalThis.fetch = (async (input: string, init?: { body?: string }) => {
    const url = String(input);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

    if (url.includes("/v1/calendars/events/list")) return json({ entries: fake.events, has_more: false });
    if (url.includes("/v1/events/get")) {
        const id = new URL(url).searchParams.get("event_id");
        const event = fake.events.find(candidate => candidate.id === id);
        return event && !fake.deleted.has(id) ? json({ event }) : json({ message: "not found" }, 404);
    }
    if (url.includes("/api/send")) {
        if (!fake.hubUp) return json({ success: false, message: "module is not active in this room" });
        fake.posts.push(JSON.parse(init.body).message);
        return json({ success: true });
    }
    throw new Error(`unexpected request ${url}`);
}) as typeof fetch;

const syncTests: [string, () => Promise<void>][] = [
    ["a post the Hub rejects isn't recorded, so it's retried next sync", async () => {
        fake.events = [hackNight];
        fake.hubUp = false;
        const first = await runSync();
        assert.equal(first.posted, 0);
        assert.equal(first.failed.length, 1);

        fake.hubUp = true;
        assert.equal((await runSync()).posted, 1);
        assert.match(fake.posts.at(-1), /New event: Hack Night/);
    }],

    ["syncing again posts nothing new", async () => {
        const before = fake.posts.length;
        assert.equal((await runSync()).posted, 0);
        assert.equal(fake.posts.length, before);
    }],

    ["a burst of webhooks (syncs at once) announces a new event only once", async () => {
        const before = fake.posts.length;
        fake.events = [hackNight, { ...hackNight, id: "evt-talk", name: "Lightning Talks" }];
        await Promise.all([runSync(), runSync(), runSync()]);
        assert.equal(fake.posts.length - before, 1);
    }],

    ["an event deleted from Luma is reported once", async () => {
        const before = fake.posts.length;
        fake.events = [hackNight];
        fake.deleted.add("evt-talk");
        await runSync();
        await runSync();
        assert.equal(fake.posts.length - before, 1);
        assert.match(fake.posts.at(-1), /No longer on the calendar: Lightning Talks/);
    }],

    ["an event that drops off the list but still exists isn't reported cancelled", async () => {
        const before = fake.posts.length;
        // e.g. the list call missed it; getEvent still finds it unchanged
        const listed = fake.events;
        fake.events = [];
        const getOnly = [hackNight];
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (input: string, init?: object) => String(input).includes("/v1/events/get")
            ? new Response(JSON.stringify({ event: getOnly[0] }))
            : realFetch(input, init)) as typeof fetch;

        await runSync();
        globalThis.fetch = realFetch;
        fake.events = listed;
        assert.equal(fake.posts.length, before);
    }],
];

async function main() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "luma-tool-test-"));
    process.env.DATA_DIR = dir;
    process.env.HUB_URL = "http://hub.test";
    process.env.LUMA_TOOL_SECRET = "test-secret";
    process.env.LUMA_API_KEY = "test-key";
    getState().rooms["!group"] = { subscribedAt: now.toISOString(), events: {} };

    let failed = 0;
    const report = (name: string, err?: Error) => {
        if (!err) return console.log(`PASS  ${name}`);
        failed++;
        console.log(`FAIL  ${name}\n      ${err.message.split("\n").join("\n      ")}`);
    };

    tests.forEach(([name, test]) => {
        try { test(); report(name); } catch (err) { report(name, err); }
    });

    for (const [name, test] of syncTests) {
        try { await test(); report(name); } catch (err) { report(name, err); }
    }

    const total = tests.length + syncTests.length;
    console.log(`\n${total - failed}/${total} passed`);
    fs.rmSync(dir, { recursive: true, force: true });
    process.exitCode = failed > 0 ? 1 : 0;
}

main();
