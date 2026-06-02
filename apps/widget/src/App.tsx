import { useEffect } from 'react';
import { useWidgetConfig } from './hooks/useWidgetConfig.ts';
import { ChatWidget } from './components/ChatWidget.tsx';

interface BankPageProps {
  displayName: string;
}

function BankPage({ displayName }: BankPageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[--accent-color]" />
        <span className="font-semibold text-gray-900">{displayName}</span>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to {displayName}
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Fast, secure banking for everyone. Loans, cards, deposits and more.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-6 py-3 rounded-full bg-[--accent-color] text-white font-medium hover:opacity-90 transition-opacity">
            Get Started
          </button>
          <button className="px-6 py-3 rounded-full border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            Learn More
          </button>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const state = useWidgetConfig();
  const accentColor = state.status === 'ok' ? state.config.branding.accentColor : null;

  useEffect(() => {
    if (accentColor) {
      document.documentElement.style.setProperty('--accent-color', accentColor);
    }
  }, [accentColor]);

  const displayName = state.status === 'ok' ? state.config.branding.displayName : 'Ipoteka Bank';

  return (
    <>
      <BankPage displayName={displayName} />
      {state.status === 'ok' && <ChatWidget config={state.config} />}
    </>
  );
}
