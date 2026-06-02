import type { Lang } from '@bank-chatbot/shared';

export interface TenantConfig {
  hotline: string;
  supportEmail?: string;
  branding: {
    displayName: string;
    logoUrl: string | null;
    accentColor: string;
  };
  languages: {
    default: Lang;
    enabled: Lang[];
  };
  model: {
    chat: string;
    embedding: string;
  };
  limits: {
    ratePerMinPerIp: number;
    messagesPerSessionPer10Min: number;
    maxMessageLength: number;
    monthlyLlmBudgetUsd: number;
  };
  greeting: Record<Lang, string>;
}

export interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  allowedOrigins: string[];
  config: TenantConfig;
}
