// Synthetic Messages response, never evidence of a live Claude request.
export const anthropicReply = () => ({
  id: 'msg-synthetic',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  stop_reason: 'end_turn',
  usage: { input_tokens: 50, output_tokens: 30, server_tool_use: { web_search_requests: 1 } },
  content: [
    {
      type: 'server_tool_use',
      id: 'search-1',
      name: 'web_search',
      input: { query: 'independent scheduling tools' },
    },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'search-1',
      content: [
        {
          type: 'web_search_result',
          url: 'https://reddit.com/r/tools',
          title: 'Buyer discussion',
          encrypted_content: 'synthetic',
        },
        {
          type: 'web_search_result',
          url: 'https://unused.example/',
          title: 'Search only',
          encrypted_content: 'synthetic',
        },
      ],
    },
    {
      type: 'text',
      text: '**OrbitCal** helps teams. Compare buyer evidence.',
      citations: [
        {
          type: 'web_search_result_location',
          url: 'https://reddit.com/r/tools',
          title: 'Buyer discussion',
          encrypted_index: 'synthetic',
          cited_text: 'A source quote, not an answer offset.',
        },
      ],
    },
  ],
});
