import type { D1Database } from '@cloudflare/workers-types';

export interface User {
  id: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  ip: string | null;
  user_agent: string | null;
}

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const PBKDF2_ITERATIONS = 210_000;

/**
 * Generate cryptographically secure random bytes as base64url string
 */
function randomBytes(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Hash password using PBKDF2-SHA256 with 210,000 iterations
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Hash session token using HMAC-SHA256
 */
async function hashToken(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(token)
  );
  
  const hashArray = Array.from(new Uint8Array(signature));
  return btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Verify password against stored hash - uses timing-safe comparison
 */
export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  
  // Timing-safe comparison
  if (computedHash.length !== storedHash.length) {
    return false;
  }
  
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  
  return diff === 0;
}

/**
 * Create new user with hashed password
 */
export async function createUser(
  db: D1Database,
  email: string,
  password: string
): Promise<User> {
  const userId = crypto.randomUUID();
  const salt = randomBytes(16);
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  
  await db
    .prepare(
      'INSERT INTO users (id, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(userId, email.toLowerCase(), salt, passwordHash, now)
    .run();
  
  return {
    id: userId,
    email: email.toLowerCase(),
    created_at: now,
    last_login_at: null
  };
}

/**
 * Find user by email
 */
export async function findUserByEmail(
  db: D1Database,
  email: string
): Promise<(User & { password_salt: string; password_hash: string }) | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .bind(email.toLowerCase())
    .first<User & { password_salt: string; password_hash: string }>();
  
  return result || null;
}

/**
 * Create session for user
 */
export async function createSession(
  db: D1Database,
  userId: string,
  sessionSecret: string,
  ip: string | null = null,
  userAgent: string | null = null
): Promise<{ session: Session; token: string }> {
  const sessionId = crypto.randomUUID();
  const token = randomBytes(32);
  const tokenHash = await hashToken(token, sessionSecret);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  
  await db
    .prepare(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      sessionId,
      userId,
      tokenHash,
      expiresAt.toISOString(),
      now.toISOString(),
      ip,
      userAgent
    )
    .run();
  
  const session: Session = {
    id: sessionId,
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
    ip,
    user_agent: userAgent
  };
  
  return { session, token };
}

/**
 * Verify session token and return user if valid
 */
export async function verifySession(
  db: D1Database,
  token: string,
  sessionSecret: string
): Promise<User | null> {
  const tokenHash = await hashToken(token, sessionSecret);
  const now = new Date().toISOString();
  
  const result = await db
    .prepare(
      `SELECT u.* FROM users u
       INNER JOIN sessions s ON s.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .bind(tokenHash, now)
    .first<User>();
  
  return result || null;
}

/**
 * Delete session
 */
export async function deleteSession(
  db: D1Database,
  token: string,
  sessionSecret: string
): Promise<void> {
  const tokenHash = await hashToken(token, sessionSecret);
  
  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .run();
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(
  db: D1Database,
  userId: string
): Promise<void> {
  const now = new Date().toISOString();
  
  await db
    .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
    .bind(now, userId)
    .run();
}

/**
 * Ensure bootstrap admin user exists
 */
export async function ensureBootstrapAdmin(
  db: D1Database,
  email: string,
  password: string
): Promise<void> {
  const existing = await findUserByEmail(db, email);
  
  if (!existing) {
    await createUser(db, email, password);
  }
}

/**
 * Generate session cookie string
 */
export function generateSessionCookie(
  token: string,
  appUrl: string,
  maxAge: number = SESSION_DURATION_MS / 1000
): string {
  const url = new URL(appUrl);
  const isSecure = url.protocol === 'https:';
  const hostname = url.hostname;
  
  let cookie = `ops_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  
  if (isSecure) {
    cookie += '; Secure';
  }
  
  if (hostname.endsWith('bigbeardapps.com')) {
    cookie += '; Domain=.bigbeardapps.com';
  }
  
  return cookie;
}

/**
 * Generate cookie clear string
 */
export function clearSessionCookie(appUrl: string): string {
  return generateSessionCookie('', appUrl, 0);
}
