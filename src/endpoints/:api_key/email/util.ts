import axios from "axios";

// **获取 OAuth Access Token**
export async function getAccessToken(provider: string, client_id: string, client_secret: string, refresh_token: string): Promise<string> {
    try {
        let tokenUrl;
        let requestData;

        if (provider === "gmail") {
            tokenUrl = "https://oauth2.googleapis.com/token";
            requestData = new URLSearchParams({
                client_id,
                client_secret,
                grant_type: "refresh_token",
                refresh_token,
            });
        } else if (provider === "outlook") {
            tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
            requestData = new URLSearchParams({
                client_id,
                client_secret,
                grant_type: "refresh_token",
                refresh_token,
                scope: "https://graph.microsoft.com/.default",
            });
        } else if (provider === "microsoft_personal") {
            tokenUrl = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
            requestData = new URLSearchParams({
                client_id,
                client_secret,
                grant_type: "refresh_token",
                refresh_token,
                scope: "https://graph.microsoft.com/Mail.Send offline_access",
            });
        } else {
            throw new Error("Unsupported email provider");
        }

        const response = await axios.post(tokenUrl, requestData, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });

        return response.data.access_token;
    } catch (error) {
        console.error("Failed to get OAuth access token:", error.response?.data || error.message);
        throw new Error("OAuth token request failed");
    }
}

// **发送邮件**
export async function sendEmail(from: string, to: string, subject: string, body: string, accessToken: string, provider: string): Promise<void> {
    try {
        if (provider === "gmail") {
            const emailContent = createEmail(from, to, subject, body);

            await axios.post(
                "https://www.googleapis.com/gmail/v1/users/me/messages/send",
                { raw: emailContent },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                }
            );
        } else if (provider === "outlook" || provider === "microsoft_personal") {
            await axios.post(
                "https://graph.microsoft.com/v1.0/me/sendMail",
                {
                    message: {
                        subject,
                        body: { contentType: "Text", content: body },
                        toRecipients: [{ emailAddress: { address: to } }],
                    },
                    saveToSentItems: true,
                },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                }
            );
        } else {
            throw new Error("Unsupported email provider");
        }

        console.log("Email sent successfully!");
    } catch (error) {
        console.error("Error sending email:", error.response?.data || error.message);
        throw new Error("Failed to send email");
    }
}

// **构造 Gmail 邮件格式**
function createEmail(sender: string, recipient: string, subject: string, body: string): string {
    const email = [
        `From: ${sender}`,
        `To: ${recipient}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        body,
    ].join("\r\n");

    // 兼容 Cloudflare Workers 和浏览器环境
    const encodedEmail = new TextEncoder().encode(email);
    const base64Email = btoa(String.fromCharCode(...encodedEmail))
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    return base64Email;
}
