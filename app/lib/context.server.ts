import { createContext } from 'react-router';
import type { AppEnv, AuthState } from './types.server';
export const cloudflareContext = createContext<{
  env: AppEnv;
  ctx: ExecutionContext;
  authState: AuthState;
}>();
