# Discord Message Content Form Responses

Last Updated: 2026-07-30

This document is formatted as direct responses for the current Discord Request Intents form shown in docs/form.html.

## Application Details

### Field: What does your application do?

### Input name: application_description

Suggested response:

Guilty Spark is a Discord bot for Halo Infinite communities that automates NeatQueue custom-series workflows. It supports setup and configuration, account linking, automated series stats posting, manual queue stats lookup, and live series tracking. For NeatQueue-driven flows, the bot correlates queue and participant context from Discord messages with Halo statistics retrieval so communities can reliably recover series results and track in-progress games. It is purpose-built for custom game operations in Discord servers, including recovery paths when webhook or cached state is incomplete.

### Field: Do you have a public Privacy Policy telling your users about their data usage?

### Input name: application_privacy_policy_public

Suggested selection:

- Yes

Supporting links to keep on hand:

- Privacy policy page: https://guilty-spark.app/privacy-policy
- Terms page: https://guilty-spark.app/terms-of-service

## Privileged Gateway Intents

### Field: Which intents are you applying for?

Suggested selection:

- Message Content Intent

## Message Content Intent

### Field: Can users opt-out of having their message content data tracked?

### Input name: intents_gateway_message_content_opt_out_stored

Suggested selection:

- Yes

Rationale for reviewer consistency:

- Processing is limited to NeatQueue-related operational flows.
- Guild admins can disable NeatQueue-related features.
- Users can remove account linkage through the bot flow.

### Field: Are you storing message content data off-platform (outside of Discord)?

### Input name: intents_gateway_message_content_store_off_platform

Suggested selection:

- No

Rationale for reviewer consistency:

- Raw message content is not persisted off-platform.
- Persistent storage is limited to Cloudflare D1 records used for account linkage, configuration, and tracker/session features.
- Observability is handled via Cloudflare observability tooling for operational monitoring.

### Field: Will the message content data be used to train machine learning or AI Models?

### Input name: intents_gateway_message_content_ai_training

Suggested selection:

- No

### Field: Why do you need the Message Content intent?

### Input name: intents_gateway_message_content_use_case_description

Suggested response:

Guilty Spark needs Message Content for a narrow operational use case tied to NeatQueue-managed Halo custom series. NeatQueue result and active-queue messages contain the queue and participant context needed to reliably resolve which series a user is requesting. This is required for automated stats posting, manual stats recovery through /stats neatqueue (including historical queue lookups), and live-tracker discovery/recovery when deterministic state is incomplete.

Interactions and webhooks alone are not sufficient for these workflows. Webhooks signal that events occurred, but the bot must still correlate to the authoritative Discord message context users and channels are operating in. To minimize access, Guilty Spark uses deterministic state/cache lookup first and keeps Discord lookup as bounded fallback behavior only when needed for reliability.

### Field: Please provide links to screenshots and/or videos that demonstrate your use case

### Input name: intents_gateway_message_content_use_case_supplemental_material_description

Suggested response:

Primary demo video:
https://1drv.ms/v/c/8d269e024aa96471/IQDrU_R23BtzQZfJCBTCLONuAftfEnDylWZS3uwGofrm3uo

Public policy links:

- https://guilty-spark.app/privacy-policy
- https://guilty-spark.app/terms-of-service

Implementation references:

- Stats command: https://github.com/davidhouweling/guilty-spark/blob/main/api/commands/stats/stats.ts
- Connect unlink flow: https://github.com/davidhouweling/guilty-spark/blob/main/api/commands/connect/connect.ts
- Webhook route registration: https://github.com/davidhouweling/guilty-spark/blob/main/api/server.ts
- Discord retrieval/cache logic: https://github.com/davidhouweling/guilty-spark/blob/main/api/services/discord/discord.ts
- Live tracker orchestration: https://github.com/davidhouweling/guilty-spark/blob/main/api/services/live-tracker/live-tracker.ts

## Final Pre-Submit Checks

- Confirm the Privacy Policy URL in the Discord Developer Portal exactly matches https://guilty-spark.app/privacy-policy.
- Confirm all shared media links are publicly viewable without login barriers for reviewers.
- Confirm selections are consistent with policy language: no AI training use, no off-platform persistence of raw message content, and public policy availability.
