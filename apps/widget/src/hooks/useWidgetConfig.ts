import { useState, useEffect } from 'react';
import type { WidgetConfigResponse } from '../types.ts';
import { fetchWidgetConfig } from '../api/client.ts';

type State =
  | { status: 'loading' }
  | { status: 'ok'; config: WidgetConfigResponse }
  | { status: 'error' };

export function useWidgetConfig(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchWidgetConfig()
      .then(config => { if (!cancelled) setState({ status: 'ok', config }); })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, []);

  return state;
}
