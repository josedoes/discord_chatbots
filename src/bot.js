import dotenv from 'dotenv';
dotenv.config();
import { Client, Intents } from 'discord.js';
import { fetchData } from './ii-sdk.js';

const iiKEY = process.env.II_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const botConfigs = [
    {
        name: 'Project Manager',
        token: process.env.DISCORD_PM_TOKEN,
        ii_id: 'ee135f4e-d614-4dd1-9f26-9df83e35a7bc',
    },
    {
        name: 'Banana',
        token: process.env.DISCORD_BANANA_TOKEN,
        ii_id: '57b2d811-a69b-4597-af51-148e94c823cc',

    }
];
function createBot(config) {
    const client = new Client({
        intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
    });

    // Use the configuration for the bot
    const { token } = config;

    const channelMessageHistory = new Map(); // Map to store message history for each channel

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
            // Store the last 10 messages for each channel
            if (!channelMessageHistory.has(message.channel.id)) {
                channelMessageHistory.set(message.channel.id, []);
            }

            try {
                const currentHistoryLength = channelMessageHistory.get(message.channel.id).length;
                const fetchAmount = 10 - currentHistoryLength;
                if (fetchAmount > 0) {
                    const fetchedMessages = await message.channel.messages.fetch({ limit: fetchAmount });
                    const initialMessages = fetchedMessages.map(msg => ({ user: msg.author.username, content: msg.content }));
                    channelMessageHistory.get(message.channel.id).unshift(...initialMessages.reverse()); // Prepend the fetched messages
                }
            } catch (error) {
                console.error('Error fetching initial messages:', error);
            }

            channelHistory = channelMessageHistory.get(message.channel.id);
            channelHistory.push({ user: message.author.username, content: message.content });
            if (channelHistory.length > 10) {
                channelHistory.splice(0, channelHistory.length - 10); // Remove the oldest messages to keep only the last 10
            }
        }
        const botWasMentioned = message.mentions.users.has(client.user.id);
        console.log('bot was mentioned:', botWasMentioned)
        if (botWasMentioned) {
            const promptMessageHistory = [
                ...formatMessageHistory(channelHistory),
                {
                    "role": "user",
                    "content": message.content
                }
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
