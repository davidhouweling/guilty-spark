# Guilty Spark

A Discord App that allows for stats to be pulled for Halo games played in a custom games series.

> [!WARNING]  
> This is a functional proof of concept.

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
3. Make a copy of `.env.sample` and name it `.env`
   a. Follow the steps in Discord's Developer Documentation for Creating your first app to set the respective `DISCORD_API_*` variables in the `.env` file... you'll also need to hook up the Discord app you just created to a server
   b. Use a spare Microsoft account (or create one) which has also been set up to have an xbox gamer tag and has accessed Halo Waypoint before... then add the username and password to the `XBOX_*` variables in the `.env` file
4. In terminal do `npm install`
5. In terminal do `npm start`

## How does it work?

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
