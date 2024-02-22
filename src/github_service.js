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
    const url = `https://api.github.com/repos/${org}/${repo}/issues/${issueNumber}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };
    try {
        const response = await axios.patch(url, updateData, { headers });
        return response.data.html_url; // Return the URL of the updated issue
    } catch (error) {
        throw new Error(`Failed to update GitHub issue: ${error.response.statusText}`);
    }
}

export async function getGithubIssuesPrompt(org,issuesCache, username, onlyOpen,token) {
    try {
        if (!username) {
            return 'No Issues for Sender';
        }
        const openCacheKey = `open-issues-${username}`;
        const closedCacheKey = `closed-issues-${username}`;
        if (!issuesCache.has(openCacheKey) || !issuesCache.has(closedCacheKey)) {
            console.log('fetching issues')
            const issues = await fetchGithubIssuesForUser(org, token, username);
            const openIssues = issues.filter(issue => issue.state === 'open');
            const closedIssues = issues.filter(issue => issue.state === 'closed');

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
            const finalIssues = onlyOpen ? openIssues : closedIssues;
            const prefix = onlyOpen ? 'Open issues' : 'Closed issues';
            return `${prefix}:\n${finalIssues || 'No issues.'}`;
        }
    } catch (error) {
        console.error('Error fetching GitHub issues:', error);
        return 'Failed to fetch issues.';
    }
}



