import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import dynamic from 'next/dynamic'

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

export default function Home() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [currentTypingMessage, setCurrentTypingMessage] = useState('')
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [sidePanel, setSidePanel] = useState<{ isOpen: boolean; content: string; isMermaid: boolean }>({
    isOpen: false,
    content: '',
    isMermaid: false,
  })
  const [showMermaidSource, setShowMermaidSource] = useState(false)

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
      console.error('API 请求错误:', error)
      setIsTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${error.message}` }])
    }
  }

  const handleCodeBlockClick = (content: string, language: string) => {
    const isMermaid = language === 'mermaid'
    setSidePanel({ isOpen: true, content, isMermaid })
    setShowMermaidSource(false)
  }

  const closeSidePanel = () => {
    setSidePanel({ isOpen: false, content: '', isMermaid: false })
  }

  const toggleMermaidView = () => {
    setShowMermaidSource(!showMermaidSource)
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
          点击查看{language === 'mermaid' ? '图表' : '代码'} ({language})
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
        <title>AI多轮对话应用</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC&display=swap" rel="stylesheet" />
      </Head>

      <main className="main">
        <h1 className="title">AI多轮对话应用</h1>
        <div className="chat-container" ref={chatContainerRef}>
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
          <button type="submit" className="send-button">发送</button>
        </form>
      </main>

      {sidePanel.isOpen && (
        <div className="side-panel">
          <button className="close-button" onClick={closeSidePanel}>关闭</button>
          {sidePanel.isMermaid && (
            <button className="toggle-button" onClick={toggleMermaidView}>
              {showMermaidSource ? '查看图表' : '查看源码'}
            </button>
          )}
          {sidePanel.isMermaid && !showMermaidSource ? (
            <MermaidRenderer content={sidePanel.content} />
          ) : (
            <pre><code>{sidePanel.content}</code></pre>
          )}
        </div>
      )}

      <style jsx global>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          background-color: #f0f0f0;
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
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 1rem;
          background-color: white;
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
        }
        .input-field {
          flex-grow: 1;
          padding: 0.5rem;
          font-size: 1rem;
          border: 1px solid #ddd;
          border-radius: 4px 0 0 4px;
        }
        .send-button {
          padding: 0.5rem 1rem;
          font-size: 1rem;
          color: white;
          background-color: #007bff;
          border: none;
          border-radius: 0 4px 4px 0;
          cursor: pointer;
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
          background-color: #f0f0f0;
          padding: 0.5rem;
          margin: 0.5rem 0;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .code-block-preview:hover {
          background-color: #e0e0e0;
        }

        .side-panel {
          position: fixed;
          top: 0;
          right: 0;
          width: 40%;
          height: 100%;
          background-color: white;
          box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
          padding: 1rem;
          overflow-y: auto;
          z-index: 1000;
        }

        .close-button {
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 5px 10px;
          background-color: #f0f0f0;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .toggle-button {
          position: absolute;
          top: 10px;
          right: 80px;
          padding: 5px 10px;
          background-color: #f0f0f0;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .mermaid {
          text-align: center;
        }

        .side-panel pre {
          background-color: #f4f4f4;
          padding: 1rem;
          border-radius: 4px;
          overflow-x: auto;
        }

        .side-panel svg {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  )
}