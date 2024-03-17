## AI-powered Discord Bot SDK
This SDK enables developers to easily create and manage AI-powered Discord bots with GitHub integration capabilities.

## Features
- Create GitHub issues from Discord messages
- Update existing GitHub issues based on Discord activity
- Cache messages for context-aware interactions
- AI integration for natural language processing

## Usage

To interact with GitHub issues directly from Discord, include specific keywords in your messages:
- To **create a new issue**, use `createissue`.
- To **update an existing issue**, use `updateissue`.

**Note:** The detection of these keywords is not case-sensitive, meaning you can use `CREATEISSUE`, `createIssue`, `UPDATEISSUE`, or any other case variations, and the bot will still recognize your command.

## Prerequisites
- An account with [LLM Lab](https://intelligentiterations.com)
- A Discord bot token
    - your bot added to a Discord server with the necessary permissions.
- a GitHub personal access token.


## Quick Start

### Installation
```
npm install discord_chatbots
```

**To contribute**
```
git clone https://github.com/intelligent-iterations/discord_chatbots.git
```

__Configuring the Bot class__

initialize your bot with these values
```
const discordBotConfig = [
    {
        name: 'One of your user facing bots',
        token: process.env.DISCORD_PM_TOKEN,
        agentId: '0a6cd647-5f9d-4c63-912a-82079ecda0ab', ///you'll have to get this from the llm lab (see: additional set-up),
        showOpenIssues: true ///he will see all the github issues which are open
    },
///other bots u want to interact with
];
const projectConfig = {
    githubOrg: 'your-org-name',
    discordToGithubUsernames: { 'your_discord_username.': 'your_github_username', },
    updateIssuesBotId: "9148cda6-e7e7-4c70-a660-58e505840997",///you'll have to get this from the llm lab (see: additional set-up)
    maxMessageCacheLength: 10,
    iiKEY: process.env.II_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
}
const bots = discordBotConfig.map(config => new Bot(config, projectConfig));

bots.forEach(async bot => await bot.initialize());
```


## AI Setup

To use this SDK, you'll need to provides at least 1 agentId and updateIssuesBotId necessary for the SDK's AI configutation. 

## Update Issues Agent

> **Important:** This agent is responsible for formatting the data for the GitHub API. You can configure your agent with the following values in the lab:

- **Model**: `mistal-small`

#### Prompt Configuration:

```plaintext
Update the issue now by replying with one of these fields:name, description, assignees, status (open, closed), projects
and the updated value next to it in JSON format

Example format for assistant reply for the github API:{“name”: “chat list out of order”}

be brief and abide exactly by the provided options for possible values.
```


the ID of this agent with be passed as the value for updateIssuesBotId

### User facing agent
This will be the agent that will talk to your users, you can create however many you want and add them to the discordBotConfig list! 

Just get the agent id from the agent lab and assign it as the value for agentId
