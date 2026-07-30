# Discord Message Content Evidence Pack

Last Updated: 2026-07-30

This document is the working checklist for the Discord Message Content privileged intent resubmission. It is meant to collect public links, capture steps, and implementation evidence that match the behavior currently shipped in Guilty Spark.

## Public Links

- Product site: https://guilty-spark.app
- Repository: https://github.com/davidhouweling/guilty-spark
- Privacy policy: https://guilty-spark.app/privacy-policy
- Terms of service: https://guilty-spark.app/terms-of-service
- Bot invite: https://discord.com/oauth2/authorize?client_id=1290269474536034357&permissions=311385476096&integration_type=0&scope=bot+applications.commands

## Evidence Assets

- Core demonstration video: https://1drv.ms/v/c/8d269e024aa96471/IQDrU_R23BtzQZfJCBTCLONuAftfEnDylWZS3uwGofrm3uo

## Submission Narrative

Guilty Spark uses Message Content only where it is necessary to make NeatQueue-driven stats and live-tracking workflows reliable for Discord communities running Halo Infinite custom series.

Primary necessity points:

- The bot must interpret NeatQueue result and active-queue messages to recover queue context and participant references.
- The bot must support near-real-time and historical `/stats neatqueue` lookups when users provide a queue number or rely on the most recent queue.
- The bot must support live-tracker discovery and recovery paths when webhook-provided state is incomplete or delayed.

Minimization and discoverability points already implemented:

- Deterministic state/cache lookup is preferred before Discord search fallback.
- Search is bounded fallback behavior, not the primary retrieval path.
- Active-queue cache behavior is best-effort and does not widen message access.
- Privacy policy language now names processed data, retention framing, deletion controls, and no general-purpose AI training.
- The website footer now links to the privacy policy and terms pages, giving the form a stable public URL to point at.

## Capture Matrix

### 1. Setup complexity flow

Goal: show that the bot is not a simple slash-command novelty and requires multi-step guild configuration.

Capture:

- `/setup` landing/configuration flow.
- NeatQueue integration options.
- Live-tracking toggle/options.
- Channel mapping or posting-mode configuration.

Expected proof points:

- Admin setup is required.
- NeatQueue integration is explicitly configured.
- Live tracking and stats delivery are operational guild features, not ad hoc one-off commands.

## 2. Happy-path webhook-driven stats flow

Goal: show the normal automated flow that the bot supports for completed series.

Capture:

- A NeatQueue result message landing in Discord.
- Guilty Spark posting or updating the series overview/stats response.
- If available, a follow-up match/game details view.

Expected proof points:

- Webhooks initiate the automation, but Guilty Spark still needs to read message content from the resulting Discord messages to reconstruct queue context reliably.
- The output is specific to the referenced series, not generic message reading.

## 3. Manual `/stats neatqueue` lookup flow

Goal: show that users can recover stats for a specific or recent queue after the original automated moment.

Capture:

- `/stats neatqueue` in the current channel.
- `/stats neatqueue` with explicit queue number.
- Returned series overview embed.

Expected proof points:

- Historical queue-number lookup depends on message-derived queue context.
- This is a user-requested recovery/usefulness path, not passive background reading.

## 4. Fallback/recovery flow

Goal: show why deterministic state alone is not always sufficient and why bounded Discord recovery is still needed.

Capture:

- A scenario where webhook/state lookup is missing, stale, or incomplete.
- The subsequent successful stats or tracker recovery path.

Expected proof points:

- The app first prefers persisted state/cache.
- Discord lookup remains necessary as a narrow reliability fallback.
- This fallback is bounded and purpose-specific.

## 5. Live-tracker discovery/recovery flow

Goal: show that live tracking depends on queue context during active series, including recovery paths.

Capture:

- Automatic or manual `/track` flow.
- Live tracker embed or queue-channel-name updates during an active series.
- A recovery/restart example if available.

Expected proof points:

- Live tracking is tied to NeatQueue series lifecycle.
- Queue discovery uses state-first logic with bounded fallback.

## 6. Deletion/privacy controls

Goal: show that data-handling disclosures and user controls match the implementation.

Capture:

- `/connect` unlink/remove flow.
- Public privacy policy.

Expected proof points:

- Users can remove Discord-to-Xbox linkage through the product.
- Public policy discloses retention framing, provider processing, and AI-training posture.

## 7. Privacy policy availability answer

Goal: answer the form question "Where is your Privacy Policy available?" with concrete, user-visible locations.

Capture:

- Website footer on `guilty-spark.app`.
- Direct policy page at `https://guilty-spark.app/privacy-policy`.
- Optional terms link at `https://guilty-spark.app/terms-of-service`.
- Discord app / bot listing privacy-policy URL if configured in the Developer Portal.

Expected proof points:

- The policy is visible from the public website, not only in source control.
- The policy has a stable page URL that can be entered into the submission form.
- The footer gives users a persistent in-site navigation path.

## Artifact Checklist

- [ ] Short setup video or screenshot sequence covering `/setup` and NeatQueue options.
- [ ] Screenshot/video of a completed-series automated stats post.
- [ ] Screenshot/video of `/stats neatqueue` manual retrieval.
- [ ] Screenshot/video of a fallback or recovery example.
- [ ] Screenshot/video of live-tracker behavior during an active series.
- [ ] Screenshot/video of unlink/remove association flow.
- [ ] Public privacy policy link verified.
- [ ] Footer link to privacy policy verified on the public website.
- [ ] Public links confirmed accessible while logged out.
- [ ] Demo video link verified and set to public viewer access.

## Supporting Implementation References

- Stats command surface: `api/commands/stats/stats.ts`
- Connect unlink flow: `api/commands/connect/connect.ts`
- NeatQueue webhook entrypoint: `api/server.ts`
- Discord retrieval/cache logic: `api/services/discord/discord.ts`
- Live tracker orchestration: `api/services/live-tracker/live-tracker.ts`

## Wiki-Navigable Source Links

Use these direct GitHub links in the wiki page so reviewers can jump from a claim to the source file immediately.

- Stats command surface: https://github.com/davidhouweling/guilty-spark/blob/main/api/commands/stats/stats.ts
- Connect unlink flow: https://github.com/davidhouweling/guilty-spark/blob/main/api/commands/connect/connect.ts
- NeatQueue webhook entrypoint: https://github.com/davidhouweling/guilty-spark/blob/main/api/server.ts
- Discord retrieval/cache logic: https://github.com/davidhouweling/guilty-spark/blob/main/api/services/discord/discord.ts
- Live tracker orchestration: https://github.com/davidhouweling/guilty-spark/blob/main/api/services/live-tracker/live-tracker.ts
- Privacy policy page source: https://github.com/davidhouweling/guilty-spark/blob/main/pages/src/pages/privacy-policy.astro
- Terms page source: https://github.com/davidhouweling/guilty-spark/blob/main/pages/src/pages/terms-of-service.astro
- Footer policy discoverability source: https://github.com/davidhouweling/guilty-spark/blob/main/pages/src/components/footer/footer.astro

## Packaging Notes

- Prefer short clips or tightly cropped screenshots focused on the exact feature behavior.
- Redact secrets, webhook secrets, tokens, and unrelated personal information.
- If Discord’s form requires public media links, upload captures to a stable location before submission and replace any temporary/private references in this checklist.
