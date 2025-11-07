import { OpenAPIRoute } from "chanfana";
import { hashPassword } from "utils";

export class RegisterUser extends OpenAPIRoute {
    schema = {
        tags: ["User"],
        summary: "Register a new user",
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
            "201": { description: "User registered successfully" },
            "400": { description: "User already exists" },
            "500": { description: "Internal Server Error" },
        },
    };

    async handle(c) {
        try {
            const requestBody = await c.req.json();
            if (!requestBody || !requestBody.email || !requestBody.password) {
                return c.json({ error: "Invalid request body" }, 400);
            }

            const { email, password } = requestBody;
            const passwordHash = await hashPassword(password);

            await c.env.DB.prepare(
                "INSERT INTO users (email, password) VALUES (?, ?)"
            ).bind(email, passwordHash).run();

            return c.json({ message: "User registered successfully" }, 201);
        } catch (error) {
            if (error.message.includes("UNIQUE constraint failed")) {
                return c.json({ error: "User already exists" }, 400);
            }
            return c.json({ error: "Internal Server Error", details: error.message }, 500);
        }
    }
}
