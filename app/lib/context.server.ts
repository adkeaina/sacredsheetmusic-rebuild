import { createContext } from 'react-router';
import type { AppEnv } from './types.server';
export const cloudflareContext = createContext<{
  env: AppEnv;
  ctx: ExecutionContext;
}>();
