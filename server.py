#!/usr/bin/env python3
"""
DS Auto Cleaning – site server with admin login and availability API.

Uses only the Python standard library (3.9+). It serves the static site and
stores admin accounts, login sessions and busy days / times in SQLite.

Run the site:
    python3 server.py                     # http://localhost:8765
    PORT=8000 python3 server.py

Manage admin accounts:
    python3 server.py create-admin <username>      # asks for a password
    python3 server.py set-password <username>      # change a password
    python3 server.py list-admins

Behind HTTPS in production, set COOKIE_SECURE=1 so the session cookie is
only ever sent over HTTPS.
"""
import getpass
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'data')
DB_PATH = os.path.join(DATA_DIR, 'ds.db')

SESSION_COOKIE = 'ds_session'
SESSION_HOURS = 12
PBKDF2_ROUNDS = 260_000
MAX_FAILS, FAIL_WINDOW = 5, 15 * 60          # 5 wrong passwords per 15 min per IP
COOKIE_SECURE = os.environ.get('COOKIE_SECURE') == '1'

# Only these file types are ever served – keeps server.py, the database and notes private
PUBLIC_EXT = {'.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2'}
PRIVATE_FILES = {'/server.py'}

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')

_db_lock = threading.Lock()
_fails = {}  # ip -> [timestamps of failed logins]


# ---------------------------------------------------------------- database
def db():
    os.makedirs(DATA_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _db_lock, db() as con:
        con.executescript('''
            CREATE TABLE IF NOT EXISTS admins (
                username TEXT PRIMARY KEY,
                salt     BLOB NOT NULL,
                pw_hash  BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                username   TEXT NOT NULL,
                expires    INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS busy_days (
                day TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS busy_slots (
                day  TEXT NOT NULL,
                time TEXT NOT NULL,
                PRIMARY KEY (day, time)
            );
        ''')


def hash_pw(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt, PBKDF2_ROUNDS)


def set_admin_password(username, password):
    salt = secrets.token_bytes(16)
    with _db_lock, db() as con:
        con.execute('INSERT INTO admins(username, salt, pw_hash) VALUES (?,?,?) '
                    'ON CONFLICT(username) DO UPDATE SET salt=excluded.salt, pw_hash=excluded.pw_hash',
                    (username, salt, hash_pw(password, salt)))
        con.execute('DELETE FROM sessions WHERE username=?', (username,))  # log out everywhere


def check_login(username, password):
    with db() as con:
        row = con.execute('SELECT salt, pw_hash FROM admins WHERE username=?', (username,)).fetchone()
    if not row:
        hash_pw(password, b'0' * 16)  # same work as a real check, so timing doesn't reveal usernames
        return False
    return hmac.compare_digest(hash_pw(password, row['salt']), row['pw_hash'])


def new_session(username):
    token = secrets.token_urlsafe(32)
    with _db_lock, db() as con:
        con.execute('DELETE FROM sessions WHERE expires < ?', (int(time.time()),))
        con.execute('INSERT INTO sessions VALUES (?,?,?)',
                    (hashlib.sha256(token.encode()).hexdigest(), username, int(time.time()) + SESSION_HOURS * 3600))
    return token


def session_user(token):
    if not token:
        return None
    with db() as con:
        row = con.execute('SELECT username, expires FROM sessions WHERE token_hash=?',
                          (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    return row['username'] if row and row['expires'] > time.time() else None


def end_session(token):
    if token:
        with _db_lock, db() as con:
            con.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))


def availability():
    with db() as con:
        days = [r['day'] for r in con.execute('SELECT day FROM busy_days ORDER BY day')]
        slots = {}
        for r in con.execute('SELECT day, time FROM busy_slots ORDER BY day, time'):
            slots.setdefault(r['day'], []).append(r['time'])
    return {'zauzetiDani': days, 'zauzetiTermini': slots}


# ---------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    server_version = 'DS'
    sys_version = ''

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    # quieter log: one line per request
    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        if self.path.startswith('/api/') or self.path.startswith('/admin'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    # ---- helpers
    def client_ip(self):
        return self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()

    def token(self):
        c = SimpleCookie(self.headers.get('Cookie', ''))
        return c[SESSION_COOKIE].value if SESSION_COOKIE in c else None

    def user(self):
        return session_user(self.token())

    def send_json(self, status, payload, cookie=None):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        # Only JSON from our own pages: blocks cross-site form posts (CSRF)
        if 'application/json' not in self.headers.get('Content-Type', ''):
            return None
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc != self.headers.get('Host'):
            return None
        try:
            n = min(int(self.headers.get('Content-Length', 0)), 10_000)
            return json.loads(self.rfile.read(n) or b'{}')
        except (ValueError, json.JSONDecodeError):
            return None

    def cookie(self, value, max_age):
        parts = [f'{SESSION_COOKIE}={value}', 'Path=/', 'HttpOnly', 'SameSite=Strict', f'Max-Age={max_age}']
        if COOKIE_SECURE:
            parts.append('Secure')
        return '; '.join(parts)

    # ---- static files (allowlist)
    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path.startswith('/api/'):
            return self.api_get(path)
        if path == '/':
            path = '/index.html'
        ext = os.path.splitext(path)[1].lower()
        hidden = any(p.startswith('.') for p in path.split('/')) or path.startswith('/data/')
        if hidden or path in PRIVATE_FILES or ext not in PUBLIC_EXT:
            return self.send_error(HTTPStatus.NOT_FOUND)
        return super().do_GET()

    def do_HEAD(self):
        return self.do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == '/api/login':
            return self.login()
        if path == '/api/logout':
            end_session(self.token())
            return self.send_json(200, {'ok': True}, cookie=self.cookie('', 0))
        if path in ('/api/admin/day', '/api/admin/slot'):
            return self.admin_change(path)
        return self.send_json(404, {'error': 'Nepoznata adresa.'})

    # ---- API
    def api_get(self, path):
        if path == '/api/availability':
            return self.send_json(200, availability())
        if path == '/api/me':
            u = self.user()
            return self.send_json(200 if u else 401, {'username': u} if u else {'error': 'Niste prijavljeni.'})
        return self.send_json(404, {'error': 'Nepoznata adresa.'})

    def login(self):
        ip, now = self.client_ip(), time.time()
        recent = [t for t in _fails.get(ip, []) if now - t < FAIL_WINDOW]
        _fails[ip] = recent
        if len(recent) >= MAX_FAILS:
            wait = int((FAIL_WINDOW - (now - recent[0])) // 60) + 1
            return self.send_json(429, {'error': f'Previše pogrešnih pokušaja. Pokušajte ponovo za {wait} min.'})
        data = self.read_json()
        if data is None:
            return self.send_json(400, {'error': 'Neispravan zahtev.'})
        username, password = str(data.get('username', '')).strip(), str(data.get('password', ''))
        if not username or not password or not check_login(username, password):
            _fails[ip].append(now)
            return self.send_json(401, {'error': 'Pogrešno korisničko ime ili lozinka.'})
        _fails.pop(ip, None)
        token = new_session(username)
        return self.send_json(200, {'username': username}, cookie=self.cookie(token, SESSION_HOURS * 3600))

    def admin_change(self, path):
        if not self.user():
            return self.send_json(401, {'error': 'Sesija je istekla. Prijavite se ponovo.'})
        data = self.read_json()
        if data is None:
            return self.send_json(400, {'error': 'Neispravan zahtev.'})
        day, busy = str(data.get('date', '')), bool(data.get('busy'))
        if not DATE_RE.match(day):
            return self.send_json(400, {'error': 'Neispravan datum.'})
        with _db_lock, db() as con:
            if path == '/api/admin/day':
                if busy:
                    con.execute('INSERT OR IGNORE INTO busy_days VALUES (?)', (day,))
                else:
                    con.execute('DELETE FROM busy_days WHERE day=?', (day,))
            else:
                t = str(data.get('time', ''))
                if not TIME_RE.match(t):
                    return self.send_json(400, {'error': 'Neispravno vreme.'})
                if busy:
                    con.execute('INSERT OR IGNORE INTO busy_slots VALUES (?,?)', (day, t))
                else:
                    con.execute('DELETE FROM busy_slots WHERE day=? AND time=?', (day, t))
        return self.send_json(200, availability())


# ---------------------------------------------------------------- CLI
def ask_password():
    pw = getpass.getpass('Lozinka (najmanje 10 znakova): ')
    if len(pw) < 10:
        sys.exit('Lozinka mora imati najmanje 10 znakova.')
    if pw != getpass.getpass('Ponovite lozinku: '):
        sys.exit('Lozinke se ne poklapaju.')
    return pw


def main():
    init_db()
    args = sys.argv[1:]
    if args[:1] in (['create-admin'], ['set-password']) and len(args) == 2:
        pw = os.environ.get('ADMIN_PASSWORD') or ask_password()
        if len(pw) < 10:
            sys.exit('Lozinka mora imati najmanje 10 znakova.')
        set_admin_password(args[1], pw)
        print(f'Admin nalog "{args[1]}" je sačuvan.')
        return
    if args == ['list-admins']:
        with db() as con:
            for r in con.execute('SELECT username FROM admins ORDER BY username'):
                print(r['username'])
        return
    if args:
        sys.exit(__doc__)
    port = int(os.environ.get('PORT', 8765))
    with db() as con:
        if not con.execute('SELECT 1 FROM admins LIMIT 1').fetchone():
            print('Napomena: još nema admin naloga. Napravite ga: python3 server.py create-admin <ime>')
    print(f'DS Auto Cleaning radi na http://localhost:{port}  (Ctrl+C za izlaz)')
    ThreadingHTTPServer(('', port), Handler).serve_forever()


if __name__ == '__main__':
    main()
