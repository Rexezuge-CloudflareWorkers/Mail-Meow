# OAuth2 Setup

Mail-Meow handles the OAuth2 authorization redirect and token exchange, but users still create their own OAuth app in the provider console.

## Google Gmail

1. Create an OAuth client in Google Cloud Console.
2. In Mail-Meow, create a `google-gmail / oauth2` connected application with the client ID and client secret.
3. Copy the generated redirect URI from the Mail-Meow application detail view.
4. Add that redirect URI to the Google OAuth client.
5. Start OAuth2 from Mail-Meow.

Required scope:

```text
https://www.googleapis.com/auth/gmail.send
```

Mail-Meow requests offline access and stores the refresh token encrypted.

## Microsoft Outlook

1. Create an app registration in Azure.
2. Choose personal Microsoft accounts if using Outlook.com, Hotmail, or Live accounts.
3. In Mail-Meow, create a `microsoft-outlook / oauth2` connected application with the client ID and client secret.
4. Copy the generated redirect URI from the Mail-Meow application detail view.
5. Add that redirect URI to the Azure app registration.
6. Start OAuth2 from Mail-Meow.

Required delegated permissions:

```text
Mail.Send
offline_access
```

Mail-Meow uses the `/consumers` Microsoft identity endpoint for personal Outlook accounts.
