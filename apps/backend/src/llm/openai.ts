export interface ChatCompletionParams {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: { role: string; content: string }[];
}

export interface ChatStreamCallbacks {
  onDelta: (text: string) => void;
}

export interface StreamResult {
  promptTokens: number;
  completionTokens: number;
}

export async function streamChatCompletion(
  params: ChatCompletionParams,
  callbacks: ChatStreamCallbacks,
): Promise<StreamResult> {
  const { apiKey, model, systemPrompt, messages } = params;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI chat ${res.status}: ${body}`);
  }

  if (!res.body) throw new Error('OpenAI response body is null');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let promptTokens = 0;
  let completionTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      const chunk = parsed as {
        choices?: [{ delta?: { content?: string } }];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) callbacks.onDelta(delta);
    }
  }

  return { promptTokens, completionTokens };
}
