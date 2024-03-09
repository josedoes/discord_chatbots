import axios from 'axios';
import { formatIssueMessage } from './util.js';


async function fetchGithubRepos(org, token) {
    const url = `https://api.github.com/orgs/${org}/repos`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };
    try {
        const response = await axios.get(url, { headers });
        return response.data;
    } catch (error) {
        throw new Error(`GitHub API request failed: ${error.response.statusText}`);
    }
}
export async function addIssueToProject(token, projectId, itemId) {
    const query = `
        mutation {
            addProjectV2ItemById(input: {projectId: "${projectId}", contentId: "${itemId}"}) {
                item {
                    id
                }
            }
        }
    `;

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    try {
        const response = await axios.post('https://api.github.com/graphql', { query }, { headers });
        console.log('addIssueToProject response', response.data)
        return response.data.data.addProjectV2ItemById.item.id;
    } catch (error) {
        console.error('Error adding issue to project:', error);
        throw error;
    }
}


export async function fetchIssue(org, repo, issueNumber, token) {
    const url = `https://api.github.com/repos/${org}/${repo}/issues/${issueNumber}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };

    try {
        const response = await axios.get(url, { headers });
        return response.data; // Returns the issue object
    } catch (error) {
        console.error('Error fetching issue:', error);
        throw error;
    }
}
export async function fetchGithubIssuesForUser(org, token, username) {
    const repos = await fetchGithubRepos(org, token);
    let userIssues = [];

    for (const repo of repos) {
        const url = `https://api.github.com/repos/${org}/${repo.name}/issues?assignee=${username}`;
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };
        try {
            const response = await axios.get(url, { headers });
            userIssues.push(...response.data);
        } catch (error) {
            console.error(`Error fetching issues for user ${username} in repo ${repo.name}:`, error.response.statusText);
        }
    }
    return userIssues;
}
export async function updateGithubIssue(org, repo, token, issueNumber, updateData) {
    console.log('updateGithubIssue data', updateData)
    const url = `https://api.github.com/repos/${org}/${repo}/issues/${issueNumber}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };
    try {
        const response = await axios.patch(url, updateData, { headers });
        return { url: response.data.html_url, id: response.data.node_id }; // Return the URL of the created issue
    } catch (error) {
        throw new Error(`Failed to update GitHub issue: ${error.response.statusText}`);
    }
}
export async function createGithubIssue(org, repo, token, title, body, assignees) {
    const url = `https://api.github.com/repos/${org}/${repo}/issues`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };
    const data = {
        title,
        body,
        assignees
    };
    try {
        const response = await axios.post(url, data, { headers });
        console.log('createGithubIssue', response.data.node_id)
        return { url: response.data.html_url, id: response.data.node_id }; // Return the URL of the created issue
    } catch (error) {
        throw new Error(`Failed to create GitHub issue: ${error.response.statusText}`);
    }
}

export async function fetchOrgId(orgName, token) {
    const url = `https://api.github.com/orgs/${orgName}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };

    try {
        const response = await axios.get(url, { headers });
        return response.data.node_id;
    } catch (error) {
        console.error('Error fetching organization ID:', error);
        throw error;
    }
}
export async function fetchProjects(token, ownerId) {
    const query = `
        query {
            node(id: "${ownerId}") {
                ... on Organization {
                    projectsV2(first: 10) {
                        nodes {
                            id
                            title
                        }
                    }
                }
                ... on User {
                    projectsV2(first: 10) {
                        nodes {
                            id
                            title
                        }
                    }
                }
            }
        }
    `;

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    try {
        const response = await axios.post('https://api.github.com/graphql', { query }, { headers });
        console.log('GitHub API response:', response.data);

        return response.data.data.node.projectsV2.nodes;
    } catch (error) {
        console.error('Error listing projects:', error);
        throw error;
    }
}


export async function getGithubIssuesPrompt(org, issuesCache, username, onlyOpen, token) {
    try {
        console.log('only showing open issues', onlyOpen)

        if (!username) {
            console.log('getGithubIssuesPrompt does not have a username:', username)
            return 'No Issues for Sender';
        }
        const openCacheKey = `open-issues-${username}`;
        const closedCacheKey = `closed-issues-${username}`;
        if (!issuesCache.has(openCacheKey) || !issuesCache.has(closedCacheKey)) {
            console.log('fetching issues')
            const issues = await fetchGithubIssuesForUser(org, token, username);
            const openIssues = issues.filter(issue => issue.state === 'open');
            const closedIssues = issues.filter(issue => issue.state === 'closed');
            console.log('opened issues length', openIssues.length)
            console.log('closed issues length', closedIssues.length)
            // Store individual issues in the cache
            openIssues.forEach(issue => {
                const issueKey = `issue-${issue.number}`;
                issuesCache.set(issueKey, issue);
            });

            closedIssues.forEach(issue => {
                const issueKey = `issue-${issue.number}`;
                issuesCache.set(issueKey, issue);
            });

            // Construct messages for open and closed issues
            const openIssueMessages = openIssues.map(issue => formatIssueMessage(issue)).join('\n');
            const closedIssueMessages = closedIssues.map(issue => formatIssueMessage(issue)).join('\n');

            // Store the messages in the cache
            issuesCache.set(openCacheKey, openIssueMessages);
            issuesCache.set(closedCacheKey, closedIssueMessages);
            return onlyOpen ? `Open issues:\n${openIssueMessages || 'No open issues.'}` : `Closed issues:\n${closedIssueMessages || 'No closed issues.'}`;
        } else {
            console.log('getting issues from cache');
            const openIssues = issuesCache.get(openCacheKey);
            const closedIssues = issuesCache.get(closedCacheKey);
            console.log('opened issues length', openIssues.length)
            console.log('closed issues length', closedIssues.length)

            const finalIssues = onlyOpen ? openIssues : closedIssues;
            const prefix = onlyOpen ? 'Open issues' : 'Closed issues';
            return `${prefix}:\n${finalIssues || 'No issues.'}`;
        }
    } catch (error) {
        console.error('Error fetching GitHub issues:', error);
        return 'Failed to fetch issues.';
    }
}



export async function fetchRepos(org, token) {
    const url = `https://api.github.com/orgs/${org}/repos`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };

    try {
        const response = await axios.get(url, { headers });
        return response.data.map(repo => repo.name); // Return an array of repository names
    } catch (error) {
        console.error('Error fetching repositories:', error);
        return [];
    }
}