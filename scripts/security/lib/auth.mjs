import { randomBytes } from 'node:crypto';
import { responseError } from './http.mjs';

function randomPassword() {
  return `T61-${randomBytes(18).toString('base64url')}`;
}

export async function createHost(http, label, runId) {
  const email = `security-t61-${label}-${runId}@example.test`;
  const password = randomPassword();
  const created = await http.admin('/users', {
    method: 'POST',
    body: { email, password, email_confirm: true },
  });
  if (!created.ok || !created.data?.id) {
    throw new Error(`gagal membuat Host ${label}: ${responseError(created)}`);
  }

  const session = await http.auth('/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  if (!session.ok || !session.data?.access_token) {
    throw new Error(`gagal login Host ${label}: ${responseError(session)}`);
  }

  return {
    id: created.data.id,
    email,
    password,
    token: session.data.access_token,
    refreshToken: session.data.refresh_token,
  };
}

export async function createGuest(http) {
  const signup = await http.auth('/signup', {
    method: 'POST',
    body: { data: {} },
  });
  if (!signup.ok || !signup.data?.user?.id || !signup.data?.access_token) {
    throw new Error(`gagal membuat Guest anonim: ${responseError(signup)}`);
  }
  return {
    id: signup.data.user.id,
    token: signup.data.access_token,
    refreshToken: signup.data.refresh_token,
  };
}

export async function deleteUser(http, userId) {
  if (!userId) return true;
  const result = await http.admin(`/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
  return result.ok || result.status === 404;
}
