# Discord Message Content Form Draft

Last Updated: 2026-07-25

This is a working draft for the privileged Message Content intent resubmission. The wording is aligned to the current code and privacy policy, but should be adapted to the exact Discord form fields at submission time.

## Short Summary

Guilty Spark is a Discord bot for Halo Infinite communities that integrates with NeatQueue-managed custom game series. It uses Message Content in a limited, feature-specific way to interpret NeatQueue result and active-queue messages so it can reliably provide automated stats, historical queue lookups, and live-tracker recovery for the exact series a guild is asking about.

## Why Message Content Is Needed

Guilty Spark needs Message Content because key series identifiers and participant references are conveyed through NeatQueue-authored Discord messages. Those messages are the authoritative bridge between Discord queue activity and the Halo match/statistics workflows that Guilty Spark performs.

Without Message Content access, the bot would lose the ability to reliably:

- recover queue context from NeatQueue result messages;
- support `/stats neatqueue` lookups for recent or historical queue numbers;
- recover active-series context for live tracking when deterministic state is unavailable or incomplete;
- map Discord queue participants to the correct Halo/Xbox stats workflow in the moment users request it.

## Why Interactions And Webhooks Alone Are Not Enough

Slash commands and webhooks are part of the system, but they are not sufficient on their own.

- Webhooks tell Guilty Spark that a NeatQueue event happened, but downstream reliability still depends on the actual Discord messages that represent results and active queue context.
- Users can request stats later with `/stats neatqueue`, including explicit historical queue numbers, which requires looking up the relevant queue context rather than relying on a one-time webhook event.
- Discord search indexing is not always immediate, so Guilty Spark now prefers deterministic cached/persisted state first and uses bounded Discord lookup only as a fallback.

## How Access Is Minimized

Guilty Spark minimizes Message Content usage in several ways:

- It is limited to specific NeatQueue-related workflows rather than broad general message ingestion.
- Deterministic state/cache lookup is attempted before Discord recovery/search paths.
- Fallback retrieval is bounded and purpose-specific.
- The bot does not use collected data to train general-purpose AI models.
- Public privacy policy disclosures now describe processed data categories, retention framing, provider processing, and deletion pathways.

## Where Is Your Privacy Policy Available?

The policy is available in multiple user-visible places:

- the public website footer on `https://guilty-spark.app`;
- the direct policy page at `https://guilty-spark.app/privacy-policy`;
- the Discord app / bot listing privacy-policy URL configured in the Developer Portal, if the reviewer checks the app metadata directly.

This lets users find the policy from the website itself and gives Discord reviewers a stable public URL to verify.

## Data Processed In These Flows

For the relevant workflows, Guilty Spark may process:

- Discord user, guild, channel, and message identifiers;
- command and interaction metadata;
- limited message content from NeatQueue-related messages where needed to determine queue context;
- Discord-to-Xbox linkage data used to fetch Halo statistics;
- operational logs/telemetry for reliability and debugging.

## Retention And User Controls

- Short-lived cache/state data is retained using explicit TTL-based windows.
- Queue-related transient state is generally retained only for short operational periods.
- Persistent linkage/configuration data is retained until changed, removed, or no longer needed.
- Users can remove Discord-to-Xbox linkage through the product’s unlink/remove flow.
- Broader deletion requests can be submitted through the project contact path documented in the privacy policy.

## Evidence To Attach

- Setup/configuration flow showing NeatQueue integration and live-tracking options.
- Automated completed-series stats flow.
- Manual `/stats neatqueue` lookup flow.
- Fallback/recovery example showing why narrow message-content access remains necessary.
- Live-tracker flow during an active series.
- Public privacy policy link.

## Reviewer Notes

If the form allows an additional notes field, emphasize that the recent implementation work reduced reliance on broader lookup behavior by preferring deterministic cache/state paths first, while preserving bounded recovery behavior needed for reliability.
