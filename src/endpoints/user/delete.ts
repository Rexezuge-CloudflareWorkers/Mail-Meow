import { OpenAPIRoute } from "chanfana";
import { comparePassword } from "utils";

export class DeleteUser extends OpenAPIRoute {
    schema = {
        tags: ["User"],
        summary: "Delete a user and associated OAuth credentials",
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
            "200": { description: "User deleted successfully" },
            "400": { description: "Invalid request body" },
            "401": { description: "Invalid email or password" },
            "404": { description: "User not found" },
            "500": { description: "Internal Server Error" },
        },
    };

    async handle(c) {
        try {
            const requestBody = await c.req.json();
            if (!requestBody || !requestBody.email || !requestBody.password) {
                return c.json({ error: "Invalid request body" }, 400);
            }

            // 校验数据格式
            const { email, password } = requestBody;

            // 获取用户信息
            const user = await c.env.DB.prepare(
                "SELECT id, password FROM users WHERE email = ?"
            ).bind(email).first();

            if (!user) {
                return c.json({ error: "User not found" }, 404);
            }

            // 校验密码
            const isPasswordValid = await comparePassword(password, user.password);
            if (!isPasswordValid) {
                return c.json({ error: "Invalid email or password" }, 401);
            }

            // 删除OAuth凭据
            await c.env.DB.prepare("DELETE FROM oauth WHERE user_id = ?").bind(user.id).run();

            // 删除用户
            await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();

            return c.json({ message: "User deleted successfully" }, 200);
        } catch (error) {
            return c.json({ error: "Internal Server Error", details: error.message }, 500);
        }
    }
}
