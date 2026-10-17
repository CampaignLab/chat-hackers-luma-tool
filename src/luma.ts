// Client for the Luma API (https://docs.luma.com). Needs Luma Plus; each API key manages one calendar.

const API_URL = "https://public-api.luma.com";

export type LumaAddress = {
    address?: string;
    full_address?: string | null;
    city?: string | null;
    description?: string | null;
}

export type LumaEvent = {
    id: string;
    name: string;
    start_at: string;
    end_at: string;
    timezone: string;
    url: string;
    visibility?: string;
    location_type?: string;
    location_visibility?: string;
    geo_address_json?: LumaAddress | null;
    meeting_url?: string | null;
}

export class LumaError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

async function request(path: string, params: Record<string, string> = {}) {
    const { LUMA_API_KEY } = process.env;
    if (!LUMA_API_KEY) throw new LumaError(0, "LUMA_API_KEY is not set");

    const response = await fetch(`${API_URL}${path}?${new URLSearchParams(params)}`, {
        headers: { "x-luma-api-key": LUMA_API_KEY, accept: "application/json" }
    });

    if (!response.ok)
        throw new LumaError(response.status, `Luma ${path} failed (${response.status}): ${await response.text()}`);

    return response.json() as Promise<any>;
}

export async function getCalendar(): Promise<{ id: string, name: string, url?: string }> {
    const result = await request("/v1/calendars/get");
    return result.calendar ?? result;
}

// Upcoming events the calendar manages, following pagination
export async function listUpcomingEvents(after = new Date()): Promise<LumaEvent[]> {
    const events: LumaEvent[] = [];
    let cursor: string | undefined;

    do {
        const result = await request("/v1/calendars/events/list", {
            after: after.toISOString(),
            sort_column: "start_at",
            sort_direction: "asc",
            pagination_limit: "50",
            ...(cursor ? { pagination_cursor: cursor } : {})
        });

        // entries are the event itself in the current API; older responses wrapped it in { event }
        result.entries.forEach(entry => events.push(entry.event ?? entry));
        cursor = result.has_more ? result.next_cursor : undefined;
    } while (cursor);

    return events;
}

// One event, or undefined if Luma no longer has it (deleted, or not on this calendar any more)
export async function getEvent(eventId: string): Promise<LumaEvent | undefined> {
    try {
        const result = await request("/v1/events/get", { event_id: eventId });
        return result.event ?? result;
    }
    catch (err) {
        if (err instanceof LumaError && (err.status === 404 || err.status === 400)) return undefined;
        throw err;
    }
}
