# Microsoft 365 Personal Account OAuth Setup

## Overview
Mail Meow now supports Microsoft 365 personal accounts (outlook.com, hotmail.com, live.com) for sending emails through the Microsoft Graph API.

## Setting up M365 OAuth App

1. **Register an Application**
   - Go to [Azure App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
   - Click "New registration"
   - Name: "Mail Meow"
   - Supported account types: "Personal Microsoft accounts only"
   - Redirect URI: `https://login.microsoftonline.com/common/oauth2/nativeclient`

2. **Configure API Permissions**
   - Go to "API permissions"
   - Add permission → Microsoft Graph → Delegated permissions
   - Add: `Mail.Send` and `offline_access`
   - Grant admin consent (if required)

3. **Create Client Secret**
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Copy the secret value (you won't see it again)

4. **Get Refresh Token**
   - Use the authorization code flow to get a refresh token
   - Authorization URL: `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize`
   - Token URL: `https://login.microsoftonline.com/consumers/oauth2/v2.0/token`
   - Scope: `https://graph.microsoft.com/Mail.Send offline_access`

## Using with Mail Meow

```bash
# Bind M365 OAuth
curl -X POST "https://api.mailmeow.com/api/{api_key}/oauth" \
-H "Content-Type: application/json" \
-d '{
  "provider": "m365",
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "refresh_token": "your_refresh_token"
}'

# Send email using M365
curl -X POST "https://api.mailmeow.com/api/{api_key}/email" \
-H "Content-Type: application/json" \
-d '{
  "to": "recipient@example.com",
  "subject": "Hello from M365!",
  "text": "This email was sent via Microsoft Graph API",
  "provider": "m365"
}'
```

## Key Differences from Outlook

- **Endpoint**: Uses `/consumers` tenant instead of `/common`
- **Scope**: Uses specific `Mail.Send` permission instead of `.default`
- **Account Type**: Only supports personal Microsoft accounts
- **API**: Uses Microsoft Graph API (same as Outlook provider)
