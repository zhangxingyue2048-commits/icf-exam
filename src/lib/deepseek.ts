import OpenAI from 'openai'

export const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
})

export async function chat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2000,
  })
  return response.choices[0]?.message?.content ?? ''
}
