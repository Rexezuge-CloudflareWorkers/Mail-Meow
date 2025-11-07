# Mail Meow 🐾📧

欢迎来到 **Mail Meow**，一个超级可爱的邮件推送平台！(✧ω✧) 在这里，你可以轻松地通过 API 推送消息到目标邮箱地址，就像小猫轻轻地把邮件送到你的门口一样～🐱📬

## 功能介绍 🎉

- **创建 API Key**：用户可以生成自己的 API Key，方便管理和使用。(๑•̀ㅂ•́)و✧
- **OAuth 连接**：支持 Gmail、Outlook 和 Microsoft 个人账户的 OAuth 连接，安全又便捷！🔒✨
- **邮件推送**：通过简单的 POST API，你可以轻松推送消息到任何邮箱地址。📤💌

## 快速开始 🚀

1. **注册用户**：使用 `/api/user` 接口注册一个新用户。
2. **生成 API Key**：通过 `/api/user/api_key` 接口生成你的专属 API Key。
3. **绑定 OAuth**：使用 `/api/{api_key}/oauth` 接口绑定你的 Gmail 或 Outlook 账号。
4. **发送邮件**：通过 `/api/{api_key}/email` 接口发送你的第一封邮件！

## 示例代码 🐾

```bash
# 注册新用户
curl -X POST "https://api.mailmeow.com/api/user" \
-H "Content-Type: application/json" \
-d '{"email": "your_email@example.com", "password": "your_password"}'

# 生成 API Key
curl -X POST "https://api.mailmeow.com/api/user/api_key" \
-H "Content-Type: application/json" \
-d '{"email": "your_email@example.com", "password": "your_password"}'

# 绑定 OAuth (Gmail)
curl -X POST "https://api.mailmeow.com/api/{api_key}/oauth" \
-H "Content-Type: application/json" \
-d '{"provider": "gmail", "client_id": "your_client_id", "client_secret": "your_client_secret", "refresh_token": "your_refresh_token"}'

# 绑定 OAuth (Microsoft 个人账户)
curl -X POST "https://api.mailmeow.com/api/{api_key}/oauth" \
-H "Content-Type: application/json" \
-d '{"provider": "microsoft_personal", "client_id": "your_client_id", "client_secret": "your_client_secret", "refresh_token": "your_refresh_token"}'

# 发送邮件
curl -X POST "https://api.mailmeow.com/api/{api_key}/email" \
-H "Content-Type: application/json" \
-d '{"to": "recipient@example.com", "subject": "Hello Meow!", "text": "This is a test email from Mail Meow!"}'
```

## 贡献指南 🤝

我们欢迎任何形式的贡献！如果你有任何建议或发现 bug，请随时提交 issue 或 pull request。让我们一起让 Mail Meow 变得更棒吧！(๑•̀ㅂ•́)و✧

## 许可证 📜

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

---

**Mail Meow**，让你的邮件推送变得像小猫一样可爱！🐾💖
