import { OpenAPIRoute } from "chanfana";

import { apiKeyParam } from "../param";

export class RebindOAuth extends OpenAPIRoute {
    schema = {
        tags: ["OAuth"],
        summary: "Rebind OAuth credentials for sending emails",
        parameters: [apiKeyParam],
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                provider: { type: "string", enum: ["gmail", "outlook", "microsoft_personal"] },
                                client_id: { type: "string" },
                                client_secret: { type: "string" },
                                refresh_token: { type: "string" },
                            },
                            required: ["provider", "client_id", "client_secret", "refresh_token"],
                        },
                    },
                },
            },
        },
        responses: {
            "200": { description: "OAuth credentials rebound successfully" },
            "400": { description: "Invalid request body" },
            "401": { description: "Invalid API key" },
            "500": { description: "Failed to rebind OAuth credentials" },
        },
    };

    async handle(c) {
        try {
            // 获取 API Key
            const api_key = c.req.param("api_key");
            if (!api_key) {
                return c.json({ error: "API key is required" }, 400);
            }

            // 解析请求体
            const requestBody = await c.req.json();
            if (!requestBody || Object.keys(requestBody).length === 0) {
                return c.json({ error: "Invalid request body" }, 400);
            }

            // 校验数据格式
            const validatedData = requestBody;
            const { provider, client_id, client_secret, refresh_token } = validatedData;

            // 获取用户 ID
            const { results: userResults } = await c.env.DB.prepare(
                "SELECT id FROM users WHERE api_key = ?"
            ).bind(api_key).all();

            if (userResults.length === 0) {
                return c.json({ error: "Invalid API key" }, 401);
            }

            const user_id = userResults[0].id;

            // 检查是否已存在 OAuth 记录
            const { results: oauthResults } = await c.env.DB.prepare(
                "SELECT id FROM oauth WHERE user_id = ? AND provider = ?"
            ).bind(user_id, provider).all();

            if (oauthResults.length > 0) {
                // 更新 OAuth 记录
                await c.env.DB.prepare(
                    "UPDATE oauth SET client_id = ?, client_secret = ?, refresh_token = ? WHERE user_id = ? AND provider = ?"
                ).bind(client_id, client_secret, refresh_token, user_id, provider).run();
            } else {
                // 重新绑定时如果没有现有记录，则插入新记录
                await c.env.DB.prepare(
                    "INSERT INTO oauth (user_id, provider, client_id, client_secret, refresh_token) VALUES (?, ?, ?, ?, ?)"
                ).bind(user_id, provider, client_id, client_secret, refresh_token).run();
            }

            return c.json({ message: "OAuth credentials rebound successfully" }, 200);
        } catch (error) {
            if (error instanceof Error) {
                return c.json({ error: "Invalid input data", details: error.errors }, 400);
            }
            console.error("Error rebinding OAuth:", error);
            return c.json({ error: "Failed to rebind OAuth credentials" }, 500);
        }
    }
}
