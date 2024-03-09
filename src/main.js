import dotenv from 'dotenv';
dotenv.config();
import { Bot } from './bot.js';

const iiKEY = process.env.II_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const discordBotConfig = [
    {
        name: 'Project Manager',
        token: process.env.DISCORD_PM_TOKEN,
        agentId: '0a6cd647-5f9d-4c63-869a-82079ecda0ab',
        showOpenIssues: true
    },
    {
        name: 'Banana',
        token: process.env.DISCORD_BANANA_TOKEN,
        agentId: '57b2d811-a69b-4597-af51-148e94c823cc',
        showOpenIssues: false

    }
];
const projectConfig = {
    githubOrg: 'intelligent-iterations',
    discordToGithubUsernames: { 'joselolol.': 'joselaracode', 'strawberry_milks_': 'lealari', 'marilara33': 'marianalara33', 'lucystag': 'luciana-lara' },
    updateIssuesBotId: "9148cda6-e7e7-4c70-a660-58e505840997",
    maxMessageCacheLength: 10,
    iiKEY: iiKEY,
    GITHUB_TOKEN: GITHUB_TOKEN,
}
const bots = discordBotConfig.map(config => new Bot(config, projectConfig));

bots.forEach(async bot => await bot.initialize());