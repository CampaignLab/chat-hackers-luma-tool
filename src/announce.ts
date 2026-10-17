// The messages posted to groups: new events, changes, cancellations, and the list shown when a group subscribes.

import { LumaEvent } from "./luma";
import { Snapshot } from "./store";

// "Thu 12 Nov, 19:00–21:30 GMT" in the event's own time zone, so nobody turns up at the wrong time.
// The zone is always named; across midnight both dates are shown, and the year only when it isn't this year.
export function formatWhen(startAt: string, endAt: string, timeZone: string, now = new Date()) {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const showYear = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(start)
        !== new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(now);

    const day = (date: Date) => new Intl.DateTimeFormat("en-GB", {
        timeZone, weekday: "short", day: "numeric", month: "short", ...(showYear ? { year: "numeric" } : {})
    }).format(date).replace(/,/g, "");
    const time = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
    const zone = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
        .formatToParts(start)
        .find(part => part.type === "timeZoneName")?.value ?? timeZone;

    if (day(start) === day(end))
        return `${day(start)}, ${time(start)}–${time(end)} ${zone}`;

    return `${day(start)}, ${time(start)} – ${day(end)}, ${time(end)} ${zone}`;
}

// Where it is. An address the organiser has set to guests-only is never posted, only its city.
export function formatLocation(event: LumaEvent) {
    const address = event.geo_address_json;

    if (event.location_visibility === "guests-only")
        return address?.city ? `${address.city} (full address for registered guests)` : "Address for registered guests";

    if (address)
        return address.full_address || address.address || address.description || address.city || "See event page";

    if (event.meeting_url || event.location_type === "online")
        return "Online";

    return "Location to be announced";
}

export function snapshot(event: LumaEvent): Snapshot {
    return {
        name: event.name,
        start_at: event.start_at,
        end_at: event.end_at,
        timezone: event.timezone,
        location: formatLocation(event),
        url: event.url
    };
}

// Only changes that matter to someone planning to go. Spots remaining, cover images etc. are ignored.
export function describeChanges(before: Snapshot, after: Snapshot) {
    const changes: string[] = [];

    if (before.name !== after.name)
        changes.push(`📝 Renamed from "${before.name}"`);

    if (before.start_at !== after.start_at || before.end_at !== after.end_at || before.timezone !== after.timezone)
        changes.push(`🕒 Now ${formatWhen(after.start_at, after.end_at, after.timezone)} (was ${formatWhen(before.start_at, before.end_at, before.timezone)})`);

    if (before.location !== after.location)
        changes.push(`📍 Now at ${after.location} (was ${before.location})`);

    return changes;
}

const link = (url: string) => url.startsWith("http") ? url : `https://luma.com/${url}`;

export function newEventMessage(event: LumaEvent) {
    return [
        `📅 New event: ${event.name}`,
        `🗓 ${formatWhen(event.start_at, event.end_at, event.timezone)}`,
        `📍 ${formatLocation(event)}`,
        `🔗 ${link(event.url)}`
    ].join("\n");
}

export function updatedEventMessage(after: Snapshot, changes: string[]) {
    return [`✏️ Event updated: ${after.name}`, ...changes, `🔗 ${link(after.url)}`].join("\n");
}

// Luma doesn't say whether an event was cancelled, deleted or made private, so the message doesn't guess
export function removedEventMessage(before: Snapshot) {
    return `❌ No longer on the calendar: ${before.name} (${formatWhen(before.start_at, before.end_at, before.timezone)}). It may have been cancelled, check with the organiser.`;
}

export function subscribedMessage(calendarName: string, upcoming: LumaEvent[]) {
    const intro = `📅 This group will now get new events from ${calendarName}, plus updates if the time or place changes.`;

    if (upcoming.length === 0)
        return `${intro}\nNothing is scheduled right now.`;

    const shown = upcoming.slice(0, 5).map(event =>
        `• ${event.name}\n  ${formatWhen(event.start_at, event.end_at, event.timezone)}\n  ${link(event.url)}`);
    const more = upcoming.length > 5 ? `\n…and ${upcoming.length - 5} more on the calendar.` : "";

    return `${intro}\n\nComing up:\n${shown.join("\n")}${more}`;
}

export function upcomingMessage(calendarName: string, upcoming: LumaEvent[]) {
    if (upcoming.length === 0)
        return `📅 Nothing is scheduled on ${calendarName} right now.`;

    return `📅 Coming up on ${calendarName}:\n${upcoming.slice(0, 5).map(event =>
        `• ${event.name}\n  ${formatWhen(event.start_at, event.end_at, event.timezone)}\n  ${link(event.url)}`).join("\n")}`;
}
