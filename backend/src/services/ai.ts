/**
 * Sends a prompt to the OpenRouter API using the configured sk-or key.
 * Calls gemini-flash-1.5 as the default model.
 * Falls back to static templates if OpenRouter key is not set.
 */
export const askGemini = async (prompt: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!apiKey || apiKey === 'your_openrouter_api_key') {
    return 'OpenRouter API key is not configured. Fallback details are displayed.';
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5000',
        'X-Title': 'CodeAtlas AI',
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content || 'No response returned from AI model.';
  } catch (error) {
    console.error('[OpenRouter AI Service] Invocations failed:', error);
    return `Failed to fetch response from OpenRouter API: ${(error as Error).message}`;
  }
};

// Export alias for easy routing mappings
export const askAI = askGemini;
