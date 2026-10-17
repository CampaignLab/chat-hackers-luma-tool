// Keeps each subscribed group up to date with the calendar: announces new events once, posts real changes,
// and says when an announced event disappears. planSync decides what to post; runSync fetches, posts and records.

import { LumaEvent, listUpcomingEvents, getEvent } from "./luma";
import { State, Snapshot, getState, saveState } from "./store";
import { snapshot, describeChanges, newEventMessage, updatedEventMessage, removedEventMessage } from "./announce";
import { sendToRoom } from "./hub";

export type Action =
    | { kind: "announce", roomId: string, eventId: string, after: Snapshot, message: string }
    | { kind: "update", roomId: string, eventId: string, after: Snapshot, message: string }
    | { kind: "remove", roomId: string, eventId: string, message: string };

// Which events get shared. Private and members-only events stay off group chats unless the organiser opts in.
export function isShareable(event: LumaEvent) {
    const allowed = (process.env.LUMA_VISIBILITY ?? "public").split(",").map(value => value.trim());
    return !event.visibility || allowed.includes(event.visibility);
}

// Decides what to post. Events the calendar no longer lists are returned as `missing`, because the list alone
// can't tell a cancellation from an event that moved, so runSync checks them with Luma before saying anything.
export function planSync(state: State, events: LumaEvent[], now = new Date()) {
    const actions: Action[] = [];
    const missing: { roomId: string, eventId: string }[] = [];
    const listed = new Map(events.filter(isShareable).map(event => [event.id, event]));

    Object.entries(state.rooms).forEach(([roomId, room]) => {
        listed.forEach((event, eventId) => {
            const after = snapshot(event);
            const posted = room.events[eventId];

            if (!posted) {
                actions.push({ kind: "announce", roomId, eventId, after, message: newEventMessage(event) });
                return;
            }

            const changes = describeChanges(posted, after);
            if (changes.length > 0 && !posted.cancelled)
                actions.push({ kind: "update", roomId, eventId, after, message: updatedEventMessage(after, changes) });
        });

        Object.entries(room.events).forEach(([eventId, posted]) => {
            if (!listed.has(eventId) && !posted.cancelled && new Date(posted.start_at) > now)
                missing.push({ roomId, eventId });
        });
    });

    return { actions, missing };
}

export type SyncResult = { time: string, posted: number, failed: string[], error?: string };
export let lastSync: SyncResult | undefined;

let running: Promise<SyncResult> | undefined;

export function runSync() {
    // one sync at a time, so a webhook arriving mid-sync can't post the same event twice
    running ??= doSync().finally(() => running = undefined);
    return running;
}

async function doSync(): Promise<SyncResult> {
    const now = new Date();
    const result: SyncResult = { time: now.toISOString(), posted: 0, failed: [] };

    try {
        const state = getState();
        if (Object.keys(state.rooms).length === 0) return lastSync = result;

        const events = await listUpcomingEvents(now);
        const { actions, missing } = planSync(state, events, now);

        // An announced event the list no longer shows: still there (moved, or made private) or gone?
        const checked = new Map<string, LumaEvent | undefined>();
        for (const { roomId, eventId } of missing) {
            if (!checked.has(eventId)) checked.set(eventId, await getEvent(eventId));
            const event = checked.get(eventId);
            const posted = state.rooms[roomId].events[eventId];

            if (!event || !isShareable(event)) {
                actions.push({ kind: "remove", roomId, eventId, message: removedEventMessage(posted) });
            }
            else {
                const after = snapshot(event);
                const changes = describeChanges(posted, after);
                if (changes.length > 0)
                    actions.push({ kind: "update", roomId, eventId, after, message: updatedEventMessage(after, changes) });
            }
        }

        for (const action of actions) {
            const sent = await sendToRoom(action.roomId, action.message);

            if (!sent.success) {
                // not recorded, so it's tried again on the next sync
                result.failed.push(`${action.kind} ${action.eventId} in ${action.roomId}: ${sent.message}`);
                continue;
            }

            const room = state.rooms[action.roomId];
            if (action.kind === "remove")
                room.events[action.eventId] = { ...room.events[action.eventId], cancelled: true };
            else
                room.events[action.eventId] = { ...action.after, postedAt: new Date().toISOString() };

            // saved after every post, so a crash mid-sync never causes a repeat announcement
            saveState();
            result.posted++;
        }

        pruneOldEvents(state, now);
        saveState();
    }
    catch (err) {
        console.log(err);
        result.error = String(err);
    }

    return lastSync = result;
}

// Forget events that ended more than 30 days ago
function pruneOldEvents(state: State, now: Date) {
    const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    Object.values(state.rooms).forEach(room => {
        Object.entries(room.events).forEach(([eventId, posted]) => {
            if (new Date(posted.end_at).getTime() < cutoff) delete room.events[eventId];
        });
    });
}
