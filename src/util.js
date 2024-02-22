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
            if (parsedResult.assignees) updateData.assignees = parsedResult.assignees.split(',').map(a => a.trim());
            if (parsedResult.status) updateData.state = parsedResult.status;
        }
    } catch (e) {
        // If JSON parsing fails, proceed with regular expression parsing
        const fields = ['name', 'description', 'assignees', 'status'];
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
                        updateData.assignees = value.split(',').map(a => a.trim());
                        break;
                    case 'status':
                        updateData.state = value;
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