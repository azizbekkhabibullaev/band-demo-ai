import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../hooks/useChat.ts';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1 text-center max-w-[85%]">
          {message.content}
        </span>
      </div>
    );
  }

  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-2">
        <div className="max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words bg-[--accent-color] text-white rounded-br-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-2">
      <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words bg-gray-100 text-gray-800 rounded-bl-sm banker-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h3: ({ children }) => (
              <p className="font-semibold text-gray-900 mt-2 mb-0.5 first:mt-0">{children}</p>
            ),
            h4: ({ children }) => (
              <p className="font-semibold text-gray-700 mt-1.5 mb-0.5 first:mt-0">{children}</p>
            ),
            p: ({ children }) => (
              <p className="mb-1.5 last:mb-0">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="mb-1.5 space-y-0.5 pl-1">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-1.5 space-y-0.5 pl-4 list-decimal">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="flex gap-1.5 items-start"><span className="shrink-0 mt-0.5">•</span><span>{children}</span></li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-gray-900">{children}</strong>
            ),
            hr: () => <hr className="my-2 border-gray-200" />,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2">{children}</a>
            ),
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
