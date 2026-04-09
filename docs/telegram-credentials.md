# Telegram token and target IDs

This project needs a Telegram bot token and a delivery target before it can send notifications.

## 1. Create the bot and get the token

1. Open Telegram and start a chat with `@BotFather`.
2. Run `/newbot`.
3. Pick a display name for the bot.
4. Pick a username that ends with `bot`, for example `codexNotifierBot`.
5. Copy the token from BotFather's reply.

The token is the value for `TELEGRAM_BOT_TOKEN`.

If you ever need to rotate it later, open `@BotFather` again and run `/token`.

## 2. Get the chat ID for direct messages

1. Open a direct chat with your bot.
2. Send any message to it, for example `/start`.
3. Call the Bot API:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
```

4. Find the latest update and copy `message.chat.id`.

Example shape:

```json
{
  "message": {
    "chat": {
      "id": 123456789,
      "type": "private"
    }
  }
}
```

Use that number as `TELEGRAM_CHAT_ID`.

## 3. Get the chat ID for groups or channels

For groups or supergroups:

1. Add the bot to the target group.
2. Send a message the bot can see in that group.
3. Run the same `getUpdates` request.
4. Copy `message.chat.id`.

Group and supergroup IDs are usually negative numbers such as `-1001234567890`. Keep the minus sign.

For channels:

1. Add the bot to the channel and give it permission to post.
2. If the channel has a public username, you can set `TELEGRAM_CHAT_ID` to `@channelusername`.
3. If you prefer the numeric ID, trigger an update the bot can see and copy the `chat.id` value from `getUpdates`.

## 4. Optional: get the topic/thread ID

Only do this if you use Telegram topics in a forum-style group.

1. Open the target topic.
2. Send a message in that topic.
3. Run:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
```

4. Copy `message.message_thread_id`.

Save that value as `TELEGRAM_THREAD_ID`.

## 5. Store the values locally

You can export them in your shell:

```bash
export TELEGRAM_BOT_TOKEN="123456:replace-me"
export TELEGRAM_CHAT_ID="123456789"
export TELEGRAM_THREAD_ID=""
export NOTIFIER_AUTH_TOKEN="replace-me"
```

Or copy the same keys into a local `.env` file in the project root. The CLI auto-loads `.env` and `.env.local`.

## 6. Verify the configuration

Once the values are set, send a test message:

```bash
codex-telegram-notifier send \
  --status success \
  --title "Telegram notifier check" \
  --message "Credentials are configured."
```

If Telegram accepts the request, the CLI prints a JSON response with `"ok": true`.

## 7. Next step

After your token and chat target work, see [docs/codex-integration.md](./codex-integration.md) for examples that show how Codex tasks and automations should send richer Telegram updates with summaries, results, blockers, and report paths.
