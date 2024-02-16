import axios from 'axios';

export async function fetchData(apikey, model, messages) {
    const data = JSON.stringify({
        model: model,
        stream: false,
        messages
    });

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://launch-api.com/v1/chat/completions',
        headers: {
            apikey: apikey, // 'apikey' value is taken from the function parameter
            'Content-Type': 'application/json'
        },
        data: data
    };

    try {
        const response = await axios.request(config);
        return response.data.choices[0].message.content;
    } catch (error) {
        console.log(error);
    }
}