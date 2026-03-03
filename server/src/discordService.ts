import axios from 'axios';

export class DiscordService {
    private static DISCORD_API_BASE = 'https://discord.com/api/v10';

    /**
     * Sends a message to one or more Discord channels/users using a bot token as a Bot user.
     * @param token Discord Bot Token
     * @param channelIds Discord Channel ID(s), separated by commas
     * @param content Message content
     */
    static async sendMessage(token: string, channelIds: string, content: string) {
        if (!token || !channelIds) {
            throw new Error('Discord Bot Token and Channel ID(s) are required.');
        }

        const ids = channelIds.split(',').map(id => id.trim()).filter(id => id.length > 0);

        if (ids.length === 0) {
            throw new Error('No valid Discord Channel IDs provided.');
        }

        const errors: string[] = [];
        const successes: string[] = [];

        for (const id of ids) {
            try {
                // Try sending as if it's a Channel ID first
                await axios.post(
                    `${this.DISCORD_API_BASE}/channels/${id}/messages`,
                    { content },
                    {
                        headers: {
                            Authorization: `Bot ${token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
                successes.push(id);
            } catch (error: any) {
                // If 404 Unknown Channel or 400 Bad Request, it might be a User ID
                if (error.response && (error.response.status === 404 || error.response.status === 400)) {
                    try {
                        // Attempt to create a DM channel with this User ID
                        const dmResponse = await axios.post(
                            `${this.DISCORD_API_BASE}/users/@me/channels`,
                            { recipient_id: id },
                            {
                                headers: {
                                    Authorization: `Bot ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );

                        const dmChannelId = dmResponse.data?.id;
                        if (dmChannelId) {
                            // Retry sending the message to the newly created/fetched DM channel
                            await axios.post(
                                `${this.DISCORD_API_BASE}/channels/${dmChannelId}/messages`,
                                { content },
                                {
                                    headers: {
                                        Authorization: `Bot ${token}`,
                                        'Content-Type': 'application/json',
                                    },
                                }
                            );
                            successes.push(id);
                        } else {
                            throw new Error("Could not create DM channel.");
                        }
                    } catch (dmError: any) {
                        let errorMessage = 'Unknown Error';
                        if (dmError.response) {
                            errorMessage = `${dmError.response.status} - ${JSON.stringify(dmError.response.data)}`;
                        } else if (dmError.message) {
                            errorMessage = dmError.message;
                        }
                        errors.push(`Failed to DM user ID ${id}: ${errorMessage}`);
                        console.error(`Discord API Error (DM fallback) for ID ${id}:`, errorMessage);
                    }
                } else {
                    let errorMessage = 'Unknown Error';
                    if (error.response) {
                        errorMessage = `${error.response.status} - ${JSON.stringify(error.response.data)}`;
                    } else if (error.message) {
                        errorMessage = error.message;
                    }
                    errors.push(`Failed for ID ${id}: ${errorMessage}`);
                    console.error(`Discord API error for ID ${id}:`, errorMessage);
                }
            }
        }

        if (successes.length === 0 && errors.length > 0) {
            throw new Error(`Failed to send to all destinations.\n${errors.join('\n')}`);
        }

        return {
            success: true,
            successCount: successes.length,
            errorCount: errors.length,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    /**
     * Sends a message via Webhook (Alternative, but user asked for Bot).
     * Keeping it as a fallback or for future use.
     */
    static async sendWebhook(webhookUrl: string, content: string) {
        await axios.post(webhookUrl, { content });
    }
}
