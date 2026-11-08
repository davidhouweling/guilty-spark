# Guilty Spark

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node.js-%3E%3D24.11.0-brightgreen)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)

Halo Infinite operations platform for Discord automation, NeatQueue workflows, and stream-ready web tracker overlays.

Official website: [guilty-spark.app](https://guilty-spark.app)

## Start Here

- Product overview, feature walkthroughs, and current UX live on [guilty-spark.app](https://guilty-spark.app)
- Add the bot to Discord: [Invite Guilty Spark](https://discord.com/oauth2/authorize?client_id=1290269474536034357&permissions=311385476096&integration_type=0&scope=bot+applications.commands)
- Report issues and request features: [GitHub Issues](https://github.com/davidhouweling/guilty-spark/issues)

## What Guilty Spark Does

- Discord-first Halo Infinite stats and workflow automation
- NeatQueue-aware series tracking and stats posting
- Live tracker and individual tracker web experiences
- OBS-friendly overlay URLs for stream production

For the latest UI flows and capability details, use the website as the source of truth.

## Core Commands

- `/setup` configures server behavior and NeatQueue integration
- `/connect` links a Discord user to an Xbox gamertag
- `/leaderboard show` posts a ranked leaderboard with queue, window, stat, and minimum-games filters
- `/leaderboard reset` sets a non-destructive leaderboard reset marker for a server or queue
- `/stats player` shows accumulated leaderboard stats and player relationships
- `/stats compare` compares two players' accumulated stats and head-to-head results
- `/stats neatqueue` resolves recent NeatQueue series stats
- `/stats match` retrieves a single match by match ID
- `/maps` generates HCS map sets
- `/track` manually starts live tracking for a queue

## Web Experiences

- `/leaderboard/:guildId` public server leaderboard
- `/leaderboard/:guildId/:queueId` public queue-scoped leaderboard
- `/stats/player/:gamertag` public player stats and relationship views
- `/stats/compare?gamertag=...` public comparison for one to eight players using repeated `gamertag` parameters
- `/tracker` live series view
- `/individual-tracker` tracker management and overlay setup
- `/individual-tracker/:trackerId` public tracker viewer
- `/u/:gamertag` player follow view

Public stats pages use gamertags for display and URLs. Leaderboard pages support rolling windows, queue scope, stat selection, and minimum-games filtering. The compare page supports one player for aggregate stats, two-player head-to-head summaries, and multi-player head-to-head matrices.

These experiences evolve frequently. Refer to [guilty-spark.app](https://guilty-spark.app) for current screenshots, copy, and usage guidance.

## Development

### Prerequisites

- Node.js 24.11.0 or newer
- Cloudflare account (Workers + D1)
- Discord application and bot token

### Local Setup

```bash
git clone https://github.com/davidhouweling/guilty-spark.git
cd guilty-spark
npm install
npm run register
npm start
```

Environment and platform setup references:

- [Discord + Cloudflare sample app guide](https://github.com/discord/cloudflare-sample-app)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)

## Workspace Layout

- `api/` Cloudflare Worker API, Discord bot commands, Durable Objects
- `pages/` Astro + React website and overlay surfaces
- `shared/` shared contracts, types, and utilities

## Common Scripts

```bash
npm start                # API + Pages dev servers
npm test                 # All tests
npm run typecheck        # Typecheck all workspaces
npm run lint             # Lint all workspaces
npm run done             # Format + typecheck + lint + test
```

## Policies and Legal

- [Terms of Service](./TERMS_OF_SERVICE.md)
- [Privacy Policy](./PRIVACY_POLICY.md)
- [License (MIT)](./LICENSE)

## Related Links

- [NeatQueue](https://neatqueue.com/)
- [Halo Infinite API](https://github.com/dgreene1/halo-infinite-api)

Guilty Spark is not affiliated with Microsoft, Halo Studios, or Halo. All trademarks are property of their respective owners.
