// Import necessary libraries
require('dotenv').config(); // Make sure to require dotenv at the top
const { Client, Intents } = require('discord.js');
const axios = require('axios');

// Access your environment variables
const token = process.env.DISCORD_BOT_TOKEN;
const webhookURL = process.env.WEB_HOOK_URL;

// Initialize Discord Bot
const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
});

// Bot ready event
client.once('ready', () => {
    console.log('Bot is online and ready to serve!');
});

// Message event
client.on('messageCreate', async message => {
    // Log every message received (not including ones sent by the bot)
    if (!message.author.bot) {
        console.log(`Message received: ${message.content}`);
        n
    }

    // Check if the bot is mentioned and say hello
    if (message.mentions.users.has(client.user.id)) {
        console.log('Bot was mentioned, saying hello...');
        message.channel.send('Hello!').then(() => {
            console.log('Greeting sent successfully.');
        }).catch(error => {
            console.error('An error occurred while sending the greeting:', error);
        });
    }

    // Simple command example: Responding to "!ping"
    if (message.content === '!ping') {
        console.log('!ping command received, sending response...');
        message.channel.send('Pong!').then(() => {
            console.log('Response sent successfully.');
        }).catch(error => {
            console.error('An error occurred while sending the message:', error);
        });
    }

    // Example of using a webhook to send a message
    if (message.content.startsWith('!webhook')) {
        console.log('!webhook command received, attempting to send a webhook message...');

        try {
            const response = await axios.post(webhookURL, {
                content: 'This is a message sent from a webhook triggered by a Discord command.',
            });
            console.log('Webhook message sent successfully:', response.data);
        } catch (error) {
            console.error('Failed to send webhook message:', error);
        }
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