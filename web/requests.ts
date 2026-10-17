const { origin, pathname } = window.location;
const BASE_URL = `${origin}${pathname}`.replace(/\/$/, "");

export async function getStatus() {
    const statusResponse = await fetch(`${BASE_URL}/api/status`);
    const statusResult = await statusResponse.json();

    return statusResult;
}

export async function postSync() {
    const syncResponse = await fetch(`${BASE_URL}/api/sync`, { method: "POST" });
    const syncResult = await syncResponse.json();

    return syncResult;
}
