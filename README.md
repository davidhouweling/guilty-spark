# Guilty Spark

A [Discord App](https://discord.com/oauth2/authorize?client_id=1290269474536034357) utilizing [Cloudflare Workers](https://developers.cloudflare.com/workers/) that allows for stats to be pulled for Halo games played in a custom games series.

This Discord bot can pull stats from Halo Waypoint and post accordingly.

- Work with NeatQueue results

## How to use

```
/stats <channel where NeatQueue results live> <queue number>

# example: /stats #results 777
```

## Getting started locally

1. [Download and install node.js](https://nodejs.org/en/download/package-manager) if you haven't done already
2. Clone the repo (assuming you already know how)
3. Follow the instructions from [`discord/cloudflare-sample-app`](https://github.com/discord/cloudflare-sample-app)
   1. [Configuring project](https://github.com/discord/cloudflare-sample-app?tab=readme-ov-file#configuring-project)
   2. [Creating your Cloudflare worker](https://github.com/discord/cloudflare-sample-app?tab=readme-ov-file#creating-your-cloudflare-worker)
   3. [Running locally](https://github.com/discord/cloudflare-sample-app?tab=readme-ov-file#running-locally)

Now in a channel you can use `/stats` command.

## Commands explained

### `/stats neatqueue <channel> <queue number>`

As mentioned, this is presently a proof of concept and more can be done to improve it but as of now:

1. User sends slash command to Discord bot
2. Discord bot searches the Discord channel for NeatQueue messages and finds the one with the matching queue number
3. From the NeatQueue message, pull all the Discord users
4. Query Halo Waypoint endpoint to search for gamertags
   a. Tries with Discord username
   b. If unsuccessful, tries to Discord display name
   c. If still unsuccessful, disregard
5. Query Halo waypoint for custom games for matched users
   a. From step 4, it isn't guaranteed and a better solution can be built (this is okay for proof of concept)
   b. Privacy settings means that some users won't have matches found
6. Of the matches that have been found for players, filter to ones involving all players
   a. do additional filtering to ensure the most recent game has all the same players as every other game found
7. Pull stats for each match
8. Send back to Discord

### `/stats match <match id>`

1. User sends slash command to Discord bot
2. Pull stats for match
3. Send back to Discord

## Terms of Service

Please read our [Terms of Service](./TERMS_OF_SERVICE.md) for detailed information.

## Privacy Policy

Please read our [Privacy Policy](./PRIVACY_POLICY.md) for detailed information.
