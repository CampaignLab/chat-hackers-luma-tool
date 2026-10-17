# Luma Bridge Chathackers Module

Shares events from a Luma calendar into Chathackers groups. Forked from [welcome-tool](https://github.com/Chat-Hackers/welcome-tool).

New events on the calendar are posted to every subscribed group once, with the time in the event's own time zone, the place and the sign-up link. If the time, place or name changes, the group gets an update showing what changed. If an announced event disappears from the calendar, the group is told.

This is the first of the two workflows in the brief (calendar to group). Creating events from a chat, with an organiser preview, comes next.

## Using it in a group

| Send | Get |
| --- | --- |
| `!luma on` | The group starts getting the calendar's events. The reply lists what's already coming up, so switching on doesn't flood the chat |
| `!luma next` | The next five events |
| `!luma off` | No more posts |
| `!luma` | Help |

## Getting started

1. Clone the repo and run `npm install`
1. Create an API key for the calendar at luma.com/calendar/manage/api-keys (needs Luma Plus)
1. Copy `.env.example` to `.env` and fill in `LUMA_API_KEY`, `TOOL_URL` (your tunnel), `HUB_URL` and a `LUMA_TOOL_SECRET`
1. Run `npm run build-web` then `npm run dev`
1. Copy the generated `luma.json` into the Tool Hub's `registrations` folder (it includes the secret the Hub checks when the tool posts) and restart the Hub
1. Switch the tool on in a group, then send `!luma on`

The calendar is checked every `LUMA_POLL_MINUTES` (default 10). For faster updates, also point a Luma webhook (`calendar.event.added`, `event.updated`, `event.canceled`) at `TOOL_URL/luma/webhook?token=…`. A webhook only triggers a check: events are always fetched from the API, never taken from the webhook body.

## Tests

`npm test` runs offline: no Luma key or Tool Hub needed. It checks duplicates, updates, time zones, privacy and cancellations, including the real sync against a fake Luma and Hub.

## Decisions on the brief's questions

- **Duplicate announcements:** each group records every event it has been told about (in `data/state.json`), saved after each post. A post the Hub rejects isn't recorded, so it's retried on the next check. Only one check runs at a time, so a burst of webhooks can't post twice.
- **Updates:** reposted only when the name, time or place changes, with old and new values. Other edits (cover image, spots left) are ignored.
- **Time zones:** times are shown in the event's own time zone with the zone named ("Thu 12 Nov, 19:00–21:30 GMT"), the year only when it isn't this year, and both dates for events past midnight.
- **Cancellations:** Luma's event list has no cancelled flag, so when an announced event disappears it's looked up directly. Only if it's gone, or no longer public, does the group get "No longer on the calendar … may have been cancelled". The message doesn't claim it was cancelled, because Luma doesn't say.
- **Privacy:** only public events are shared by default (`LUMA_VISIBILITY`). Addresses set to guests-only are never posted, only the city.

## Known limitations

- One calendar per tool instance, because Luma API keys are per calendar.
- Anyone in a group can turn the posts on or off.
- Cancellation detection hasn't been checked against a real cancelled Luma event yet.
