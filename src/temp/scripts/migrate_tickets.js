import axios from 'axios';
import {
    fetchProjects,
    addIssueToProject,
    // fetchCustomFieldID,
    // fetchProjectItems,
    // updateCustomFieldInNewItem
} from '../../github_service';


// Fetches the ID of a custom field based on the field name in the new project
async function fetchCustomFieldID(projectId, fieldName, token) {
    const query = `
        query ($projectId: ID!) {
            node(id: $projectId) {
                ... on ProjectV2 {
                    fields(first: 10) {
                        nodes {
                            id
                            name
                        }
                    }
                }
            }
        }
    `;

    const variables = { projectId };

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    try {
        const response = await axios.post('https://api.github.com/graphql', JSON.stringify({ query, variables }), { headers });
        const fields = response.data.data.node.fields.nodes;
        const field = fields.find(f => f.name === fieldName);
        return field ? field.id : null;
    } catch (error) {
        console.error('Error fetching custom field ID:', error);
        throw error;
    }
}

// Fetches items from a specific project
async function fetchProjectItems(projectId, token) {
    const query = `
        query ($projectId: ID!) {
            node(id: $projectId) {
                ... on ProjectV2 {
                    items(first: 100) {
                        nodes {
                            id
                            content {
                                ... on Issue {
                                    id
                                }
                                ... on PullRequest {
                                    id
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    const variables = { projectId };

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    try {
        const response = await axios.post('https://api.github.com/graphql', JSON.stringify({ query, variables }), { headers });
        const items = response.data.data.node.items.nodes.map(node => node.content.id);
        return items;
    } catch (error) {
        console.error('Error fetching project items:', error);
        throw error;
    }
}

// Updates a custom field in the newly created item with the provided value
async function updateCustomFieldInNewItem(token, itemId, fieldId, value) {
    const mutation = `
        mutation ($itemId: ID!, $fieldId: ID!, $value: String!) {
            updateProjectV2ItemField(input: {projectId: $itemId, fieldId: $fieldId, value: $value}) {
                projectV2Item {
                    id
                }
            }
        }
    `;

    const variables = { itemId, fieldId, value: JSON.stringify(value) };

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    try {
        const response = await axios.post('https://api.github.com/graphql', JSON.stringify({ query: mutation, variables }), { headers });
        return response.data.data.updateProjectV2ItemField.projectV2Item.id;
    } catch (error) {
        console.error('Error updating custom field in new item:', error);
        throw error;
    }
}

// Main migration function
async function migrateProjectsToNewTemplate(org, token, newProjectId, customFieldName) {
    // Fetch all projects excluding the new template project
    const allProjects = await fetchProjects(org, token);
    const customFieldId = await fetchCustomFieldID(newProjectId, customFieldName, token);

    for (const project of allProjects) {
        if (project.id === newProjectId) continue; // Skip the new template project

        const items = await fetchProjectItems(project.id, token);

        for (const item of items) {
            // Migrate each item to the new project
            const newItemId = await addIssueToProject(token, newProjectId, item);
            // Update the custom field in the new project with the original project's name
            // await updateCustomFieldInNewItem(token, newItemId, customFieldId, project.title);
        }
    }
}

// Replace 'orgName', 'yourPersonalAccessToken', 'newTemplateProjectId', and 'customFieldName' with your actual data
const orgName = 'yourOrgName';
const personalAccessToken = 'yourPersonalAccessToken';
const newTemplateProjectId = 'yourNewTemplateProjectId';
const customFieldName = 'OriginalProjectName';

// Start the migration
// Start the migration
migrateProjectsToNewTemplate(orgName, personalAccessToken, newTemplateProjectId, customFieldName)
    .then(() => console.log('Migration completed successfully.'))
    .catch(error => console.error('Migration failed:', error));