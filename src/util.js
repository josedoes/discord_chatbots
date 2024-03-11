export function formatIssueMessage(issue) {
    const assignees = issue.assignees ? issue.assignees.map(assignee => assignee.login).join(', ') : 'None';
    const description = issue.body ? issue.body.split(' ').slice(0, 10).join(' ') : 'No description provided';
    return `Title: ${issue.title}\nDescription: ${description}...\nStatus: ${issue.state}\nAssignees: ${assignees}\nLink: ${issue.html_url}\n`;
}

export function formatUpdateData(result) {
    let updateData = {};
    try {
        const parsedResult = JSON.parse(result);
        if (typeof parsedResult === 'object') {
            if (parsedResult.name) updateData.title = parsedResult.name;
            if (parsedResult.description) updateData.body = parsedResult.description;
            if (parsedResult.assignees) {
                if (typeof parsedResult.assignees === 'string') {
                    try {
                        updateData.assignees = JSON.parse(parsedResult.assignees);
                    } catch (e) {
                        updateData.assignees = parsedResult.assignees.split(',').map(a => a.trim());
                    }
                } else {
                    updateData.assignees = parsedResult.assignees;
                }
            }
            if (parsedResult.status) updateData.state = parsedResult.status;
            if (parsedResult.repo || parsedResult.repository) updateData.repo = parsedResult.repo || parsedResult.repository;
            if (parsedResult.projects) {
                if (typeof parsedResult.projects === 'string') {
                    try {
                        updateData.projects = JSON.parse(parsedResult.projects);
                    } catch (e) {
                        updateData.projects = parsedResult.projects.split(',').map(a => a.trim());
                    }
                } else {
                    updateData.projects = parsedResult.projects;
                }
            }
        }
    } catch (e) {
        const fields = ['name', 'description', 'assignees', 'status', 'repo', 'repository', 'projects'];
        for (const field of fields) {
            const regex = new RegExp(`"${field}":\\s*"([^"]*)"`, 'i');
            const match = result.match(regex);
            if (match) {
                const value = match[1].trim();
                switch (field) {
                    case 'name':
                        updateData.title = value;
                        break;
                    case 'description':
                        updateData.body = value;
                        break;
                    case 'assignees':
                        try {
                            updateData.assignees = JSON.parse(value);
                        } catch (e) {
                            updateData.assignees = value.split(',').map(a => a.trim());
                        }
                        break;
                    case 'status':
                        updateData.state = value;
                        break;
                    case 'repo':
                    case 'repository':
                        updateData.repo = value;
                        break;
                    case 'projects':
                        try {
                            updateData.projects = JSON.parse(value);
                        } catch (e) {
                            updateData.projects = value.split(',').map(a => a.trim());
                        }
                        break;
                }
            }
        }
    }

    return updateData;
}



export function getRepoAndIssueNumberFromLink(response) {
    try {
        console.log('getRepoAndIssueNumberFromLink called with data:', response)
        const issueUrlRegex = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/;
        const match = response.match(issueUrlRegex);

        if (match) {
            return {
                org: match[1],
                repo: match[2],
                issueNumber: match[3]
            };
        } else {
            return null;
        }
    } catch (e) {
        console.error(e)
        return null;
    }

}

export function extractIssueNumberFromUrl(url) {
    const match = url.match(/\/issues\/(\d+)$/);
    return match ? match[1] : null;
}

