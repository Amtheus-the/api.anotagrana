const axios = require('axios');

const callOpenAI = async ({ messages, max_tokens = 200, apiKey }) => {
  console.log('[OPENAI][DEBUG][REQUEST]', JSON.stringify({ messages, max_tokens }));
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );
  console.log('[OPENAI][DEBUG][RESPONSE]', JSON.stringify(response.data));
  return response.data.choices[0].message.content.trim();
};

module.exports = { callOpenAI };
