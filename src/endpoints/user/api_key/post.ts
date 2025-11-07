import { OpenAPIRoute } from "chanfana";
import { comparePassword, generateApiKey } from "../../../utils";

export class GenerateApiKey extends OpenAPIRoute {
    schema = {
        tags: ["User/API_Key"],
        summary: "Generate a unique API Key for the user",
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                email: { type: "string", format: "email" },
                                password: { type: "string", minLength: 6 },
                            },
                            required: ["email", "password"],
                        },
                    },
                },
            },
        },
        responses: {
            "200": { description: "API key generated successfully" },
            "400": { description: "Invalid request body" },
            "401": { description: "Invalid email or password" },
            "500": { description: "Failed to generate API key" },
        },
    };

    async handle(c) {
        try {
            const requestBody = await c.req.json();
            if (!requestBody || !requestBody.email || !requestBody.password) {
                return c.json({ error: "Invalid request body" }, 400);
            }

            const { email, password } = requestBody;

            const user = await c.env.DB.prepare(
                "SELECT id, password, api_key FROM users WHERE email = ? LIMIT 1"
            ).bind(email).first();

            if (!user) {
                return c.json({ error: "Invalid email or password" }, 401);
            }

            const isMatch = await comparePassword(password, user.password);
            if (!isMatch) {
                return c.json({ error: "Invalid email or password" }, 401);
            }

            if (user.api_key) {
                return c.json({ message: "API key already exists", api_key: user.api_key }, 200);
            }

            const apiKey = generateApiKey();

            await c.env.DB.prepare(
                "UPDATE users SET api_key = ? WHERE id = ?"
            ).bind(apiKey, user.id).run();

            return c.json({ message: "API key generated successfully", api_key: apiKey }, 200);
        } catch (error) {
            console.error("Error generating API key:", error);
            return c.json({ error: "Failed to generate API key" }, 500);
        }
    }
}
