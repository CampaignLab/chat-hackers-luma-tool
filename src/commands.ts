// "!luma" commands sent in a group

import { getCalendar, listUpcomingEvents } from "./luma";
import { getState, saveState } from "./store";
import { snapshot, subscribedMessage, upcomingMessage } from "./announce";
import { isShareable } from "./sync";

const help = "📅 Send \"!luma on\" to have new events from the calendar posted here automatically, with updates if the time or place changes. \"!luma next\" shows what's coming up, \"!luma off\" stops the posts.";

async function subscribe(roomId: string) {
    const state = getState();
    if (state.rooms[roomId])
        return "📅 This group already gets the calendar's events. Send \"!luma off\" to stop them.";

    const [calendar, events] = await Promise.all([getCalendar(), listUpcomingEvents()]);
    const upcoming = events.filter(isShareable);

    // Events already on the calendar are listed once in the reply instead of being announced one by one,
    // so turning the tool on doesn't flood the group
    const postedAt = new Date().toISOString();
    state.rooms[roomId] = {
        subscribedAt: postedAt,
        events: Object.fromEntries(upcoming.map(event => [event.id, { ...snapshot(event), postedAt }]))
    };
    saveState();

    return subscribedMessage(calendar.name, upcoming);
}

function unsubscribe(roomId: string) {
    const state = getState();
    if (!state.rooms[roomId])
        return "📅 This group isn't getting the calendar's events. Send \"!luma on\" to start.";

    delete state.rooms[roomId];
    saveState();

    return "📅 Done, new events won't be posted here any more. Send \"!luma on\" to start again.";
}

async function next() {
    const [calendar, events] = await Promise.all([getCalendar(), listUpcomingEvents()]);
    return upcomingMessage(calendar.name, events.filter(isShareable));
}

export default async function handleMessage(event) {
    const text: string = (event.content?.body ?? "").trim();
    const match = text.match(/^!luma\b\s*(\w*)/i);
    if (!match) return;

    const command = match[1].toLowerCase();

    try {
        if (command === "on" || command === "subscribe") return { message: await subscribe(event.room_id), context: {} };
        if (command === "off" || command === "unsubscribe") return { message: unsubscribe(event.room_id), context: {} };
        if (command === "next") return { message: await next(), context: {} };

        const subscribed = getState().rooms[event.room_id] ? "This group gets the calendar's events.\n" : "";
        return { message: `${subscribed}${help}`, context: {} };
    }
    catch (err) {
        console.log(err);
        return { message: "📅 Sorry, I couldn't reach Luma just now. Try again in a moment.", context: {} };
    }
}
