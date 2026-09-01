// API base URL — comes solely from EXPO_PUBLIC_API_URL (set in frontend/.env,
// or per build profile in eas.json). No fallback: when it is unset or empty the
// guard in services/api.ts throws, rather than silently targeting a default host.
// Example values:
//   Android emulator:       http://10.0.2.2:8000
//   Physical device (LAN):  http://192.168.x.x:8000
//   Production:              https://api.your-domain.com
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Must match MAX_UPLOAD_SIZE_MB env var on the backend.
export const MAX_UPLOAD_SIZE_MB = 50;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export default API_BASE_URL;