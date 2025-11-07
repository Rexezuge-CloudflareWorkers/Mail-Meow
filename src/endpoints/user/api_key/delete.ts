import { OpenAPIRoute } from "chanfana";
import { comparePassword } from "../../../utils";


export class DeleteApiKey extends OpenAPIRoute {
    schema = {
        tags: ["User/API_Key"],
        summary: "Delete the user's API Key",
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: { type: "object", properties: {
                            email: { type: "string", format: "email" },
                            password: { type: "string", minLength: 6 }, // 确保密码最少6位
                        }, required: ["email", "password"] },
                    },
                },
            },
        },
        responses: {
            "200": { description: "API key deleted successfully" },
            "400": { description: "Invalid request body" },
            "401": { description: "Invalid email or password" },
            "404": { description: "API key not found" },
            "500": { description: "Failed to delete API key" },
        },
    };

    async handle(c) {
        try {
            // 解析 JSON 请求体
            const requestBody = await c.req.json();
            if (!requestBody?.email || !requestBody?.password) {
                return c.json({ error: "Invalid request body" }, 400);
            }

            // 校验数据格式
            const validatedData = requestBody;
            const { email, password } = validatedData;

            // 查询用户信息，仅获取第一个匹配的用户
            const user = await c.env.DB.prepare(
                "SELECT id, password, api_key FROM users WHERE email = ? LIMIT 1"
            ).bind(email).first();

            // 如果用户不存在
            if (!user) {
                return c.json({ error: "Invalid email or password" }, 401);
            }

            // 校验密码
            const isMatch = await comparePassword(password, user.password);
            if (!isMatch) {
                return c.json({ error: "Invalid email or password" }, 401);
            }

            // 检查 API Key 是否存在
            if (!user.api_key) {
                return c.json({ error: "API key not found" }, 404);
            }

            // 更新数据库，删除 API Key
            await c.env.DB.prepare(
                "UPDATE users SET api_key = NULL WHERE id = ?"
            ).bind(user.id).run();

            return c.json({ message: "API key deleted successfully" }, 200);
        } catch (error) {
            if (error instanceof Error) {
                return c.json({ error: "Invalid input data", details: error.errors }, 400);
            }
            console.error("Error deleting API key:", error);
            return c.json({ error: "Failed to delete API key" }, 500);
        }
    }
}
