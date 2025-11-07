# Microsoft Live Personal OAuth Setup Guide

This guide will help you set up OAuth for Microsoft personal accounts (Outlook.com, Hotmail.com, Live.com) to send emails through Mail Meow.

## Prerequisites

- A Microsoft personal account (Outlook.com, Hotmail.com, or Live.com)
- Access to Azure Portal or Microsoft App Registration Portal

## Step 1: Register Your Application

1. Go to [Azure Portal](https://portal.azure.com) or [Microsoft App Registration Portal](https://apps.dev.microsoft.com)
2. Sign in with your Microsoft account
3. Navigate to "App registrations" and click "New registration"
4. Fill in the application details:
   - **Name**: Your application name (e.g., "Mail Meow Personal")
   - **Supported account types**: Select "Personal Microsoft accounts only"
   - **Redirect URI**: Set to `https://login.microsoftonline.com/common/oauth2/nativeclient` (for testing)

## Step 2: Configure API Permissions

1. In your app registration, go to "API permissions"
2. Click "Add a permission"
3. Select "Microsoft Graph"
4. Choose "Delegated permissions"
5. Add the following permissions:
   - `Mail.Send` - Send mail as a user
   - `offline_access` - Maintain access to data you have given it access to

## Step 3: Generate Client Secret

1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Add a description and set expiration
4. Copy the secret value (you won't be able to see it again)

## Step 4: Get Authorization Code

1. Construct the authorization URL:
```
https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient&scope=https://graph.microsoft.com/Mail.Send%20offline_access&response_mode=query
```

2. Replace `YOUR_CLIENT_ID` with your actual client ID
3. Visit this URL in your browser
4. Sign in and grant permissions
5. Copy the authorization code from the redirect URL

## Step 5: Exchange Code for Refresh Token

Use this curl command to get your refresh token:

```bash
curl -X POST "https://login.microsoftonline.com/consumers/oauth2/v2.0/token" \
-H "Content-Type: application/x-www-form-urlencoded" \
-d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&code=YOUR_AUTHORIZATION_CODE&grant_type=authorization_code&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient&scope=https://graph.microsoft.com/Mail.Send offline_access"
```

## Step 6: Bind OAuth to Mail Meow

Use the Mail Meow API to bind your OAuth credentials:

```bash
curl -X POST "https://api.mailmeow.com/api/{api_key}/oauth" \
-H "Content-Type: application/json" \
-d '{
  "provider": "microsoft_personal",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "YOUR_REFRESH_TOKEN"
}'
```

## Step 7: Send Test Email

```bash
curl -X POST "https://api.mailmeow.com/api/{api_key}/email" \
-H "Content-Type: application/json" \
-d '{
  "to": "recipient@example.com",
  "subject": "Test from Mail Meow",
  "text": "Hello from Microsoft Personal account!"
}'
```

## Important Notes

- **Personal vs Work Accounts**: This setup is specifically for personal Microsoft accounts. For work/school accounts, use the regular "outlook" provider.
- **Token Endpoint**: Personal accounts use the `/consumers` endpoint instead of `/common`
- **Scopes**: Personal accounts require specific Graph API scopes
- **Rate Limits**: Microsoft Graph has rate limits for personal accounts

## Troubleshooting

### Common Issues

1. **Invalid Grant Error**: Make sure you're using the correct token endpoint (`/consumers` for personal accounts)
2. **Insufficient Privileges**: Ensure you've granted the `Mail.Send` permission
3. **Token Expired**: Refresh tokens for personal accounts may have longer expiration times

### Error Codes

- `AADSTS50020`: User account from identity provider does not exist in tenant
- `AADSTS65001`: The user or administrator has not consented to use the application

For more help, check the [Microsoft Graph documentation](https://docs.microsoft.com/en-us/graph/auth-v2-user).
