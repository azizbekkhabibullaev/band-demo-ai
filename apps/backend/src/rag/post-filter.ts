const BLOCKLIST: Array<{ pattern: RegExp; name: string }> = [
  {
    // Legacy prompt structure markers (═══ style)
    pattern:
      /═══\s*(IDENTITY|LANGUAGE|TONE|CONVERSATION RULES|SECURITY|ESCALATION|PROHIBITED|KNOWLEDGE BASE)/i,
    name: 'prompt_structure_leak',
  },
  {
    // New prompt structure header leaks
    pattern:
      /###\s*(🏦\s*Knowledge Base|🎯\s*Detected customer intent|💡\s*(Инструкции|Instructions|ko'rsatmalari)|⚠️\s*(Банковская|Banking|Bank))/i,
    name: 'prompt_structure_leak',
  },
  {
    // AI provider disclosure
    pattern:
      /\b(OpenAI|GPT-4|GPT4|GPT 4|Claude|Anthropic|Gemini|Llama|Mistral|ChatGPT)\b/i,
    name: 'ai_provider_mention',
  },
  {
    // Language lock instruction reproduction
    pattern: /respond only in \w+ never switch/i,
    name: 'language_lock_reproduced',
  },
  {
    // Code blocks for programming languages — banking assistants never output runnable code
    pattern: /```\s*(python|javascript|typescript|java|c\+\+|c#|php|ruby|go|rust|bash|shell|powershell|html|css|sql|json|yaml|xml)/i,
    name: 'off_topic_code_block',
  },
  {
    // Medical dosage advice — should never appear in a banking assistant response
    pattern: /\b(take\s+.{0,30}(mg|milligrams?|таблетк|капсул)|(dosage|dose)\s+(is|of)\s+\d|принимайте\s+\d|ичинг\s+\d+\s*мг)/i,
    name: 'medical_advice',
  },
];

export function checkOutput(text: string): { ok: boolean; reason?: string } {
  for (const entry of BLOCKLIST) {
    if (entry.pattern.test(text)) {
      return { ok: false, reason: entry.name };
    }
  }
  return { ok: true };
}
