import dotenv from 'dotenv';
dotenv.config();
import { Client, Intents } from 'discord.js';
import { fetchData } from './ii-sdk.js';
import { formatUpdateData, getRepoAndIssueNumberFromLink } from './util.js';
import { getGithubIssuesPrompt, updateGithubIssue } from './github_service.js';

export class Bot {
    constructor(config, projectConfig) {
        this.client = new Client({
            intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
        });
        this.token = config.token;
        this.ii_id = config.ii_id;
        this.channelMessageHistory = new Map();
        this.issuesCache = new Map();
        this.projectConfig = projectConfig;
        this.config = config;

        this.client.once('ready', () => {
            console.log(`${this.config.name} is online and ready to serve!`);
        });

        this.client.on('messageCreate', async message => {
            let _updateIssue;
            const { updateIssue, channelHistory } = await this.handleCache(message);
            _updateIssue = updateIssue;

            const botWasMentioned = message.mentions.users.has(this.client.user.id);
            console.log('bot was mentioned:', botWasMentioned)
            if (botWasMentioned) {
                const username = this.projectConfig.discordToGithubUsernames[message.author.username];
                const issues = await getGithubIssuesPrompt(this.projectConfig.githubOrg, this.issuesCache, username, this.config.showOpenIssues, this.projectConfig.GITHUB_TOKEN);
                console.log('issues gotten length', issues.length)

                const promptMessageHistory = this.buildPrompt(message, channelHistory, issues);
                console.log('promptMessageHistory:', promptMessageHistory)

                let _aiResponse;
                if (_updateIssue) {
                    _updateIssue = false;
                    _aiResponse = this.isPartOfTeam(message) ? await this.startUpdateIssue(message, promptMessageHistory) : 'Sorry! Only members of the GitHub team can request issue updates';
                } else {
                    _aiResponse = await fetchData(this.projectConfig.iiKEY, this.ii_id, promptMessageHistory);
                }
                if (_aiResponse) {
                    await this.sendMessage(message.channel, _aiResponse);
                }
            }
        });

        this.client.on('error', error => {
            console.error('The bot encountered an error:', error);
        });

    }
    buildPrompt(message, channelHistory, issues) {
        const taskElement = { 'role': 'assistant', 'content': `LIST OF TASKS THE USER NEEDS TO COMPLETE:\n${issues}\n` };
        let promptMessageHistory = [
            taskElement,
            {
                "role": "user",
                "content": `${message.author}: ${message.content}`
            },

        ];
        if (channelHistory) {
            promptMessageHistory.unshift(...channelHistory)

        }
        return promptMessageHistory;
    }
    isPartOfTeam(message) {
        const sender = message.author.username;
        const discordUsernames = Object.keys(this.projectConfig.discordToGithubUsernames);
        return discordUsernames.includes(sender);
    }
    async sendMessage(channel, message) {
        try {
            await channel.send(message);
            console.log('Response sent successfully.');
        } catch (error) {
            console.error('An error occurred while sending the response:', error);
        }
    }

    async startUpdateIssue(message, promptMessageHistory) {
        let _aiResponse;
        console.log('startUpdateIssue called')
        const { aiResponse: pmRepsonse, detailsToUse } = await this.getIssueDetails(message, promptMessageHistory);
        _aiResponse = pmRepsonse;
        if (detailsToUse) {
            console.log('detailsToUse is valid')
            const { org, repo, issueNumber } = detailsToUse;
            const updateData = await this.fetchUpdateDataFromAgent(this.issuesCache, issueNumber, message.content, _aiResponse);
            console.log('update data result', updateData)
            try {
                const issueUrl = await updateGithubIssue(org, repo, this.projectConfig.GITHUB_TOKEN, issueNumber, updateData);
                _aiResponse = `Issue updated: ${issueUrl}\n${pmRepsonse}`;

            }
            catch (error) {
                console.error('Error updating GitHub issue:', error);
                _aiResponse = 'Failed to update issue.';
            }
        } else {
            _aiResponse = 'Will do! I am having trouble understanding which issue you want to update, please retry the command with the link included!';
        }

        return _aiResponse;
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
            const response = await fetchData(this.projectConfig.iiKEY, this.ii_id, [...promptMessageHistory, { 'role': 'user', 'content': 'i expect that the first link you send will be link to the issue that will be updated' }]);
            aiResponse = response
            const issueDetailsFromAI = getRepoAndIssueNumberFromLink(aiResponse);
            detailsToUse = issueDetailsFromAI;
        }
        console.log('detailsToUse', detailsToUse)
        return { aiResponse, detailsToUse };
    }

    async handleCache(message) {
        let updateIssue = false;
        const maxMessageCacheLength = this.projectConfig.maxMessageCacheLength;
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
        const possibleAssignees = Object.values(this.projectConfig.discordToGithubUsernames).join(', ')
        const oldDetails = `Title: ${issueDetails.title}\nDescription: ${issueDetails.body}\nAssignees: ${issueDetails.assignees.map(a => a.login).join(', ')}\nStatus: ${issueDetails.state}`;
        const prompt = [
            { 'role': 'user', 'content': `\nbe aware that the possible asignees are ${possibleAssignees}\nOld version:\n${oldDetails}\n#instruction for new version:\nbroad${userMessage}\ndetailed:${aiResponse}` }
        ];
        console.log('sending ticket agent..', prompt)

        let result = await fetchData(this.projectConfig.iiKEY, this.projectConfig.updateIssuesBotId, prompt);
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






