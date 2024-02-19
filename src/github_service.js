import axios from 'axios';

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



