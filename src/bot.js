// Using ES Module import syntax
import dotenv from 'dotenv';
dotenv.config(); // Make sure to import and configure dotenv at the top
import { Client, Intents } from 'discord.js';
import { fetchData } from './ii-sdk.js'; // Ensure the path is correct; add '.js' extension

const token = process.env.DISCORD_BOT_TOKEN;
const iiKEY = process.env.II_KEY;

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
    }

    if (message.mentions.users.has(client.user.id)) {
        let botId = 'eb61f8a2-f7ef-4013-aad0-a75ceb334e7d';

        let result = await fetchData(iiKEY, botId,

            [{
                "role": "user",
                "content": message.content
            }]


        );

        // Ensure handling of result and errors appropriately
        message.channel.send(result).then(() => {
            console.log('Greeting sent successfully.');
        }).catch(error => {
            console.error('An error occurred while sending the greeting:', error);
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