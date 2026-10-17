// Posting to a group without being asked, through the Tool Hub's /api/send

export async function sendToRoom(roomId: string, message: string): Promise<{ success: boolean, message?: string }> {
    const { HUB_URL, LUMA_TOOL_SECRET } = process.env;
    if (!HUB_URL || !LUMA_TOOL_SECRET)
        return { success: false, message: "HUB_URL and LUMA_TOOL_SECRET must be set to post to groups" };

    const params = new URLSearchParams({ roomId, toolId: "luma", secret: LUMA_TOOL_SECRET });

    try {
        const response = await fetch(`${HUB_URL.replace(/\/$/, "")}/api/send?${params}`, {
            method: "POST",
            body: JSON.stringify({ message }),
            headers: { "Content-type": "application/json" }
        });

        return await response.json() as { success: boolean, message?: string };
    }
    catch (err) {
        return { success: false, message: `Tool Hub unreachable: ${err}` };
    }
}
