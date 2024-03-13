import { LLMLabSDK } from 'llm_lab';
export async function fetchData(apikey, model, messages, maxTokens = 500) {

    const sdk = new LLMLabSDK(apikey);

    console.log('model', model)
    const data = {
        model: model,
        stream: false,
        maxTokens: maxTokens,
        messages: messages
    };

    console.log('sending data..', data)
    try {
        const response = await sdk.chatWithAgentFuture(data);
        return response.content;
    } catch (error) {
        console.log(error);
    }
}