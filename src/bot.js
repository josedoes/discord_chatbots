import dotenv from 'dotenv';
dotenv.config();
import { Client, Intents } from 'discord.js';
import { fetchData } from './ii-sdk.js';
import { fetchGithubIssuesForUser } from './github_service.js';

const iiKEY = process.env.II_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const botConfigs = [
    {
        name: 'Project Manager',
        token: process.env.DISCORD_PM_TOKEN,
        ii_id: 'ee135f4e-d614-4dd1-9f26-9df83e35a7bc',
        showOpen: true
    },
    {
        name: 'Banana',
        token: process.env.DISCORD_BANANA_TOKEN,
        ii_id: '57b2d811-a69b-4597-af51-148e94c823cc',
        showOpen: false

    }
];
function createBot(config) {
    const client = new Client({
        intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
    });

    // Use the configuration for the bot
    const { token } = config;

    const channelMessageHistory = new Map(); // Map to store message history for each channel
    const githubIssues = new Map();

    // Bot ready event
    client.once('ready', () => {
        console.log('Bot is online and ready to serve!');
    });

    // Message event
    client.on('messageCreate', async message => {
        let channelHistory;
        const isUserMessage = !message.author.bot;
        if (isUserMessage) {
            console.log(`Message received from ${message.author.username}: ${message.content}`);
            if (!channelMessageHistory.has(message.channel.id)) {
                channelMessageHistory.set(message.channel.id, []);
            }
            try {
                const currentHistoryLength = channelMessageHistory.get(message.channel.id).length;
                const fetchAmount = 20 - currentHistoryLength;
                if (fetchAmount > 0) {
                    const fetchedMessages = await message.channel.messages.fetch({ limit: fetchAmount });
                    const initialMessages = fetchedMessages.map(msg => ({ role: 'user', content: `${msg.author.username}: ${msg.content}` }));
                    channelMessageHistory.get(message.channel.id).unshift(...initialMessages.reverse()); // Prepend the fetched messages
                }
            } catch (error) {
                console.error('Error fetching initial messages:', error);
            }

            channelHistory = channelMessageHistory.get(message.channel.id);
            channelHistory.push({ role: 'assistant', content: `${message.content}` });
            if (channelHistory.length > 20) {
                channelHistory.splice(0, channelHistory.length - 20);
            }
        }
        const botWasMentioned = message.mentions.users.has(client.user.id);
        console.log('bot was mentioned:', botWasMentioned)
        if (botWasMentioned) {
            const issues = await getIssues(githubIssues, message.author.username, config.showOpen);
            console.log(
                'issues gotten:', issues
            )
            const promptMessageHistory = [
                ...channelHistory,
                { 'role': 'assistant', 'content': `LIST OF TASKS THE USER NEEDS TO COMPLETE:\n${issues}\n` },

                {
                    "role": "user",
                    "content": message.content
                },

            ];
            console.log('sending:', promptMessageHistory)
            let result = await fetchData(iiKEY, config.ii_id, promptMessageHistory);

            // Ensure handling of result and errors appropriately
            message.channel.send(result).then(() => {
                console.log('Response sent successfully.');
            }).catch(error => {
                console.error('An error occurred while sending the response:', error);
            });
        }
    });

    // Error event
    client.on('error', error => {
        console.error('The bot encountered an error:', error);
    });

    // Login the bot
    client.login(token).then(() => {
        console.log(`${config.name} has logged in successfully.`);
    }).catch(error => {
        console.error(`${config.name} login failed:`, error);
    });
}


botConfigs.forEach(config => {
    createBot(config);
});

function formatMessageHistory(messages) {
    return messages.map(message => {
        // Remove the bot mention from the content
        const contentWithoutMention = message.content.replace(/<@\d+>\s*/, '');
        const role = message.user === 'Project Manager' ? 'assistant' : 'user';
        const prefix = role === 'user' ? `${message.user}: ` : '';
        return {
            role: role,
            content: `${prefix}${contentWithoutMention}`
        };
    });
}
async function getIssues(issuesCache, sender, onlyOpen) {
    const usernames = { 'lucystag': 'luciana-lara', 'joselolol.': 'joselaracode', 'strawberry_milks_': 'lealari', 'marilara33': 'marianalara33' };
    const username = usernames[sender];
    try {
        if (!username) {
            return 'Username mapping not found.';
        }
        const openCacheKey = `open-issues-${username}`;
        const closedCacheKey = `closed-issues-${username}`;
        if (!issuesCache.has(openCacheKey) || !issuesCache.has(closedCacheKey)) {
            const issues = await fetchGithubIssuesForUser('intelligent-iterations', GITHUB_TOKEN, username);
            const openIssues = issues.filter(issue => issue.state === 'open');
            const closedIssues = issues.filter(issue => issue.state === 'closed');
            const openIssueMessages = openIssues.map(issue => `${issue.title}: ${issue.html_url}`).join('\n');
            const closedIssueMessages = closedIssues.map(issue => `${issue.title}: ${issue.html_url}`).join('\n');
            issuesCache.set(openCacheKey, openIssueMessages);
            issuesCache.set(closedCacheKey, closedIssueMessages);
            return `Open issues:\n${openIssueMessages || 'No open issues.'}\n\nClosed issues:\n${closedIssueMessages || 'No closed issues.'}`;
        } else {
            const openIssues = issuesCache.get(openCacheKey);
            const closedIssues = issuesCache.get(closedCacheKey);
            const finalIssues = onlyOpen ? `${openIssues}` : `${closedIssues}`
            const prefix = onlyOpen ? `Open issues` : `Closed issues`
            return `${prefix}:\n${finalIssues || 'No issues.'}`;
        }
    } catch (error) {
        console.error('Error fetching GitHub issues:', error);
        return 'Failed to fetch issues.';
    }
}


