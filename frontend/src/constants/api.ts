// Android emulator: backend is at 10.0.2.2:8000
// Physical device on LAN: replace with your machine's LAN IP e.g. http://192.168.x.x:8000
// Production (Phase 3): https://api.your-domain.com

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000';

export default API_BASE_URL;