import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useWidgetConfig } from './hooks/useWidgetConfig.ts';
import { ChatWidget } from './components/ChatWidget.tsx';
import type { WidgetConfigResponse } from './types.ts';

// Default config shown when backend is unreachable (cold start, CORS etc.)
const DEFAULT_CONFIG: WidgetConfigResponse = {
  tenant_id: 'ipoteka-bank',
  name: 'Ipoteka Bank',
  branding: { displayName: 'Ipoteka Bank', logoUrl: null, accentColor: '#1e40af' },
  languages: { default: 'ru', enabled: ['uz', 'ru'] },
  hotline: '1234',
  greeting: {
    uz: 'Salom! Ipoteka Bank xizmatiga xush kelibsiz. Qanday yordam bera olaman?',
    ru: 'Здравствуйте! Добро пожаловать в Ипотека Банк. Чем могу помочь?',
    en: 'Hello! Welcome to Ipoteka Bank. How can I help you?',
  },
};

// Admin pages
import { LoginPage }        from './admin/pages/Login.tsx';
import { DashboardPage }    from './admin/pages/Dashboard.tsx';
import { ConversationsPage } from './admin/pages/Conversations.tsx';
import { TrendsPage }       from './admin/pages/Trends.tsx';
import { ComplaintsPage }   from './admin/pages/Complaints.tsx';
import { IntentsPage }      from './admin/pages/Intents.tsx';
import { LeadsPage }        from './admin/pages/Leads.tsx';
import { EscalationsPage }  from './admin/pages/Escalations.tsx';
import { InsightsPage }     from './admin/pages/Insights.tsx';
import { SettingsPage }     from './admin/pages/Settings.tsx';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_token');
  if (!token) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

// ─── Customer-facing bank page ────────────────────────────────────────────────

function BankPage({ displayName }: { displayName: string }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[--accent-color]" />
        <span className="font-semibold text-gray-900">{displayName}</span>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to {displayName}</h1>
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

function WidgetRoot() {
  const state = useWidgetConfig();
  // Resolve config: use fetched config if available, fall back to default so the
  // widget is always visible even when the backend is temporarily unreachable.
  const config: WidgetConfigResponse =
    state.status === 'ok' ? state.config : DEFAULT_CONFIG;

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', config.branding.accentColor);
  }, [config.branding.accentColor]);

  return (
    <>
      <BankPage displayName={config.branding.displayName} />
      {/* Render widget on 'ok' (real config) or 'error' (fallback config).
          Only skip on 'loading' to avoid a flash with wrong config. */}
      {state.status !== 'loading' && <ChatWidget config={config} />}
    </>
  );
}

// ─── Root app with router ─────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Customer-facing */}
        <Route path="/" element={<WidgetRoot />} />

        {/* Admin auth */}
        <Route path="/admin/login" element={<LoginPage />} />

        {/* Protected admin routes */}
        <Route path="/admin" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/admin/conversations" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
        <Route path="/admin/trends"        element={<ProtectedRoute><TrendsPage /></ProtectedRoute>} />
        <Route path="/admin/complaints"    element={<ProtectedRoute><ComplaintsPage /></ProtectedRoute>} />
        <Route path="/admin/intents"       element={<ProtectedRoute><IntentsPage /></ProtectedRoute>} />
        <Route path="/admin/leads"         element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
        <Route path="/admin/escalations"   element={<ProtectedRoute><EscalationsPage /></ProtectedRoute>} />
        <Route path="/admin/insights"      element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />
        <Route path="/admin/settings"      element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
