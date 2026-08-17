import appLogger from '@/utils/logger';
import { isDemoMode } from '@/demo/config';

export const projectKey = import.meta.env.VITE_CTP_PROJECT_KEY;
export const clientId = import.meta.env.VITE_CTP_CLIENT_ID;
export const clientSecret = import.meta.env.VITE_CTP_CLIENT_SECRET;
export const apiUrl = import.meta.env.VITE_CTP_API_URL;
export const authUrl = import.meta.env.VITE_CTP_AUTH_URL;
export const scopes = import.meta.env.VITE_CTP_SCOPES?.split(' ') || [];

if (
  !isDemoMode &&
  (!projectKey ||
    !clientId ||
    !clientSecret ||
    !apiUrl ||
    !authUrl ||
    !scopes.length)
) {
  appLogger.error(
    'Not all required CommerceTools environment variables found in .env!',
  );
}
