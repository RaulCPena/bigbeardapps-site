import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import {
  ensureBootstrapAdmin,
  findUserByEmail,
  verifyPassword,
  createSession,
  verifySession,
  deleteSession,
  updateLastLogin,
  generateSessionCookie,
  clearSessionCookie,
  type User
} from './auth';

type Bindings = {
  DB: D1Database;
  SESSION_SECRET: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  APP_NAME: string;
  APP_URL: string;
};

type Variables = {
  user: User | null;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Rate limiting store (in-memory, resets on worker restart)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false;
  }
  
  record.count++;
  return true;
}

function resetRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

// Middleware: Check SESSION_SECRET and bootstrap admin
app.use('*', async (c, next) => {
  if (!c.env.SESSION_SECRET) {
    return c.json({ error: 'Server configuration error: SESSION_SECRET not set' }, 500);
  }
  
  // Bootstrap admin if configured
  if (c.env.BOOTSTRAP_ADMIN_EMAIL && c.env.BOOTSTRAP_ADMIN_PASSWORD) {
    try {
      await ensureBootstrapAdmin(
        c.env.DB,
        c.env.BOOTSTRAP_ADMIN_EMAIL,
        c.env.BOOTSTRAP_ADMIN_PASSWORD
      );
    } catch (err) {
      console.error('Bootstrap admin error:', err);
    }
  }
  
  await next();
});

// Middleware: Session authentication
app.use('*', async (c, next) => {
  const cookie = c.req.header('Cookie');
  let user: User | null = null;
  
  if (cookie) {
    const match = cookie.match(/ops_session=([^;]+)/);
    if (match) {
      const token = match[1];
      try {
        user = await verifySession(c.env.DB, token, c.env.SESSION_SECRET);
      } catch (err) {
        console.error('Session verification error:', err);
      }
    }
  }
  
  c.set('user', user);
  await next();
});

// Middleware: Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// Health check
app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    app: c.env.APP_NAME
  });
});

// Get current user
app.get('/api/me', (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ authenticated: false }, 401);
  }
  
  return c.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email
    }
  });
});

// Login
app.post('/api/login', async (c) => {
  const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  
  // Rate limiting
  if (!checkRateLimit(clientIp)) {
    return c.json({
      error: 'Too many login attempts. Please try again in 15 minutes.'
    }, 429);
  }
  
  let body: any;
  try {
    body = await c.req.json();
  } catch (err) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  
  const { email, password } = body;
  
  // Validation
  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }
  
  const emailTrimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(emailTrimmed)) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  
  if (password.length < 8) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  
  // Find user
  const user = await findUserByEmail(c.env.DB, emailTrimmed);
  
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  
  // Verify password
  const isValid = await verifyPassword(password, user.password_salt, user.password_hash);
  
  if (!isValid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  
  // Create session
  const userAgent = c.req.header('User-Agent') || null;
  const { token } = await createSession(
    c.env.DB,
    user.id,
    c.env.SESSION_SECRET,
    clientIp,
    userAgent
  );
  
  // Update last login
  await updateLastLogin(c.env.DB, user.id);
  
  // Reset rate limit on successful login
  resetRateLimit(clientIp);
  
  // Set cookie
  const cookie = generateSessionCookie(token, c.env.APP_URL);
  c.header('Set-Cookie', cookie);
  
  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email
    }
  });
});

// Logout
app.post('/api/logout', async (c) => {
  const cookie = c.req.header('Cookie');
  
  if (cookie) {
    const match = cookie.match(/ops_session=([^;]+)/);
    if (match) {
      const token = match[1];
      try {
        await deleteSession(c.env.DB, token, c.env.SESSION_SECRET);
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
  }
  
  const clearCookie = clearSessionCookie(c.env.APP_URL);
  c.header('Set-Cookie', clearCookie);
  
  return c.json({ ok: true });
});

// Registration (disabled)
app.post('/api/register', (c) => {
  return c.json({
    error: 'Registration is disabled. Please contact support@bigbeardapps.com for access.'
  }, 403);
});

// Root - Login UI
app.get('/', (c) => {
  const user = c.get('user');
  const appName = c.env.APP_NAME;
  
  if (user) {
    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-size: 28px;
      margin-bottom: 8px;
      color: #fff;
      text-align: center;
    }
    .subtitle {
      text-align: center;
      color: #9ca3af;
      margin-bottom: 32px;
      font-size: 14px;
    }
    .user-info {
      background: rgba(255, 255, 255, 0.08);
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .user-info p {
      margin-bottom: 8px;
      color: #d1d5db;
    }
    .user-info strong {
      color: #fff;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: #dc2626;
    }
    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${appName}</h1>
    <p class="subtitle">Multi-site Cloudflare Analytics</p>
    
    <div class="user-info">
      <p><strong>Signed in as:</strong></p>
      <p>${user.email}</p>
    </div>
    
    <button onclick="logout()">Sign Out</button>
    
    <div class="footer">
      <p>Coming soon: Portfolio dashboard</p>
    </div>
  </div>
  
  <script>
    async function logout() {
      try {
        const res = await fetch('/api/logout', { method: 'POST' });
        if (res.ok) {
          window.location.reload();
        }
      } catch (err) {
        alert('Logout failed');
      }
    }
  </script>
</body>
</html>
    `);
  }
  
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName} - Sign In</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 40px;
      max-width: 420px;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-size: 28px;
      margin-bottom: 8px;
      color: #fff;
      text-align: center;
    }
    .subtitle {
      text-align: center;
      color: #9ca3af;
      margin-bottom: 32px;
      font-size: 14px;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 14px;
      color: #d1d5db;
    }
    input {
      padding: 12px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: #fff;
      font-size: 15px;
      transition: border-color 0.2s, background 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #3b82f6;
      background: rgba(255, 255, 255, 0.1);
    }
    button {
      padding: 12px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 8px;
    }
    button:hover {
      background: #2563eb;
    }
    button:disabled {
      background: #4b5563;
      cursor: not-allowed;
    }
    .error {
      padding: 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #fca5a5;
      font-size: 14px;
      display: none;
    }
    .error.show {
      display: block;
    }
    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${appName}</h1>
    <p class="subtitle">Multi-site Cloudflare Analytics</p>
    
    <div id="error" class="error"></div>
    
    <form id="loginForm">
      <label>
        Email
        <input type="email" id="email" name="email" required autocomplete="email">
      </label>
      
      <label>
        Password
        <input type="password" id="password" name="password" required autocomplete="current-password">
      </label>
      
      <button type="submit">Sign In</button>
    </form>
    
    <div class="footer">
      <p>Big Beard Apps</p>
    </div>
  </div>
  
  <script>
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('error');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const submitBtn = form.querySelector('button[type="submit"]');
      
      errorDiv.classList.remove('show');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
      
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        
        if (res.ok) {
          window.location.reload();
        } else {
          errorDiv.textContent = data.error || 'Login failed';
          errorDiv.classList.add('show');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
      } catch (err) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.classList.add('show');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });
  </script>
</body>
</html>
  `);
});

export default app;
