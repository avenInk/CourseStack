#!/usr/bin/env python3
"""Seguimiento de Cursos Local - Servidor web con API JSON."""

import http.server
import socketserver
import os
import sys
import json
import urllib.parse
import mimetypes
import tempfile
import unicodedata

PORT = 9999
ROOT = os.path.dirname(os.path.abspath(__file__))
if os.name == 'nt' and not ROOT.startswith('\\\\?\\'):
    ROOT = '\\\\?\\' + ROOT
STATE_FILE = os.path.join(ROOT, 'coursetracker-progress.json')
STATE_DEFAULT = {
    'watched': {},
    'positions': {},
    'current': None,
    'theme': 'dark'
}

# Ensure proper MIME types
mimetypes.add_type('video/mp4', '.mp4')
mimetypes.add_type('video/mp4', '.m4v')
mimetypes.add_type('video/webm', '.webm')
mimetypes.add_type('video/x-matroska', '.mkv')
mimetypes.add_type('video/mp2t', '.ts')
mimetypes.add_type('audio/flac', '.flac')
mimetypes.add_type('audio/mp4', '.m4a')
mimetypes.add_type('audio/mpeg', '.mp3')
mimetypes.add_type('application/pdf', '.pdf')
mimetypes.add_type('text/plain', '.txt')
mimetypes.add_type('image/png', '.png')
mimetypes.add_type('image/jpeg', '.jpg')
mimetypes.add_type('image/jpeg', '.jpeg')
mimetypes.add_type('image/gif', '.gif')
mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')

def find_courses_root(root):
    """Return path to 'Cursos' subfolder if it exists (case-insensitive), else root."""
    try:
        for name in os.listdir(root):
            if name.lower() == 'cursos' and os.path.isdir(os.path.join(root, name)):
                return os.path.join(root, name)
    except OSError:
        pass
    return root


class CourseTrackerHandler(http.server.BaseHTTPRequestHandler):
    """Handler with JSON API and static file serving with range requests."""

    def log_message(self, format, *args):
        """Minimal logging."""
        pass

    def log_error(self, format, *args):
        """Silencia errores HTTP normales para no ensuciar la consola."""
        pass

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        url_path = urllib.parse.unquote(parsed.path)

        # API: list directory contents as JSON
        if 'api' in query and query['api'][0] == 'ls':
            self.handle_api_ls(url_path)
            return

        # API: full recursive tree (only folder structure + file names)
        if 'api' in query and query['api'][0] == 'tree':
            self.handle_api_tree()
            return

        # API: persistent local progress shared by devices on the LAN
        if 'api' in query and query['api'][0] == 'state':
            self.handle_api_get_state()
            return

        # API: serve a file by encoded path, safer for names with accents/symbols
        if 'api' in query and query['api'][0] == 'file':
            self.handle_api_file(query)
            return

        # Serve static files
        self.serve_file(url_path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if 'api' in query and query['api'][0] == 'state':
            self.handle_api_save_state()
            return

        self.send_json_error(404, 'API no encontrada')

    def handle_api_ls(self, url_path):
        """List a single directory level."""
        fs_path = self.url_to_fs(url_path)
        if not os.path.isdir(fs_path):
            self.send_json_error(404, 'Directorio no encontrado')
            return

        entries = []
        try:
            for name in sorted(os.listdir(fs_path), key=str.lower):
                full = os.path.join(fs_path, name)
                is_dir = os.path.isdir(full)
                size = 0
                if not is_dir:
                    try:
                        size = os.path.getsize(full)
                    except OSError:
                        pass
                entries.append({
                    'name': name,
                    'isDir': is_dir,
                    'size': size
                })
        except OSError as e:
            self.send_json_error(500, str(e))
            return

        self.send_json(entries)

    def handle_api_tree(self):
        """Return full recursive tree from the courses root."""
        courses_root = find_courses_root(ROOT)
        tree = self.build_tree(courses_root)
        self.send_json({'tree': tree, 'prefix': '' if courses_root == ROOT else 'Cursos'})

    def handle_api_get_state(self):
        """Return saved course progress from disk."""
        self.send_json(self.read_state())

    def handle_api_save_state(self):
        """Persist course progress to a local JSON file."""
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0

        if length <= 0 or length > 5 * 1024 * 1024:
            self.send_json_error(400, 'Contenido invalido')
            return

        try:
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json_error(400, 'JSON invalido')
            return

        state = self.normalize_state(payload)
        try:
            self.write_state(state)
        except OSError as e:
            self.send_json_error(500, str(e))
            return

        self.send_json({'ok': True, 'state': state})

    def handle_api_file(self, query):
        """Serve a static file from a path query parameter."""
        values = query.get('path')
        if not values:
            self.send_error(400, 'Ruta requerida')
            return
        self.serve_file(values[0])

    def build_tree(self, fs_path):
        """Build recursive tree structure."""
        result = []
        try:
            entries = sorted(os.listdir(fs_path), key=str.lower)
        except OSError:
            return result

        allowed_ext = {'.mp4', '.m4v', '.webm', '.mkv', '.ts', '.flac', '.m4a', '.mp3', '.ogg', '.wav', '.pdf', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}

        for name in entries:
            # Skip hidden/system files
            if name.startswith('.'):
                continue
            full = os.path.join(fs_path, name)
            is_dir = os.path.isdir(full)
            entry = {'name': name, 'isDir': is_dir}
            if not is_dir:
                ext = os.path.splitext(name)[1].lower()
                if ext not in allowed_ext:
                    continue
                try:
                    entry['size'] = os.path.getsize(full)
                except OSError:
                    entry['size'] = 0
            else:
                entry['children'] = self.build_tree(full)
                if not entry['children']:
                    continue
            result.append(entry)
        return result

    def read_state(self):
        """Read progress file and always return a complete state object."""
        if not os.path.isfile(STATE_FILE):
            return dict(STATE_DEFAULT)

        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            return dict(STATE_DEFAULT)

        return self.normalize_state(data)

    def write_state(self, state):
        """Write progress atomically to avoid corrupting it if the server stops."""
        directory = os.path.dirname(STATE_FILE)
        fd, tmp_name = tempfile.mkstemp(prefix='coursetracker-progress-', suffix='.tmp', dir=directory)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2, sort_keys=True)
                f.write('\n')
            os.replace(tmp_name, STATE_FILE)
        finally:
            if os.path.exists(tmp_name):
                try:
                    os.remove(tmp_name)
                except OSError:
                    pass

    def normalize_state(self, data):
        """Keep only the fields used by the app."""
        if not isinstance(data, dict):
            data = {}

        watched = data.get('watched') if isinstance(data.get('watched'), dict) else {}
        positions = data.get('positions') if isinstance(data.get('positions'), dict) else {}
        current = data.get('current') if isinstance(data.get('current'), dict) else None
        theme = data.get('theme') if data.get('theme') in ('dark', 'light') else 'dark'

        return {
            'watched': watched,
            'positions': positions,
            'current': current,
            'theme': theme
        }

    def serve_file(self, url_path):
        """Serve a static file with support for Range requests (video streaming)."""
        if url_path == '/':
            url_path = '/index.html'

        fs_path = self.url_to_fs(url_path)

        if not os.path.isfile(fs_path):
            self.send_error(404, 'Archivo no encontrado')
            return

        content_type, _ = mimetypes.guess_type(fs_path)
        if not content_type:
            content_type = 'application/octet-stream'

        file_size = os.path.getsize(fs_path)

        # Handle Range requests for video/audio streaming
        range_header = self.headers.get('Range')
        if range_header:
            self.serve_range(fs_path, file_size, content_type, range_header)
        else:
            self.serve_full(fs_path, file_size, content_type)

    def serve_full(self, fs_path, file_size, content_type):
        """Serve the entire file."""
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(file_size))
        self.send_header('Accept-Ranges', 'bytes')
        if fs_path.endswith('.html') or fs_path.endswith('.css') or fs_path.endswith('.js'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        else:
            self.send_header('Cache-Control', 'public, max-age=3600')
        self.end_headers()

        with open(fs_path, 'rb') as f:
            buf_size = 1024 * 64  # 64KB chunks
            while True:
                chunk = f.read(buf_size)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    break

    def serve_range(self, fs_path, file_size, content_type, range_header):
        """Serve a byte range of the file (for video seeking)."""
        try:
            range_spec = range_header.replace('bytes=', '')
            parts = range_spec.split('-')
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
        except (ValueError, IndexError):
            self.send_error(416, 'Range Not Satisfiable')
            return

        if start >= file_size or end >= file_size:
            end = file_size - 1

        length = end - start + 1

        self.send_response(206)
        self.send_cors_headers()
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(length))
        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'public, max-age=3600')
        self.end_headers()

        with open(fs_path, 'rb') as f:
            f.seek(start)
            remaining = length
            buf_size = 1024 * 64
            while remaining > 0:
                chunk_size = min(buf_size, remaining)
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    break
                remaining -= len(chunk)

    def url_to_fs(self, url_path):
        """Convert URL path to filesystem path (secure)."""
        path = urllib.parse.unquote(url_path).replace('\\', '/').lstrip('/')
        parts = [p for p in path.split('/') if p and p != '.']
        if any(p == '..' for p in parts):
            return os.path.join(ROOT, 'index.html')

        current = ROOT
        for part in parts:
            candidate = os.path.join(current, part)
            if os.path.exists(candidate):
                current = candidate
                continue

            resolved = None
            wanted = unicodedata.normalize('NFC', part).casefold()
            if os.path.isdir(current):
                try:
                    for name in os.listdir(current):
                        if unicodedata.normalize('NFC', name).casefold() == wanted:
                            resolved = os.path.join(current, name)
                            break
                except OSError:
                    pass
            current = resolved if resolved else candidate

        return current

    def send_json(self, data):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(content)

    def send_json_error(self, code, message):
        content = json.dumps({'error': message}, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)


class ThreadedServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        """Silencia errores de desconexión del cliente (comunes al cerrar o saltar video)."""
        import sys
        exctype, value = sys.exc_info()[:2]
        if issubclass(exctype, OSError):
            return
        super().handle_error(request, client_address)


def find_free_port(start, max_tries=20):
    import socket
    for port in range(start, start + max_tries):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('', port))
                return port
        except OSError:
            continue
    return start

def get_local_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP


def main():
    os.chdir(ROOT)
    port = find_free_port(PORT)
    local_ip = get_local_ip()

    print('==================================================')
    print(' 📱 Seguimiento de Cursos (Local)')
    print('==================================================')
    if port != PORT:
        print(f' ⚠️ El puerto {PORT} estaba ocupado. Se usara el {port}.')
        print('--------------------------------------------------')

    print(f' 💻 En tu PC:     http://localhost:{port}')
    if local_ip != '127.0.0.1':
        print(f' 📱 En tu Móvil:  http://{local_ip}:{port}')
        print('    (Debes estar conectado al mismo WiFi)')
    print('--------------------------------------------------')
    print(' 🛑 Cierra esta ventana negra para detener la app.')
    print('==================================================')
    print()

    try:
        import webbrowser, threading
        threading.Timer(0.8, lambda: webbrowser.open(f'http://localhost:{port}')).start()
        with ThreadedServer(('', port), CourseTrackerHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor detenido.')


if __name__ == '__main__':
    main()
