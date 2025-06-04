# Guilty Spark

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node.js-%3E%3D22.11.0-brightgreen)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)

A powerful [Discord Bot](https://discord.com/oauth2/authorize?client_id=1290269474536034357) built on [Cloudflare Workers](https://developers.cloudflare.com/workers/) that seamlessly integrates Halo Infinite match statistics from Halo Waypoint with Discord communities. The bot specializes in working with NeatQueue-managed custom game series, providing automated statistics posting and detailed match analysis.

## 🎥 Demo

| Stats Command                                                    | NeatQueue Integration                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ![Stats Command Demo](docs/recording-20250604-stats-command.gif) | ![NeatQueue Integration Demo](docs/recording-20250604-neatqueue-integration.gif) |

## ✨ Features

- **🎮 Halo Infinite Stats Integration**: Pull match statistics directly from Halo Waypoint
- **🤖 NeatQueue Integration**: Automated webhook-based stats posting for custom game series
- **🔗 Discord-Halo Account Linking**: Connect Discord users to their Xbox gamertags
- **📊 Rich Match Embeds**: Beautiful, game-mode-specific stat displays
- **⚙️ Comprehensive Setup System**: Interactive configuration for servers and NeatQueue integration
- **🔄 Automated Workflows**: Automatic stats posting when matches complete
- **🛡️ Privacy-Aware**: Respects Halo Waypoint privacy settings

## 🚀 Quick Start

### Add to Your Discord Server

[**Invite Guilty Spark**](https://discord.com/oauth2/authorize?client_id=1290269474536034357) to your Discord server with the necessary permissions.

### Basic Setup

1. **Configure the bot**: Use `/setup` to configure server settings and NeatQueue integration
2. **Link accounts**: Users can use `/connect` to link their Discord accounts to Xbox gamertags
3. **Pull stats**: Use `/stats` commands to retrieve match statistics

## 📋 Commands

### `/stats` - Retrieve Match Statistics

The stats command supports multiple modes for retrieving Halo match data:

#### `/stats neatqueue [channel] [queue_number]`

Retrieves statistics for a completed NeatQueue series. Both channel and queue number parameters are optional:

```
/stats neatqueue                 # Uses current channel and most recent queue
/stats neatqueue #results        # Uses specified channel and most recent queue
/stats neatqueue 777             # Uses current channel and specified queue number
/stats neatqueue #results 777    # Uses specified channel and queue number
```

**Process Flow:**

1. Searches the specified Discord channel for NeatQueue results with the given queue number
2. Extracts participating Discord users from the NeatQueue message
3. Attempts to match Discord users to Xbox gamertags using:
   - Previously linked accounts via `/connect`
   - Discord username matching
   - Discord display name matching
4. Queries Halo Waypoint for recent custom games involving matched players
5. Filters matches to find games with all participating players
6. Retrieves detailed statistics for each match in the series
7. Displays comprehensive match and series statistics

#### `/stats match <match_id>`

Retrieves statistics for a specific Halo match:

```
/stats match 12345678-1234-1234-1234-123456789abc
```

**Process Flow:**

1. Queries Halo Waypoint for the specified match ID
2. Retrieves detailed match statistics and player performance
3. Displays match-specific embed with game mode appropriate statistics

### `/connect` - Link Discord to Xbox Account

Allows users to link their Discord account to their Xbox gamertag for automatic stat retrieval:

**Features:**

- **Search Integration**: Search for Xbox gamertags by name
- **Account Verification**: Confirm the correct Xbox account before linking
- **Link Management**: Update or remove existing account links
- **Privacy Handling**: Gracefully handles accounts with restricted privacy settings

**Usage Flow:**

1. User runs `/connect`
2. Bot presents account linking options
3. User can search for their gamertag or confirm suggested matches
4. Account association is stored for future automatic stat retrieval

### `/setup` - Server Configuration

Comprehensive server setup and configuration system with interactive menus:

#### Stats Display Configuration

- **Series Only**: Display only series overview statistics
- **Series and Games**: Show both series overview and individual match details

#### NeatQueue Integration Setup

Configure automated stats posting for NeatQueue-managed series:

**Configuration Options:**

- **Webhook Secret**: Secure webhook authentication
- **Queue Channel**: Channel where NeatQueue manages queues
- **Results Channel**: Channel where match results are posted
- **Display Mode**: Choose how stats are posted:
  - Threaded replies to results messages
  - New messages in results channel
  - New messages in a dedicated stats channel

**Automated Workflow:**

1. NeatQueue sends webhook messages for various events (series started, teams created, series completed)
2. Guilty Spark automatically retrieves match statistics
3. Posts formatted stats according to configured display mode
4. Supports multiple queue channels per server

## 🛠️ Development Setup

### Prerequisites

- Node.js ≥ 22.11.0
- Cloudflare account with Workers and D1 access
- Discord application with bot token

### Local Development

1. **Clone the repository**:

   ```bash
   git clone https://github.com/davidhouweling/guilty-spark.git
   cd guilty-spark
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure environment**:

   - Follow [Discord/Cloudflare sample app guide](https://github.com/discord/cloudflare-sample-app) for initial setup
   - Create `.dev.vars` file with required environment variables
   - Set up Cloudflare D1 database and KV namespace

4. **Register Discord commands**:

   ```bash
   npm run register
   ```

5. **Start development server**:

   ```bash
   npm start
   ```

6. **Set up ngrok tunnel** (for webhook testing):
   ```bash
   npm run ngrok
   ```

## 🤝 NeatQueue Integration

Guilty Spark provides deep integration with NeatQueue for match/series management:

### Configuration Requirements

1. Set up webhook in NeatQueue pointing to your Guilty Spark instance
2. Configure webhook secret for security
3. Map NeatQueue channels to Discord channels
4. Choose appropriate display mode for stats posting

## 🔒 Privacy & Security

### Data Handling

- Minimal data collection focused on functionality
- Respects Halo Waypoint privacy settings
- Secure webhook authentication with HMAC
- No storage of sensitive Xbox authentication tokens

### Privacy Controls

- Users control their own account linking
- Graceful handling of private Halo profiles
- Option to remove account associations

## 🆘 Support & Community

### Getting Help

- **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/davidhouweling/guilty-spark/issues)
- **Discussions**: Join community discussions for support and feature requests

### Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests for any improvements.

### License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📚 Additional Resources

### Documentation

- [Terms of Service](./TERMS_OF_SERVICE.md) - Legal terms for using Guilty Spark
- [Privacy Policy](./PRIVACY_POLICY.md) - How we handle your data
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/) - Platform documentation
- [Discord API Docs](https://discord.com/developers/docs) - Discord development resources

### Related Projects

- [NeatQueue](https://neatqueue.com/) - Tournament management system
- [Halo Infinite API](https://github.com/dgreene1/halo-infinite-api) - Halo Waypoint API wrapper

---

**Made with ❤️ for the Halo community**

_Guilty Spark is not affiliated with Microsoft, 343 Industries, or Halo. All trademarks are property of their respective owners._
