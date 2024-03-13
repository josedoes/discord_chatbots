import dotenv from 'dotenv';
dotenv.config();
import { Bot } from '../src/bot.js';

const discordBotConfig = [
    {
        name: 'One of your user facing bots',
        token: process.env.DISCORD_PM_TOKEN,
        agentId: 'your_agent_id', ///you'll have to get this from the llm lab (see: additional set-up),
        showOpenIssues: true ///he will see all the github issues which are open
    },
    ///other bots u want to interact with
];
const projectConfig = {
    githubOrg: 'your-org',
    discordToGithubUsernames: { 'a-discord-username': 'a-github-username', },
    updateIssuesBotId: "your_update_issues_agent_id",///you'll have to get this from the llm lab (see: additional set-up)
    maxMessageCacheLength: 10,
    iiKEY: process.env.II_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
}
const bots = discordBotConfig.map(config => new Bot(config, projectConfig));

bots.forEach(async bot => await bot.initialize());

