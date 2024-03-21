import { Client, Intents } from 'discord.js';
import { fetchData } from './ii-sdk.js';
import { formatUpdateData, getRepoAndIssueNumberFromLink, extractIssueNumberFromUrl } from './util.js';
import { getGithubIssuesPrompt, fetchIssue, updateGithubIssue, createGithubIssue, addIssueToProject, fetchRepos, fetchProjects, fetchOrgId } from './github_service.js';



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
        this.fetchProjects = [];

        this.client.once('ready', () => {
            console.log(`${this.config.name} is online and ready to serve!`);
        });

        this.client.on('messageCreate', async message => {
            let _updateIssue;
            let _createIssue;
            const channelHistory = await this.updateMessageCacheForChannel(message);

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
                    this.channelMessageHistory.get(message.channel.id).push({ 'role': 'assistant', 'content': message.content });
                    await this.sendMessage(message.channel, _aiResponse);
                }
            }
        });

        this.client.on('error', error => {
            console.error('The bot encountered an error:', error);
        });

    }
    buildPrompt(message, channelHistory, issues) {
        const projects = this.projectsCache.map((e) => e.title).join(', ');
        const taskElement = { 'role': 'assistant', 'content': `LIST OF TASKS THE USER NEEDS TO COMPLETE:\n${issues}\n THESE ARE THE PROJECTS THE TASKS GO IN: ${projects}` };
        channelHistory.pop();
        let promptMessageHistory = [
            taskElement,
            {
                "role": "user",
                "content": `${message.author.globalName}: ${message.content}`
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
    getFormatUpdateIssuePrompt(assignees, projects, userInstructions, botInstructions, repos) {
        return ```
    #the possible values are as follows
    #assignees: 
    -${assignees}
    #repositories:
    -${repos}
    #projectswording is meticulous): 
    -${projects}
    (if assigned return an array with their name as an item)
    #You are creating a new issue so provide all details.
    #instruction for the new issue:
    strict orders:
    ${userInstructions}
    background:
    ${botInstructions}
    }```
    }
    async startUpdateIssue(message, promptMessageHistory) {
        let _aiResponse;
        console.log('startUpdateIssue called')
        const { aiResponse: pmRepsonse, detailsToUse } = await this.getIssueDetails(message, promptMessageHistory);
        _aiResponse = pmRepsonse;
        if (detailsToUse) {
            console.log('detailsToUse is valid')
            const { org, repo, issueNumber } = detailsToUse;
            const updateData = await this.fetchUpdateIssueData(this.issuesCache, issueNumber, `${message.author.globalName}: ${message.content}`, _aiResponse, repo);
            console.log('update data result', updateData)
            try {
                let project_titles;
                if (updateData.projects) {
                    project_titles = updateData.projects;
                    delete updateData.projects;;
                }
                const issueUrlAndId = await updateGithubIssue(org, repo, this.projectConfig.GITHUB_TOKEN, issueNumber, updateData);
                _aiResponse = `Issue updated: ${issueUrlAndId.url}\n, I did not change the project it belongs to`;

                console.log('updateGithubIssue success')
                if (project_titles) {
                    const sucessfulProjs = (await this.addIssueToProjects(project_titles, issueUrlAndId.id,)).join(', ');
                    _aiResponse = `Issue updated: ${issueUrlAndId.url}, and added to project(s): ${sucessfulProjs}`;
                }
            }
            catch (error) {
                console.error('Error updating GitHub issue:', error);
                _aiResponse = `Failed to update issue: ${updateData}`;
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

    async updateMessageCacheForChannel(message) {
        if (!message.author.bot) {
            console.log(`Message received from ${message.author.username}: ${message.content}`);

            const channelId = message.channel.id;
            if (!this.channelMessageHistory.has(channelId)) {
                this.channelMessageHistory.set(channelId, []);
            }

            await this.updateChannelMessageHistory(channelId, message);

            this.trimChannelHistoryToLimit(channelId, this.projectConfig.maxMessageCacheLength);

            return this.channelMessageHistory.get(channelId);
        }
    }

    async updateChannelMessageHistory(channelId, message) {
        const channelHistory = this.channelMessageHistory.get(channelId);
        const fetchAmount = this.projectConfig.maxMessageCacheLength - channelHistory.length;

        if (fetchAmount > 0) {
            await this.fetchAndAddMessagesToCache(channelId, fetchAmount);
        }

        // Add the latest message
        channelHistory.push({ role: 'user', content: `${message.author.username}: ${message.content}` });
    }

    async fetchAndAddMessagesToCache(channelId, fetchAmount) {
        try {
            const fetchedMessages = await this.client.channels.cache.get(channelId).messages.fetch({ limit: fetchAmount });
            const initialMessages = fetchedMessages.map(msg => ({ role: 'user', content: `${msg.author.username}: ${msg.content}` }));

            // Prepend fetched messages to the channel history
            this.channelMessageHistory.get(channelId).unshift(...initialMessages.reverse());
        } catch (error) {
            console.error('Error fetching initial messages:', error);
        }
    }

    trimChannelHistoryToLimit(channelId, limit) {
        const channelHistory = this.channelMessageHistory.get(channelId);
        if (channelHistory.length > limit) {
            channelHistory.splice(0, channelHistory.length - limit);
        }
    }

    async createIssue(message, promptMessageHistory) {
        const issueInstructions = await fetchData(this.projectConfig.iiKEY, this.agentId, promptMessageHistory);
        const issueData = await this.fetchCreateIssueData(`${message.author.globalName}: ${message.content}`, issueInstructions);
        console.log('issue data result', issueData);
        try {
            if (!issueData.repo) {
                issueData.repo = this.reposCache[0];
                console.log('repo wasnt provided for createissue defaulting to', issueData.repo)
            }
            const issueUrlAndId = await createGithubIssue(this.projectConfig.githubOrg, issueData.repo, this.projectConfig.GITHUB_TOKEN, issueData.title, issueData.body, issueData.assignees);

            const newIssue = {
                number: extractIssueNumberFromUrl(issueUrlAndId.url),
                title: issueData.title,
                body: issueData.body,
                assignees: issueData.assignees,
                state: issueData.state,
                html_url: issueUrlAndId.url
            };
            const issueKey = `issue-${newIssue.number}`;
            console.log('setting issue with key:', issueKey)
            this.issuesCache.set(issueKey, newIssue);

            if (issueData.projects) {
                const sucessfulProjs = (await this.addIssueToProjects(issueData.projects, issueUrlAndId.id)).join(', ');
                return `Issue created: ${issueUrlAndId.url}, and added to project ${sucessfulProjs}`;

            }
            return `Issue created: ${issueUrlAndId.url}, I did not add it to a project would you like me to?`;
        } catch (error) {
            console.error('Error creating GitHub issue:', error);
            return 'Failed to create issue.';
        }
    }

    async addIssueToProjects(projectTitles, issueId) {
        let success = [];
        for (const title of projectTitles) {
            const project = this.projectsCache.find(project => project.title === title);
            if (project) {
                await addIssueToProject(this.projectConfig.GITHUB_TOKEN, project.id, issueId);
                success.push(title)
            } else {
                console.error(`Project with title '${title}' not found in cache`);
            }
        }
        return success;
    }
    async fetchCreateIssueData(userMessage, aiResponse) {
        const possibleAssignees = Object.values(this.projectConfig.discordToGithubUsernames).join('\n-');
        const repos = this.reposCache.join('\n-');
        const projects = this.projectsCache.map((e) => e.title).join('\n-');

        const prompt = [
            { 'role': 'user', 'content': `#the possible values are as follows\n#assignees: \n-${possibleAssignees}\n#repositories:\n-${repos}\n#projects(wording is meticulous): ${projects}\n(if assigned return an array with their name as an item)\n\n#You are creating a new issue so provide all details.'\n#instruction for the new issue:\nstrict orders:${userMessage}\nbackground:${aiResponse}. return all json fields with exact values` }
        ];
        console.log('sending ticket agent..', prompt);

        let result = await fetchData(this.projectConfig.iiKEY, this.projectConfig.formatIssueAgentId, prompt);
        console.log('result from ticketagent', result);
        return formatUpdateData(result);
    }
    async fetchUpdateIssueData(issuesCache, issueNumber, userMessage, aiResponse, repo) {
        let issueDetails;
        let oldDetails = '';
        let prompt;
        const possibleAssignees = Object.values(this.projectConfig.discordToGithubUsernames).join('\n-');
        const repos = this.reposCache.join('\n-');
        const projects = this.projectsCache.map((e) => e.title).join('\n-');

        issueDetails = await this.getIssueFromCache(issuesCache, issueNumber, repo);
        if (!issueDetails) {
            return 'I couldnt find the issue you want to update in the cache';
        }
        oldDetails = `Title: ${issueDetails.title}\nDescription: ${issueDetails.body}\nAssignees: ${issueDetails.assignees.map(a => a.login).join(', ')}\nStatus: ${issueDetails.state}`;
        prompt = [
            { 'role': 'user', 'content': this.getFormatUpdateIssuePrompt(possibleAssignees, projects, userMessage, aiResponse, repos) }
        ];
        console.log('sending ticket agent..', prompt);

        let result = await fetchData(this.projectConfig.iiKEY, this.projectConfig.formatIssueAgentId, prompt);
        console.log('result from ticketagent', result);
        return formatUpdateData(result);
    }
    async getIssueFromCache(issuesCache, issueNumber, repo) {
        const issueKey = `issue-${issueNumber}`;
        const issueFromCache = issuesCache.get(issueKey);
        if (!issueFromCache) {
            const issue = await fetchIssue(this.projectConfig.githubOrg, repo, issueNumber, this.projectConfig.GITHUB_TOKEN);
            issuesCache.set(issueKey, issue);
            return issue;
        }
        return issueFromCache;
    }
    async getRetryResponse(promptMessageHistory, retryCount = 0) {
        const response = await fetchData(this.projectConfig.iiKEY, this.agentId, promptMessageHistory, 2000);
        console.log('AI response:', response);

        // Define a minimum acceptable length for the response
        const minLength = 20;

        // Check if the response is too short and if we have retries left
        if (response.length < minLength && retryCount < 1) {
            console.log('Response is too short, retrying...');
            return await this.getRetryResponse([...promptMessageHistory, { 'role': 'assistant', 'content': response }, { 'role': 'user', 'content': 'please continue' }], retryCount + 1); // Retry with an incremented retry count
        }

        return response;
    }

    async start() {
        this.client.login(this.token).then(() => {
            console.log(`${this.client.user.tag} has logged in successfully.`);
        }).catch(error => {
            console.error(`Login failed:`, error);
        });
    }

    async initialize() {
        this.projectConfig.ownerId = await fetchOrgId(this.projectConfig.githubOrg, this.projectConfig.GITHUB_TOKEN)
        this.projectsCache = await fetchProjects(this.projectConfig.GITHUB_TOKEN, this.projectConfig.ownerId);
        console.log('Cached projects:', this.projectsCache);
        this.reposCache = await fetchRepos(this.projectConfig.githubOrg, this.projectConfig.GITHUB_TOKEN);
        console.log('Cached repositories:', this.reposCache);
        // Start the bot
        this.start();
    }

}






