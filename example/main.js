import dotenv from 'dotenv';
dotenv.config();
import { Bot } from '../src/bot.js';

const iiKEY = process.env.II_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
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