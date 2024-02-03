require('dotenv').config(); // Make sure to require dotenv at the top
const { Client, Intents } = require('discord.js');

const token = process.env.DISCORD_BOT_TOKEN;

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
        message.channel.send('Hey Guys! They are fixing LLM LAB right now, once the maintenace is complete Ill be able to talk!').then(() => {
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