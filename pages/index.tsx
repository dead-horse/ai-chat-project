import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import dynamic from 'next/dynamic'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { X } from 'lucide-react'  // 导入关闭图标

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface CodeBlock {
  language: string
  content: string
}

// 新增的 MermaidRenderer 组件
const MermaidRenderer = ({ content }: { content: string }) => {
  const [svg, setSvg] = useState<string>('')

  useEffect(() => {
    const renderMermaid = async () => {
      if (typeof window !== 'undefined') {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'default' })
        try {
          const { svg } = await mermaid.render('mermaid-diagram', content)
          setSvg(svg)
        } catch (error) {
          console.error('Mermaid rendering error:', error)
          setSvg(`<pre>${content}</pre>`) // 如果渲染失败，显示原始内容
        }
      }
    }
    renderMermaid()
  }, [content])

  return <div dangerouslySetInnerHTML={{ __html: svg }} />
}

// 安全的 HTML 渲染器
const SafeHtml = ({ html }: { html: string }) => (
  <div dangerouslySetInnerHTML={{ __html: html }} />
)

const recommendedQuestions = [
  "画一个 TCP 建立连接的时序图",
  "用 HTML 绘制一个登陆页",
  "实现一个 BI 看板页"
]

export default function Home() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [currentTypingMessage, setCurrentTypingMessage] = useState('')
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [sidePanel, setSidePanel] = useState<{ isOpen: boolean; content: string; isMermaid: boolean; isHtml: boolean }>({
    isOpen: false,
    content: '',
    isMermaid: false,
    isHtml: false,
  })
  const [showMermaidSource, setShowMermaidSource] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("rendered")

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, currentTypingMessage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const newUserMessage: Message = { role: 'user', content: input.trim() }
    setMessages(prev => [...prev, newUserMessage])
    setInput('')
    setIsTyping(true)
    
    try {
      const validMessages = [...messages, newUserMessage].filter(msg => msg.content && msg.content.trim() !== '')
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: validMessages }),
      })
      
      if (!response.ok) {
        throw new Error('网络响应不正常')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法获取响应流')
      }

      let accumulatedContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              setIsTyping(false)
              setMessages(prev => [...prev, { role: 'assistant', content: accumulatedContent }])
              setCurrentTypingMessage('')
              break
            }
            try {
              const { content } = JSON.parse(data)
              accumulatedContent += content
              setCurrentTypingMessage(accumulatedContent)
            } catch (error) {
              console.error('解析错误:', error)
            }
          }
        }
      }
    } catch (error) {
      console.error('API 请错误:', error)
      setIsTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${error.message}` }])
    }
  }

  const handleCodeBlockClick = (content: string, language: string) => {
    const isMermaid = language === 'mermaid'
    const isHtml = language === 'html'
    setSidePanel({ isOpen: true, content, isMermaid, isHtml })
    setActiveTab("rendered")  // 默认显示渲染结果
  }

  const closeSidePanel = () => {
    setSidePanel({ isOpen: false, content: '', isMermaid: false, isHtml: false })
  }

  const toggleMermaidView = () => {
    setShowMermaidSource(!showMermaidSource)
  }

  const handleRecommendedQuestion = (question: string) => {
    setInput(question)
    handleSubmit(new Event('submit') as React.FormEvent<HTMLFormElement>)
  }

  const renderMessage = (content: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
    const parts = []
    let lastIndex = 0
    let match

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <ReactMarkdown key={lastIndex} remarkPlugins={[remarkGfm]}>
            {content.slice(lastIndex, match.index)}
          </ReactMarkdown>
        )
      }
      const language = match[1] || 'plaintext'
      const codeContent = match[2].trim()
      parts.push(
        <div
          key={match.index}
          className="code-block-preview"
          onClick={() => handleCodeBlockClick(codeContent, language)}
        >
          点击查看{language === 'mermaid' ? '图表' : language === 'html' ? 'HTML' : '代码'} ({language})
        </div>
      )
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      parts.push(
        <ReactMarkdown key={lastIndex} remarkPlugins={[remarkGfm]}>
          {content.slice(lastIndex)}
        </ReactMarkdown>
      )
    }

    return parts
  }

  return (
    <div className="container">
      <Head>
        <title>Aily Play</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC&display=swap" rel="stylesheet" />
      </Head>

      <main className="main">
        <h1 className="title">Aily Play</h1>
        <div className="chat-container" ref={chatContainerRef}>
          {messages.length === 0 && (
            <div className="recommended-questions">
              <h2>推荐问题</h2>
              <div className="question-cards">
                {recommendedQuestions.map((question, index) => (
                  <div 
                    key={index} 
                    className="question-card"
                    onClick={() => handleRecommendedQuestion(question)}
                  >
                    {question}
                  </div>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              {renderMessage(msg.content)}
            </div>
          ))}
          {isTyping && (
            <div className="message assistant typing">
              {renderMessage(currentTypingMessage)}
              <span className="typing-indicator">▋</span>
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="input-form">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入您的消息..."
            className="input-field"
          />
          <button type="submit" className="send-button">发</button>
        </form>
      </main>

      {sidePanel.isOpen && (
        <div className="side-panel">
          <div className="side-panel-header">
            {(sidePanel.isMermaid || sidePanel.isHtml) && (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-[300px] grid-cols-2 gap-4 p-1 bg-white rounded-lg border border-gray-200">
                  <TabsTrigger 
                    value="rendered" 
                    className="px-4 py-2 text-sm font-medium transition-colors rounded-md bg-white hover:bg-gray-100 data-[state=active]:bg-gray-200"
                  >
                    渲染结果
                  </TabsTrigger>
                  <TabsTrigger 
                    value="source" 
                    className="px-4 py-2 text-sm font-medium transition-colors rounded-md bg-white hover:bg-gray-100 data-[state=active]:bg-gray-200"
                  >
                    源代码
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <button className="close-icon" onClick={closeSidePanel}>
              <X size={24} />
            </button>
          </div>
          <div className="side-panel-content">
            {(sidePanel.isMermaid || sidePanel.isHtml) ? (
              <Tabs value={activeTab} className="w-full">
                <TabsContent value="rendered">
                  {sidePanel.isMermaid ? (
                    <MermaidRenderer content={sidePanel.content} />
                  ) : sidePanel.isHtml ? (
                    <SafeHtml html={sidePanel.content} />
                  ) : null}
                </TabsContent>
                <TabsContent value="source">
                  <pre><code>{sidePanel.content}</code></pre>
                </TabsContent>
              </Tabs>
            ) : (
              <pre><code>{sidePanel.content}</code></pre>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        body {
          background-color: white;
          margin: 0;
          padding: 0;
        }
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          background-color: white; // 修改为白色
        }
        .main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          width: 100%;
          max-width: 800px;
        }
        .title {
          margin: 0 0 2rem;
          line-height: 1.15;
          font-size: 3rem;
          text-align: center;
        }
        .chat-container {
          width: 100%;
          height: 60vh;
          overflow-y: auto;
          padding: 1rem;
          background-color: white;
          // 移除了 border 属性
        }
        .message {
          max-width: 80%;
          margin-bottom: 1rem;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          line-height: 1.4;
          word-wrap: break-word;
        }
        .user {
          background-color: #007bff;
          color: white;
          align-self: flex-end;
          margin-left: auto;
        }
        .assistant {
          background-color: #f1f0f0;
          color: black;
          align-self: flex-start;
        }
        .typing {
          background-color: #e6e6e6;
        }
        .typing-indicator {
          display: inline-block;
          width: 10px;
          animation: blink 0.7s infinite;
        }
        .input-form {
          display: flex;
          width: 100%;
          margin-top: 1rem;
          gap: 0.5rem; // 添加间距
        }
        .input-field {
          flex-grow: 1;
          padding: 0.5rem;
          font-size: 1rem;
          border: 1px solid #ddd;
          border-radius: 4px; // 改为完整的圆角
        }
        .send-button {
          padding: 0.5rem 1rem;
          font-size: 1rem;
          color: white;
          background-color: #007bff;
          border: none;
          border-radius: 4px; // 保持一致的圆角
          cursor: pointer;
          transition: background-color 0.2s; // 添加过渡效果
        }
        .send-button:hover {
          background-color: #0056b3;
        }
        @keyframes blink {
          0% { opacity: 0.2; }
          20% { opacity: 1; }
          100% { opacity: 0.2; }
        }
        /* Markdown 样式 */
        .message p {
          margin: 0 0 1em 0;
        }
        .message p:last-child {
          margin-bottom: 0;
        }
        .message pre {
          background-color: #f4f4f4;
          padding: 1em;
          border-radius: 5px;
          overflow-x: auto;
        }
        .message code {
          background-color: #f4f4f4;
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-size: 0.85em;
        }
        .message pre code {
          background-color: transparent;
          padding: 0;
        }
        .message ul, .message ol {
          margin: 0 0 1em 0;
          padding-left: 2em;
        }
        .message table {
          border-collapse: collapse;
          margin-bottom: 1em;
        }
        .message th, .message td {
          border: 1px solid #ddd;
          padding: 0.5em;
        }
        .message blockquote {
          border-left: 4px solid #ddd;
          padding-left: 1em;
          margin-left: 0;
          color: #666;
        }

        .code-block-preview {
          background-color: white;
          padding: 0.75rem 1rem;
          margin: 1rem 0;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
          border: 1px solid #e0e0e0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .code-block-preview:hover {
          background-color: #f8f8f8;
        }

        .side-panel {
          position: fixed;
          top: 0;
          right: 0;
          width: 40%;
          height: 100%;
          background-color: white;
          box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          z-index: 1000;
        }

        .side-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid #e0e0e0;
        }

        .close-icon {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          transition: color 0.2s;
        }

        .close-icon:hover {
          color: #000;
        }

        /* 自定义 Tabs 样式 */
        [role="tablist"] {
          background-color: white;
          border-radius: 8px;
          padding: 4px;
          display: inline-flex;
          gap: 16px;
          border: 1px solid #e5e7eb; /* 更浅的边框颜色 */
        }

        [role="tab"] {
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 500;
          transition: background-color 0.2s, color 0.2s;
          border-radius: 6px;
          background-color: white;
          color: #333;
          cursor: pointer;
          border: 1px solid #e5e7eb; /* 更浅的边框颜色 */
        }

        [role="tab"]:hover {
          background-color: #f3f4f6;
        }

        [role="tab"][data-state="active"] {
          background-color: #e5e7eb; /* 更深的背景颜色 */
          color: #000;
        }

        .side-panel-content {
          padding: 1rem;
        }

        .side-panel-content pre {
          background-color: #f4f4f4;
          padding: 1rem;
          border-radius: 4px;
          overflow-x: auto;
        }

        .recommended-questions {
          text-align: center;
          margin-bottom: 2rem;
        }

        .recommended-questions h2 {
          font-size: 1.5rem;
          margin-bottom: 1rem;
        }

        .question-cards {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 1rem;
        }

        .question-card {
          background-color: #f0f0f0;
          border-radius: 8px;
          padding: 1rem;
          cursor: pointer;
          transition: background-color 0.2s, transform 0.2s;
          max-width: 200px;
        }

        .question-card:hover {
          background-color: #e0e0e0;
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  )
}