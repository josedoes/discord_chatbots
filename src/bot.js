import dotenv from 'dotenv';
dotenv.config();
import { Client, Intents } from 'discord.js';
import { fetchData } from './ii-sdk.js';
import { formatUpdateData, getRepoAndIssueNumberFromLink, extractIssueNumberFromUrl } from './util.js';
import { getGithubIssuesPrompt, updateGithubIssue, createGithubIssue, fetchRepos } from './github_service.js';

export class Bot {
    constructor(config, projectConfig) {
        this.client = new Client({
            intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
        });
        this.token = config.token;
        this.agentId = config.agentId;
        this.channelMessageHistory = new Map();
        this.issuesCache = new Map();
        this.projectConfig = projectConfig;
        this.config = config;
        this.reposCache = [];

        this.client.once('ready', () => {
            console.log(`${this.config.name} is online and ready to serve!`);
        });

        this.client.on('messageCreate', async message => {
            let _updateIssue;
            let _createIssue;
            const channelHistory = await this.handleCache(message);
            _updateIssue = message.content.toLowerCase().includes('updateissue');
            _createIssue = message.content.toLowerCase().includes('createissue');

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
                } else if (_createIssue) {
                    _createIssue = false;
                    _aiResponse = this.isPartOfTeam(message) ? await this.createIssue(message, promptMessageHistory) : 'Sorry! Only members of the GitHub team can create issues';
                }

                else {
                    _aiResponse = await fetchData(this.projectConfig.iiKEY, this.agentId, promptMessageHistory);
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
            const updateData = await this.fetchUpdateIssueData(this.issuesCache, issueNumber, message.content, _aiResponse);
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
            const response = await this.getRetryResponse([...promptMessageHistory, { 'role': 'user', 'content': 'i expect that the first link you send will be link to the issue that will be updated' }]);
            aiResponse = response
            const issueDetailsFromAI = getRepoAndIssueNumberFromLink(aiResponse);
            detailsToUse = issueDetailsFromAI;
        }
        console.log('detailsToUse', detailsToUse)
        return { aiResponse, detailsToUse };
    }

    async handleCache(message) {
        const maxMessageCacheLength = this.projectConfig.maxMessageCacheLength;
        const isUserMessage = !message.author.bot;
        let contextChannelHistory;
        if (isUserMessage) {
            console.log(`Message received from ${message.author.username}: ${message.content}`);
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
        return contextChannelHistory;
    }

    async createIssue(message, promptMessageHistory) {
        const issueInstructions = await fetchData(this.projectConfig.iiKEY, this.agentId, promptMessageHistory);
        const issueData = await this.fetchCreateIssueData(message.content, issueInstructions);
        console.log('issue data result', issueData);
        try {
            if (!issueData.repo) {
                console.log('repo wasnt provided for createissue')
                issueData.repo = this.reposCache[0];
            }
            const issueUrl = await createGithubIssue(this.projectConfig.githubOrg, issueData.repo, this.projectConfig.GITHUB_TOKEN, issueData.title, issueData.body, issueData.assignees);
            const newIssue = {
                number: extractIssueNumberFromUrl(issueUrl),
                title: issueData.title,
                body: issueData.body,
                assignees: issueData.assignees,
                state: issueData.state,
                html_url: issueUrl
            };
            const issueKey = `issue-${newIssue.number}`;
            this.issuesCache.set(issueKey, newIssue);
            return `Issue created: ${issueUrl}`;
        } catch (error) {
            console.error('Error creating GitHub issue:', error);
            return 'Failed to create issue.';
        }
    }

    async fetchCreateIssueData(userMessage, aiResponse) {
        const possibleAssignees = Object.values(this.projectConfig.discordToGithubUsernames).join(', ');
        const repos = this.reposCache.join(', ');

        const prompt = [
            { 'role': 'user', 'content': `\nbe aware that the possible assignees are ${possibleAssignees}\nand these are the possible repos: ${repos}\nYou are creating a new issue so provide all details.'\n#instruction for the new issue:\nstrict orders:${userMessage}\nbackground:${aiResponse}. return all json fields` }
        ];

        console.log('sending ticket agent..', prompt);

        let result = await fetchData(this.projectConfig.iiKEY, this.projectConfig.updateIssuesBotId, prompt);
        console.log('result from ticketagent', result);
        return formatUpdateData(result);
    }
    async fetchUpdateIssueData(issuesCache, issueNumber, userMessage, aiResponse,) {
        let issueDetails;
        let oldDetails = '';
        let prompt;
        const possibleAssignees = Object.values(this.projectConfig.discordToGithubUsernames).join(', ');

        issueDetails = this.getIssueFromCache(issuesCache, issueNumber);
        if (!issueDetails) {
            return 'I couldnt find the issue you want to update in the cache';
        }
        oldDetails = `Title: ${issueDetails.title}\nDescription: ${issueDetails.body}\nAssignees: ${issueDetails.assignees.map(a => a.login).join(', ')}\nStatus: ${issueDetails.state}`;
        prompt = [
            { 'role': 'user', 'content': `\nbe aware that the possible assignees are ${possibleAssignees}\nOld version:\n${oldDetails}\n#instruction for new version:\nbroad:${userMessage}\ndetailed:${aiResponse}` }
        ];
        console.log('sending ticket agent..', prompt);

        let result = await fetchData(this.projectConfig.iiKEY, this.projectConfig.updateIssuesBotId, prompt);
        console.log('result from ticketagent', result);
        return formatUpdateData(result);
    }


    getIssueFromCache(issuesCache, issueNumber) {
        const issueKey = `issue-${issueNumber}`;
        return issuesCache.get(issueKey);
    }
    async getRetryResponse(promptMessageHistory, retryCount = 0) {
        const response = await fetchData(this.projectConfig.iiKEY, this.agentId, promptMessageHistory, 2000);
        console.log('AI response:', response);

        // Define a minimum acceptable length for the response
        const minLength = 20;

        // Check if the response is too short and if we have retries left
        if (response.length < minLength && retryCount < 1) {
            console.log('Response is too short, retrying...');
            return await this.getRetryResponse([...promptMessageHistory,{'role':'assistant','content':response},{'role':'user','content':'please continue'}], retryCount + 1); // Retry with an incremented retry count
        }

        return response;
    }
    async start() {
        this.reposCache = await fetchRepos(this.projectConfig.githubOrg, this.projectConfig.GITHUB_TOKEN);
        console.log('Cached repositories:', this.reposCache);
        this.client.login(this.token).then(() => {
            console.log(`${this.client.user.tag} has logged in successfully.`);
        }).catch(error => {
            console.error(`Login failed:`, error);
        });
    }
}






