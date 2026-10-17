// Which groups get the calendar's events, and what has already been announced in each.
// Kept in one JSON file so restarts never re-announce anything.

import * as fs from "fs";
import path from "path";

// What was last posted about an event, so changes can be spotted and described
export type Snapshot = {
    name: string;
    start_at: string;
    end_at: string;
    timezone: string;
    location: string;
    url: string;
}

export type Announcement = Snapshot & {
    postedAt: string;
    cancelled?: boolean;
}

export type State = {
    rooms: {
        [roomId: string]: {
            subscribedAt: string;
            events: { [eventId: string]: Announcement };
        }
    };
}

const dataDir = () => process.env.DATA_DIR ?? path.resolve(__dirname, "../data");
const statePath = () => path.join(dataDir(), "state.json");

function loadState(): State {
    try {
        return JSON.parse(fs.readFileSync(statePath(), "utf8"));
    }
    catch {
        return { rooms: {} };
    }
}

// One shared copy, so a group subscribing during a sync isn't overwritten when the sync saves
let state: State | undefined;

export function getState() {
    state ??= loadState();
    return state;
}

export function saveState() {
    const state = getState();
    fs.mkdirSync(dataDir(), { recursive: true });
    // write then rename, so a crash mid-write can't leave a half-written file
    fs.writeFileSync(`${statePath()}.tmp`, JSON.stringify(state, null, 2));
    fs.renameSync(`${statePath()}.tmp`, statePath());
}
