import dotenv from 'dotenv';
dotenv.config();
import { Client, Intents } from 'discord.js';
import { fetchData } from './ii-sdk.js';
import { formatUpdateData, getRepoAndIssueNumberFromLink } from './util.js';
import { getGithubIssuesPrompt, updateGithubIssue } from './github_service.js';

class Bot {
    constructor(config, projectConfig) {
        this.client = new Client({
            intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
        });
        this.token = config.token;
        this.ii_id = config.ii_id;
        this.channelMessageHistory = new Map();
        this.issuesCache = new Map();

        this.client.once('ready', () => {
            console.log(`${config.name} is online and ready to serve!`);
        });

        this.client.on('messageCreate', async message => {
            let _updateIssue;
            const { updateIssue, channelHistory } = await this.processMessage(message);
            _updateIssue = updateIssue;

            const botWasMentioned = message.mentions.users.has(this.client.user.id);
            console.log('bot was mentioned:', botWasMentioned)
            if (botWasMentioned) {
                const username = projectConfig.discordToGithubUsernames[message.author.username];

                const issues = await getGithubIssuesPrompt(projectConfig.githubOrg, this.issuesCache, username, config.showOpen, projectConfig.GITHUB_TOKEN);
                console.log(
                    'issues gotten length', issues.length
                )
                const taskElement = { 'role': 'assistant', 'content': `LIST OF TASKS THE USER NEEDS TO COMPLETE:\n${issues}\n` };
                let promptMessageHistory = [
                    {
                        "role": "user",
                        "content": `${message.author}: ${message.content}`
                    },

                ];
                if (channelHistory) {
                    promptMessageHistory.unshift(...channelHistory)

                }

                if (!_updateIssue) {
                    promptMessageHistory.unshift(taskElement)
                }

                console.log('promptMessageHistory:', promptMessageHistory)
                let _aiResponse;
                if (_updateIssue) {
                    const sender = message.author.username;
                    const discordUsernames = Object.keys(projectConfig.discordToGithubUsernames);
                    console.log('sender and discord usernames', sender, discordUsernames)
                    const isPartOfTeam = discordUsernames.includes(sender);

                    if (isPartOfTeam) {
                        _updateIssue = false;
                        console.log('updateIssue called')

                        const { aiResponse, detailsToUse } = await this.getIssueDetails(message, promptMessageHistory);
                        _aiResponse = aiResponse;
                        if (detailsToUse) {
                            console.log('detailsToUse is valid')
                            const { org, repo, issueNumber } = detailsToUse;
                            const updateData = await this.fetchUpdateDataFromAgent(this.issuesCache, issueNumber, message.content, _aiResponse);
                            console.log('update data result', updateData)
                            try {
                                const issueUrl = await updateGithubIssue(org, repo, projectConfig.GITHUB_TOKEN, issueNumber, updateData);
                                message.channel.send(`Issue updated: ${issueUrl}`);
                            }
                            catch (error) {
                                console.error('Error updating GitHub issue:', error);
                                message.channel.send('Failed to update issue.');
                            }
                        } else {
                            _aiResponse = 'Will do! I am having trouble understanding which issue you want to update, please retry the command with the link included!';

                        }

                    } else {
                        _aiResponse = 'Sorry! Only members of the github team can request issue updates';
                    }

                    if (_aiResponse) {
                        message.channel.send(_aiResponse).then(() => {
                            console.log('Response sent successfully.');
                        }).catch(error => {
                            console.error('An error occurred while sending the response:', error);
                        });
                    }
                }
                else {
                    _aiResponse = await fetchData(projectConfig.iiKEY, this.ii_id, promptMessageHistory);

                    message.channel.send(_aiResponse).then(() => {
                        console.log('Response sent successfully.');
                    }).catch(error => {
                        console.error('An error occurred while sending the response:', error);
                    });
                }

            }
        });

        this.client.on('error', error => {
            console.error('The bot encountered an error:', error);
        });

    }

    async getIssueDetails(message, promptMessageHistory) {

        let detailsToUse;
        let aiResponse = 'Sure thing!';
        const issueDetailsFromMessage = getRepoAndIssueNumberFromLink(message.content);
        if (issueDetailsFromMessage) {
            console.log('using user provided details')
            detailsToUse = issueDetailsFromMessage;
        } else {
            console.log('using ai provided details')
            const response = await fetchData(projectConfig.iiKEY, this.ii_id, [...promptMessageHistory, { 'role': 'user', 'content': 'i expect that the first link you send will be link to the issue that will be updated' }]);
            aiResponse = response
            const issueDetailsFromAI = getRepoAndIssueNumberFromLink(aiResponse);
            detailsToUse = issueDetailsFromAI;
        }
        console.log('detailsToUse', detailsToUse)
        return { aiResponse, detailsToUse };
    }
    async processMessage(message) {
        let updateIssue = false;
        const maxMessageCacheLength = projectConfig.maxMessageCacheLength;
        const isUserMessage = !message.author.bot;
        let contextChannelHistory;
        if (isUserMessage) {
            console.log(`Message received from ${message.author.username}: ${message.content}`);
            updateIssue = message.content.toLowerCase().includes('updateissue');

            if (!this.channelMessageHistory.has(message.channel.id)) {
                this.channelMessageHistory.set(message.channel.id, []);
            }
            try {
                const currentHistoryLength = this.channelMessageHistory.get(message.channel.id).length;
                const fetchAmount = maxMessageCacheLength - currentHistoryLength;
                if (fetchAmount > 0) {
                    const fetchedMessages = await message.channel.messages.fetch({ limit: fetchAmount });
                    const initialMessages = fetchedMessages.map(msg => ({ role: 'user', content: `${msg.author.username}: ${msg.content}` }));
                    this.channelMessageHistory.get(message.channel.id).unshift(...initialMessages.reverse()); // Prepend the fetched messages
                }
            } catch (error) {
                console.error('Error fetching initial messages:', error);
            }
            contextChannelHistory = this.channelMessageHistory.get(message.channel.id);
            contextChannelHistory.push({ role: 'assistant', content: `${message.content}` });
            if (contextChannelHistory.length > maxMessageCacheLength) {
                contextChannelHistory.splice(0, contextChannelHistory.length - maxMessageCacheLength);
            }
        }
        return { updateIssue, channelHistory: contextChannelHistory };
    }
    async fetchUpdateDataFromAgent(issuesCache, issueNumber, userMessage, aiResponse) {
        const issueDetails = this.getIssueFromCache(issuesCache, issueNumber);
        if (!issueDetails) {
            return null;
        }
        const possibleAssignees = Object.values(projectConfig.discordToGithubUsernames).join(', ')
        const oldDetails = `Title: ${issueDetails.title}\nDescription: ${issueDetails.body}\nAssignees: ${issueDetails.assignees.map(a => a.login).join(', ')}\nStatus: ${issueDetails.state}`;
        const prompt = [
            { 'role': 'user', 'content': `\nbe aware that the possible asignees are ${possibleAssignees}\nOld version:\n${oldDetails}\n#instruction for new version:\nbroad${userMessage}\ndetailed:${aiResponse}` }
        ];
        console.log('sending ticket agent..', prompt)

        let result = await fetchData(projectConfig.iiKEY, projectConfig.issuesUpdaterBotId, prompt);
        console.log('result from ticketagent', result);
        return formatUpdateData(result);
    }
    getIssueFromCache(issuesCache, issueNumber) {
        const issueKey = `issue-${issueNumber}`;
        return issuesCache.get(issueKey);
    }

    start() {
        this.client.login(this.token).then(() => {
            console.log(`${this.client.user.tag} has logged in successfully.`);
        }).catch(error => {
            console.error(`Login failed:`, error);
        });
    }
}

const iiKEY = process.env.II_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const discordBotConfig = [
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
const projectConfig = {
    githubOrg: 'intelligent-iterations',
    discordToGithubUsernames: { 'joselolol.': 'joselaracode', 'strawberry_milks_': 'lealari', 'marilara33': 'marianalara33', 'lucystag': 'luciana-lara' },
    issuesUpdaterBotId: "9148cda6-e7e7-4c70-a660-58e505840997",
    maxMessageCacheLength: 10,
    iiKEY: iiKEY,
    GITHUB_TOKEN: GITHUB_TOKEN,
}
const bots = discordBotConfig.map(config => new Bot(config, projectConfig));

bots.forEach(bot => bot.start());




