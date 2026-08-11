// Registers the one application command the Discord Activity needs.
// Run: DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… node scripts/discord-register-command.mjs
//
// Why this exists: the Activity's live progress message is created by calling
// `shareInteraction({ command: "progress", … })`, which asks Discord to invoke
// one of *our* application commands on the player's behalf. Discord can only do
// that for a command that exists, so it has to be registered once against the
// app — and registering commands is the one Discord API call that needs a bot
// token rather than a user token.
//
// This is a bootstrap step, not part of any deploy. Run it once when setting the
// app up (and again only if the command's name or options change). The bot token
// is used here and nowhere else — it is NOT a Worker secret, and nothing in the
// running app has or needs one.
//
// It's idempotent: PUT replaces the app's whole command list with what's below,
// so running it twice leaves exactly one command either way.
//
// No new deps — Node's built-in fetch.

const appId = process.env.DISCORD_APP_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!appId || !botToken) {
  console.error(
    [
      "Both DISCORD_APP_ID and DISCORD_BOT_TOKEN are required.",
      "",
      "  DISCORD_APP_ID    — the app's Client ID (same value as VITE_DISCORD_CLIENT_ID)",
      "  DISCORD_BOT_TOKEN — Developer Portal → your app → Bot → Reset Token",
      "",
      "The bot token is only used by this script. Don't add it to .dev.vars or",
      "the Worker's secrets — nothing in the running app uses one.",
    ].join("\n"),
  );
  process.exit(1);
}

// Must match SHARE_COMMAND in src/discord/progress.ts and HANDLE_OPTION in
// worker/routes/discord.ts. The option carries the round's opaque handle, which
// is how the Worker knows which message a later edit belongs to.
const commands = [
  {
    name: "progress",
    // CHAT_INPUT. Invoked by the Activity through shareInteraction, not typed by
    // anyone — the description is what shows in the command list regardless.
    type: 1,
    description: "Share your Lunch Special progress in this channel",
    options: [
      {
        name: "handle",
        type: 3, // STRING
        description: "Internal round id",
        required: true,
      },
    ],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  // Status and body: unlike the Worker's logs this is your own terminal, and
  // Discord's validation errors are the useful part of a failed registration.
  console.error(`Discord refused the registration (${res.status}):`);
  console.error(await res.text());
  // exitCode rather than exit(): calling process.exit() while the fetch's
  // handles are still settling trips a libuv assertion on Windows and reports
  // 127 instead of the failure we meant.
  process.exitCode = 1;
}

if (res.ok) {
  const registered = await res.json();
  console.log(`Registered ${registered.length} command(s):`);
  for (const cmd of registered) console.log(`  /${cmd.name} — ${cmd.description}`);
  console.log("\nNext: set the Interactions Endpoint URL in the Developer Portal to");
  console.log("  https://lunchspecial.app/api/discord/interactions");
  console.log("Discord validates it on save with a deliberately bad signature and expects a 401.");
}
