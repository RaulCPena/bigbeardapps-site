/**
 * Big Beard Ops Authentication Service
 * Cloudflare Worker handling authentication for internal ops tools
 */

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  ADMIN_PASSWORD: string;
}

// Session duration: 30 days
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash password with SHA-256
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify session token
 */
async function verifySession(env: Env, sessionId: string): Promise<boolean> {
  const now = Date.now();
  const result = await env.DB.prepare(
    'SELECT id FROM sessions WHERE id = ? AND expires_at > ?'
  ).bind(sessionId, now).first();
  
  if (result) {
    // Update last activity
    await env.DB.prepare(
      'UPDATE sessions SET last_activity = ? WHERE id = ?'
    ).bind(now, sessionId).run();
    return true;
  }
  
  return false;
}

/**
 * Handle login request
 */
async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const { password } = await request.json() as { password: string };
    
    if (!password) {
      return new Response(JSON.stringify({ error: 'Password required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Verify password
    const hashedInput = await hashPassword(password);
    const hashedAdmin = await hashPassword(env.ADMIN_PASSWORD);
    
    if (hashedInput !== hashedAdmin) {
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create session
    const sessionId = generateSessionId();
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION;
    
    await env.DB.prepare(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)'
    ).bind(sessionId, 'admin', now, expiresAt, now).run();
    
    // Set cookie
    const cookie = `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DURATION / 1000}`;
    
    return new Response(JSON.stringify({ 
      success: true,
      sessionId,
      expiresAt 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle logout request
 */
async function handleLogout(request: Request, env: Env): Promise<Response> {
  const cookie = request.headers.get('Cookie');
  if (!cookie) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const sessionMatch = cookie.match(/session=([^;]+)/);
  if (sessionMatch) {
    const sessionId = sessionMatch[1];
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  
  // Clear cookie
  const clearCookie = 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie
    }
  });
}

/**
 * Handle session verification request
 */
async function handleVerify(request: Request, env: Env): Promise<Response> {
  const cookie = request.headers.get('Cookie');
  if (!cookie) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const sessionMatch = cookie.match(/session=([^;]+)/);
  if (!sessionMatch) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const sessionId = sessionMatch[1];
  const authenticated = await verifySession(env, sessionId);
  
  return new Response(JSON.stringify({ authenticated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Serve login page
 */
function serveLoginPage(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Big Beard Ops - Login</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 48px;
            max-width: 400px;
            width: 100%;
        }
        h1 {
            font-size: 32px;
            color: #1e293b;
            margin-bottom: 8px;
            text-align: center;
        }
        .subtitle {
            color: #64748b;
            text-align: center;
            margin-bottom: 32px;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 24px;
        }
        label {
            display: block;
            color: #475569;
            font-weight: 500;
            margin-bottom: 8px;
            font-size: 14px;
        }
        input[type="password"] {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 16px;
            transition: all 0.2s;
        }
        input[type="password"]:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        button {
            width: 100%;
            padding: 14px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        button:hover {
            background: #2563eb;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
        }
        button:active {
            transform: translateY(0);
        }
        button:disabled {
            background: #94a3b8;
            cursor: not-allowed;
            transform: none;
        }
        .error {
            background: #fee2e2;
            color: #991b1b;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
            display: none;
        }
        .error.show {
            display: block;
        }
        .beard {
            font-size: 48px;
            text-align: center;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="beard">🧔</div>
        <h1>Big Beard Ops</h1>
        <p class="subtitle">Internal operations authentication</p>
        
        <div class="error" id="error"></div>
        
        <form id="loginForm">
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required autofocus>
            </div>
            <button type="submit" id="submitBtn">Sign In</button>
        </form>
    </div>

    <script>
        const form = document.getElementById('loginForm');
        const errorDiv = document.getElementById('error');
        const submitBtn = document.getElementById('submitBtn');
        const passwordInput = document.getElementById('password');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorDiv.classList.remove('show');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in...';

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: passwordInput.value })
                });

                const data = await response.json();

                if (response.ok) {
                    window.location.href = '/dashboard';
                } else {
                    errorDiv.textContent = data.error || 'Login failed';
                    errorDiv.classList.add('show');
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            } catch (error) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.classList.add('show');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign In';
            }
        });
    </script>
</body>
</html>`;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}

/**
 * Serve dashboard page
 */
function serveDashboard(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Big Beard Ops - Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f1f5f9;
            min-height: 100vh;
        }
        .header {
            background: white;
            border-bottom: 1px solid #e2e8f0;
            padding: 20px 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo {
            font-size: 24px;
            font-weight: 700;
            color: #1e293b;
        }
        .beard { margin-right: 8px; }
        button {
            padding: 10px 20px;
            background: white;
            color: #475569;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        button:hover {
            background: #f8fafc;
            border-color: #94a3b8;
        }
        .content {
            max-width: 1200px;
            margin: 40px auto;
            padding: 0 40px;
        }
        .welcome {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        h1 {
            font-size: 32px;
            color: #1e293b;
            margin-bottom: 12px;
        }
        .subtitle {
            color: #64748b;
            font-size: 16px;
        }
        .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">
            <span class="beard">🧔</span>
            Big Beard Ops
        </div>
        <button onclick="logout()">Sign Out</button>
    </div>
    
    <div class="content">
        <div class="welcome">
            <div class="success-icon">✓</div>
            <h1>Welcome to Big Beard Ops</h1>
            <p class="subtitle">You are successfully authenticated</p>
        </div>
    </div>

    <script>
        async function logout() {
            try {
                await fetch('/api/logout', { method: 'POST' });
                window.location.href = '/';
            } catch (error) {
                console.error('Logout failed:', error);
            }
        }

        // Verify authentication on load
        async function checkAuth() {
            try {
                const response = await fetch('/api/verify');
                const data = await response.json();
                if (!data.authenticated) {
                    window.location.href = '/';
                }
            } catch (error) {
                console.error('Auth check failed:', error);
            }
        }

        checkAuth();
    </script>
</body>
</html>`;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}

/**
 * Main worker handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers for API endpoints
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // API endpoints
    if (url.pathname === '/api/login' && request.method === 'POST') {
      return handleLogin(request, env);
    }
    
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      return handleLogout(request, env);
    }
    
    if (url.pathname === '/api/verify' && request.method === 'GET') {
      return handleVerify(request, env);
    }
    
    // Dashboard (requires authentication)
    if (url.pathname === '/dashboard') {
      const cookie = request.headers.get('Cookie');
      if (cookie) {
        const sessionMatch = cookie.match(/session=([^;]+)/);
        if (sessionMatch) {
          const authenticated = await verifySession(env, sessionMatch[1]);
          if (authenticated) {
            return serveDashboard();
          }
        }
      }
      // Redirect to login if not authenticated
      return Response.redirect(url.origin + '/', 302);
    }
    
    // Login page (root)
    if (url.pathname === '/') {
      return serveLoginPage();
    }
    
    // 404 for everything else
    return new Response('Not Found', { status: 404 });
  },
};
