import { OpenAPIRoute } from "chanfana";
import { apiKeyParam } from "../param";
import { getAccessToken, sendEmail } from "./util";

export class SendEmail extends OpenAPIRoute {
    schema = {
        tags: ["Email"],
        summary: "Send an email using user's OAuth credentials",
        parameters: [apiKeyParam],
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                to: { type: "string", format: "email" },
                                subject: { type: "string", minLength: 1 },
                                text: { type: "string", minLength: 1 },
                            },
                            required: ["to", "subject", "text"],
                        },
                    },
                },
            },
        },
        responses: {
            "200": { description: "Email sent successfully" },
            "400": { description: "Invalid request body or missing API key" },
            "401": { description: "Invalid API key or missing OAuth credentials" },
            "500": { description: "Failed to send email" },
        },
    };

    async handle(c) {
        try {
            const api_key = c.req.param("api_key");
            if (!api_key) {
                return c.json({ error: "API key is required" }, 400);
            }

            const requestBody = await c.req.json();
            const { to, subject, text } = requestBody;

            if (!to || !subject || !text) {
                return c.json({ error: "Missing required fields: to, subject, text" }, 400);
            }

            const user = await c.env.DB.prepare(
                "SELECT id, email FROM users WHERE api_key = ?"
            ).bind(api_key).first();

            if (!user) {
                return c.json({ error: "Invalid API key" }, 401);
            }

            const oauth = await c.env.DB.prepare(
                "SELECT provider, client_id, client_secret, refresh_token FROM oauth WHERE user_id = ?"
            ).bind(user.id).first();

            if (!oauth) {
                return c.json({ error: "OAuth credentials not found" }, 401);
            }

            const accessToken = await getAccessToken(oauth.provider, oauth.client_id, oauth.client_secret, oauth.refresh_token);
            await sendEmail(user.email, to, subject, text, accessToken, oauth.provider);

            return c.json({ message: "Email sent successfully" }, 200);
        } catch (error) {
            console.error("Error sending email:", error);
            return c.json({ error: "Failed to send email" }, 500);
        }
    }
}
