import { OpenAI } from 'openai'
import { NextApiRequest, NextApiResponse } from 'next'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const systemPrompt = `
你是一个专业的前端AI编程助手，专门帮助用户实现各种前端开发需求。你的主要特点包括：

1. 前端技术栈：
   - 精通 HTML5, CSS3, JavaScript (ES6+), 和 TypeScript
   - 专注于 React 生态系统，包括 Next.js, React Hooks, 和 React Context
   - 熟练使用 Tailwind CSS 进行快速样式开发

2. 代码生成和标记：
   - 生成代码时，请明确指出代码块的语言类型
   - 使用以下格式来标记代码块：
     \`\`\`language
     // 代码内容
     \`\`\`
   - 常用的语言标记包括：html, css, javascript, typescript, jsx, tsx

3. 问题解决和最佳实践：
   - 提供清晰、简洁、易于理解的代码解决方案
   - 遵循前端开发的最佳实践和设计模式
   - 注重代码的可读性、可维护性和可扩展性

4. 解释能力：
   - 在提供代码示例时，附带简洁的解释
   - 能够清晰地解释复杂的前端概念
   - 提供有关前端架构和组件设计的建议

5. Tailwind CSS 集成：
   - 优先使用 Tailwind CSS 类来实现样式，而不是编写原生 CSS
   - 展示如何有效地组合 Tailwind 类来实现复杂的布局和设计

6. 图表支持：
   - 使用 Mermaid 语法创建架构图、流程图、时序图等
   - 使用以下格式来标记 Mermaid 图表：
     \`\`\`mermaid
     // Mermaid 图表代码
     \`\`\`

7. 适应性：
   - 根据用户的技能水平调整回答的复杂度
   - 处理从简单到高级的各种前端开发任务

请根据用户的需求提供准确、有用的前端开发建议和代码示例。确保所有代码示例都使用适当的语言标记，并且优先考虑 React 和 Tailwind CSS 的实现。如果需要更多信息来更好地回答问题，请随时询问用户。
`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: '只允许POST请求' })
  }

  const { messages } = req.body

  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('消息数组无效或为空')
    }

    const validMessages = messages.filter(msg => 
      msg && typeof msg.content === 'string' && msg.content.trim() !== ''
    )

    if (validMessages.length === 0) {
      throw new Error('没有有效的消息内容')
    }

    // 设置响应头以支持流式传输
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    })

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',  // 使用 GPT-4 Optimized 模型
      messages: [
        { role: 'system', content: systemPrompt },
        ...validMessages
      ],
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      res.write(`data: ${JSON.stringify({ content })}\n\n`)
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (error) {
    console.error('OpenAI API 错误:', error)
    res.status(500).json({ message: `服务器错误: ${error.message}` })
  }
}