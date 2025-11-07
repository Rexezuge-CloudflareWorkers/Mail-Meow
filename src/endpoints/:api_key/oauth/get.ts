import { OpenAPIRoute } from "chanfana";
import { apiKeyParam } from "../param";

export class ListOAuth extends OpenAPIRoute {
    schema = {
        tags: ["OAuth"],
        summary: "List OAuth providers for the user",
        parameters: [apiKeyParam],
        responses: {
            "200": { description: "OAuth providers listed successfully" },
            "401": { description: "Invalid API key" },
            "500": { description: "Failed to list OAuth providers" },
        },
    };

    async handle(c) {
        try {
            const api_key = c.req.param("api_key");
            if (!api_key) {
                return c.json({ error: "API key is required" }, 400);
            }

            const user = await c.env.DB.prepare(
                "SELECT id FROM users WHERE api_key = ?"
            ).bind(api_key).first();

            if (!user) {
                return c.json({ error: "Invalid API key" }, 401);
            }

            const { results: providers } = await c.env.DB.prepare(
                "SELECT provider, created_at FROM oauth WHERE user_id = ?"
            ).bind(user.id).all();

            return c.json({ providers }, 200);
        } catch (error) {
            console.error("Error listing OAuth providers:", error);
            return c.json({ error: "Failed to list OAuth providers" }, 500);
        }
    }
}
