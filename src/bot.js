import dotenv from 'dotenv';
dotenv.config();
import { Client, Intents } from 'discord.js';
import { fetchData } from './ii-sdk.js';

const token = process.env.DISCORD_BOT_TOKEN;
const iiKEY = process.env.II_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
});

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

    if (message.mentions.users.has(client.user.id)) {
        const promptMessageHistory = [
            ...formatMessageHistory(channelHistory),
            {
                "role": "user",
                "content": message.content
            }
        ];
        let botId = 'ee135f4e-d614-4dd1-9f26-9df83e35a7bc';
        console.log('sending:', promptMessageHistory)
        let result = await fetchData(iiKEY, botId, promptMessageHistory);

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
    console.log('Bot has logged in successfully.');
}).catch(error => {
    console.error('Bot login failed:', error);
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
