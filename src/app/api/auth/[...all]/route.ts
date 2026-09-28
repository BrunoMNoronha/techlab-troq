import { getAuth } from '@/modules/identity/auth';

export async function GET(request: Request) {
  const auth = getAuth();
  return auth.handler(request);
}

export async function POST(request: Request) {
  const auth = getAuth();
  return auth.handler(request);
}
