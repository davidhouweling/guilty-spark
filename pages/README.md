# Guilty Spark Web

Official landing page for [Guilty Spark](https://github.com/davidhouweling/guilty-spark) - A Discord bot that brings Halo Infinite statistics to your server.

**Live Site**: [https://guilty-spark.app](https://guilty-spark.app)

## Development Modes

The website supports two modes for development and testing, allowing you to work with either simulated data or real backend WebSocket connections.

### Fake Mode

Runs with mock WebSocket connections, allowing development without a real API server. Uses pre-defined sample scenarios with simulated live tracker data.

```bash
# Start in fake mode (explicitly set MODE)
npm start -- --mode=fake
```

**How it works**:
- When `import.meta.env.MODE` is `"fake"` or `"test"`, the app uses `FakeLiveTrackerService` instead of `RealLiveTrackerService`
- Mock WebSocket connection simulates messages with configurable intervals
- Sample scenarios defined in `src/services/live-tracker/fakes/scenario.ts`
- No backend API required

### Real Mode (Default)

Connects to an actual Guilty Spark API backend via WebSocket for live data.

```bash
# Start in real mode (default)
npm start
```

**Prerequisites**: 
- API server running (configure via `PUBLIC_API_HOST` env var)
- WebSocket endpoint: `ws://[host]/ws/tracker/{guildId}/{queueNumber}`

**Configuration**:
Edit `.env.development` to set the API host:
```bash
# Local development
PUBLIC_API_HOST=localhost:8787

# Or use production
PUBLIC_API_HOST=api.guilty-spark.app
```

**How it works**:
- Astro defaults to `MODE="development"`, which triggers real mode
- `installServices()` returns `RealLiveTrackerService` that creates actual WebSocket connections
- Connects to backend at configured `PUBLIC_API_HOST`
