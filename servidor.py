#!/usr/bin/env python3
"""
FotoShare - Servidor PC com interface web
"""

import http.server
import socketserver
import os
import json
import re
import threading
import webbrowser
from datetime import datetime

# =============================================
PORTA = 8765
PORTA_WEB = 8766
PASTA_DESTINO = os.path.join(os.path.expanduser("~"), "FotoShare")
# =============================================

fotos = []  # lista em memória das fotos recebidas
clientes_sse = []  # clientes conectados ao painel

def get_ip_local():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except:
        return "127.0.0.1"
    finally:
        s.close()

def notificar_clientes(evento):
    mortos = []
    for c in clientes_sse:
        try:
            c.wfile.write(f"data: {json.dumps(evento)}\n\n".encode())
            c.wfile.flush()
        except:
            mortos.append(c)
    for m in mortos:
        clientes_sse.remove(m)

def parse_multipart(data, boundary):
    if isinstance(boundary, str):
        boundary = boundary.encode()

    delim = b"--" + boundary
    partes = data.split(delim)

    for parte in partes:
        if b"content-disposition" not in parte.lower():
            continue
        if b"\r\n\r\n" in parte:
            _, corpo = parte.split(b"\r\n\r\n", 1)
            corpo = corpo.rstrip(b"\r\n")
            if corpo.endswith(b"--"):
                corpo = corpo[:-2]
            corpo = corpo.rstrip(b"\r\n")
            if corpo:
                return corpo
    return None

HTML = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FotoShare</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0a;
    --surface: #111;
    --surface2: #1a1a1a;
    --border: #222;
    --text: #e5e5e5;
    --muted: #555;
    --green: #30d158;
    --red: #ff453a;
    --white: #fff;
  }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif; min-height: 100vh; }

  header { border-bottom: 0.5px solid var(--border); padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
  .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
  .header-right { display: flex; align-items: center; gap: 20px; }
  .status-badge { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .stats { display: flex; gap: 1px; background: var(--border); border-bottom: 0.5px solid var(--border); }
  .stat { flex: 1; background: var(--bg); padding: 20px 32px; }
  .stat-val { font-size: 28px; font-weight: 700; letter-spacing: -1px; color: var(--white); }
  .stat-label { font-size: 11px; color: var(--muted); margin-top: 2px; letter-spacing: 0.3px; }

  .main { padding: 32px; }
  .section-title { font-size: 12px; color: var(--muted); letter-spacing: 0.8px; margin-bottom: 16px; }

  /* Última foto em destaque */
  .latest { background: var(--surface); border-radius: 16px; overflow: hidden; margin-bottom: 32px; display: none; }
  .latest.visible { display: flex; }
  .latest-img { width: 280px; height: 200px; object-fit: cover; flex-shrink: 0; }
  .latest-info { padding: 24px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
  .latest-badge { font-size: 10px; background: var(--green); color: #000; font-weight: 700; padding: 3px 8px; border-radius: 6px; width: fit-content; letter-spacing: 0.5px; }
  .latest-name { font-size: 18px; font-weight: 600; color: var(--white); }
  .latest-time { font-size: 13px; color: var(--muted); }

  /* Grid */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .card { background: var(--surface); border-radius: 12px; overflow: hidden; cursor: pointer; transition: opacity 0.15s; }
  .card:hover { opacity: 0.8; }
  .card img { width: 100%; height: 130px; object-fit: cover; display: block; background: var(--surface2); }
  .card-info { padding: 10px 12px; }
  .card-time { font-size: 11px; color: var(--muted); }

  /* Toast */
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 0.5px solid var(--border); border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; gap: 10px; font-size: 14px; transform: translateY(80px); opacity: 0; transition: all 0.3s; pointer-events: none; }
  .toast.show { transform: translateY(0); opacity: 1; }
  .toast-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex-shrink: 0; }

  /* Modal */
  .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.88); display: flex; align-items: center; justify-content: center; z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  .modal.open { opacity: 1; pointer-events: all; }
  .modal img { max-width: 90vw; max-height: 88vh; border-radius: 12px; object-fit: contain; }
  .modal-close { position: absolute; top: 20px; right: 24px; color: #fff; font-size: 28px; cursor: pointer; line-height: 1; opacity: 0.7; }
  .modal-close:hover { opacity: 1; }

  .empty { text-align: center; padding: 60px 0; color: var(--muted); font-size: 15px; }

  @media (max-width: 600px) {
    header { padding: 16px 20px; }
    .stats { flex-wrap: wrap; }
    .stat { padding: 16px 20px; }
    .main { padding: 20px; }
    .latest { flex-direction: column; }
    .latest-img { width: 100%; height: 200px; }
  }
</style>
</head>
<body>

<header>
  <div class="logo">📸 FotoShare</div>
  <div class="header-right">
    <div class="status-badge">
      <div class="status-dot"></div>
      <span id="server-ip">Carregando...</span>
    </div>
  </div>
</header>

<div class="stats">
  <div class="stat">
    <div class="stat-val" id="total">0</div>
    <div class="stat-label">Fotos recebidas</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="hoje">0</div>
    <div class="stat-label">Hoje</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="ultima">—</div>
    <div class="stat-label">Última foto</div>
  </div>
</div>

<div class="main">
  <div class="latest" id="latest">
    <img id="latest-img" src="" alt="última foto">
    <div class="latest-info">
      <div class="latest-badge">RECEBIDA AGORA</div>
      <div class="latest-name" id="latest-name"></div>
      <div class="latest-time" id="latest-time"></div>
    </div>
  </div>

  <div class="section-title">TODAS AS FOTOS</div>
  <div class="grid" id="grid">
    <div class="empty" id="empty">Nenhuma foto recebida ainda.<br>Abra o app e tire uma foto.</div>
  </div>
</div>

<div class="toast" id="toast">
  <div class="toast-dot"></div>
  <span id="toast-msg"></span>
</div>

<div class="modal" id="modal" onclick="fecharModal()">
  <span class="modal-close">✕</span>
  <img id="modal-img" src="" alt="">
</div>

<script>
let total = 0, hoje = 0;
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');

function fmt(iso) {
  const d = new Date(iso);
  const agora = new Date();
  const isHoje = d.toDateString() === agora.toDateString();
  const h = d.getHours().toString().padStart(2,'0');
  const m = d.getMinutes().toString().padStart(2,'0');
  return isHoje ? `Hoje · ${h}:${m}` : `${d.getDate()}/${d.getMonth()+1} · ${h}:${m}`;
}

function mostrarToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function abrirModal(src) {
  document.getElementById('modal-img').src = src;
  document.getElementById('modal').classList.add('open');
}
function fecharModal() {
  document.getElementById('modal').classList.remove('open');
}

function adicionarFoto(foto) {
  empty.style.display = 'none';
  total++;
  hoje++;
  document.getElementById('total').textContent = total;
  document.getElementById('hoje').textContent = hoje;
  document.getElementById('ultima').textContent = fmt(foto.time).split(' · ')[1];

  // Destaque
  const latest = document.getElementById('latest');
  latest.classList.add('visible');
  document.getElementById('latest-img').src = foto.url;
  document.getElementById('latest-name').textContent = foto.name;
  document.getElementById('latest-time').textContent = fmt(foto.time);

  // Card no grid
  const card = document.createElement('div');
  card.className = 'card';
  card.onclick = () => abrirModal(foto.url);
  card.innerHTML = `<img src="${foto.url}" loading="lazy"><div class="card-info"><div class="card-time">${fmt(foto.time)}</div></div>`;
  grid.insertBefore(card, grid.firstChild);

  mostrarToast(`Nova foto: ${foto.name}`);
}

// Carrega histórico inicial
fetch('/api/fotos').then(r => r.json()).then(lista => {
  lista.forEach(f => {
    total++;
    const d = new Date(f.time);
    const agora = new Date();
    if (d.toDateString() === agora.toDateString()) hoje++;
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => abrirModal(f.url);
    card.innerHTML = `<img src="${f.url}" loading="lazy"><div class="card-info"><div class="card-time">${fmt(f.time)}</div></div>`;
    grid.appendChild(card);
  });
  if (lista.length > 0) {
    empty.style.display = 'none';
    document.getElementById('total').textContent = total;
    document.getElementById('hoje').textContent = hoje;
    const ult = lista[lista.length-1];
    document.getElementById('ultima').textContent = fmt(ult.time).split(' · ')[1];
  }
});

// IP do servidor
fetch('/api/info').then(r => r.json()).then(d => {
  document.getElementById('server-ip').textContent = d.ip + ':8765';
});

// Eventos em tempo real (SSE)
const es = new EventSource('/eventos');
es.onmessage = e => {
  const foto = JSON.parse(e.data);
  adicionarFoto(foto);
};
</script>
</body>
</html>"""


class WebHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == '/':
            self.reply(200, HTML.encode(), 'text/html; charset=utf-8')

        elif self.path == '/api/fotos':
            body = json.dumps(fotos).encode()
            self.reply(200, body, 'application/json')

        elif self.path == '/api/info':
            body = json.dumps({'ip': get_ip_local(), 'total': len(fotos)}).encode()
            self.reply(200, body, 'application/json')

        elif self.path.startswith('/fotos/'):
            nome = self.path[7:]
            caminho = os.path.join(PASTA_DESTINO, nome)
            if os.path.exists(caminho):
                with open(caminho, 'rb') as f:
                    dados = f.read()
                self.reply(200, dados, 'image/jpeg')
            else:
                self.reply(404, b'', 'text/plain')

        elif self.path == '/eventos':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            clientes_sse.append(self)
            try:
                while True:
                    import time
                    time.sleep(30)
                    self.wfile.write(b': ping\n\n')
                    self.wfile.flush()
            except:
                if self in clientes_sse:
                    clientes_sse.remove(self)
        else:
            self.reply(404, b'Not found', 'text/plain')

    def reply(self, code, body, ct):
        self.send_response(code)
        self.send_header('Content-Type', ct)
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)


class FotoHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == '/ping':
            self.responder(200, {'status': 'ok'})
        else:
            self.responder(404, {'erro': 'not found'})

    def do_POST(self):
        if self.path != '/foto':
            self.responder(404, {'erro': 'not found'})
            return
        try:
            ct = self.headers.get('Content-Type', '')
            tamanho = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(tamanho)

            print(f"  Content-Type: {ct}")
            print(f"  Tamanho: {tamanho} bytes")
            print(f"  Primeiros bytes: {raw[:100]}")

            if 'multipart/form-data' in ct:
                match = re.search(r'boundary=([^\s;]+)', ct)
                if not match:
                    print("  ERRO: boundary não encontrado")
                    self.responder(400, {'erro': 'boundary não encontrado'})
                    return
                boundary = match.group(1)
                print(f"  Boundary: {boundary}")
                dados = parse_multipart(raw, boundary)
                print(f"  Dados extraídos: {len(dados) if dados else 'None'} bytes")
            else:
                dados = raw

            if not dados:
                self.responder(400, {'erro': 'sem dados'})
                return

            agora = datetime.now()
            nome = f"foto_{agora.strftime('%Y-%m-%d_%H-%M-%S')}.jpg"
            caminho = os.path.join(PASTA_DESTINO, nome)

            with open(caminho, 'wb') as f:
                f.write(dados)

            kb = len(dados) / 1024
            print(f"  ✅ {nome} ({kb:.1f} KB)")

            entrada = {
                'name': nome,
                'url': f'/fotos/{nome}',
                'time': agora.isoformat(),
                'size_kb': round(kb, 1)
            }
            fotos.append(entrada)
            threading.Thread(target=notificar_clientes, args=(entrada,), daemon=True).start()

            self.responder(200, {'mensagem': f'Salvo como {nome}'})
        except Exception as e:
            print(f"  ❌ Erro: {e}")
            import traceback
            traceback.print_exc()
            self.responder(500, {'erro': str(e)})

    def responder(self, codigo, dados):
        body = json.dumps(dados).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)


def main():
    os.makedirs(PASTA_DESTINO, exist_ok=True)
    ip = get_ip_local()

    print("=" * 52)
    print("   📸 FotoShare — Servidor")
    print("=" * 52)
    print(f"   IP do PC:      {ip}")
    print(f"   App → PC:      {ip}:8765")
    print(f"   Painel web:    http://localhost:{PORTA_WEB}")
    print(f"   Pasta:         {PASTA_DESTINO}")
    print("=" * 52)
    print("\n   Aguardando fotos... (Ctrl+C para parar)\n")

    socketserver.TCPServer.allow_reuse_address = True

    web = socketserver.ThreadingTCPServer(('0.0.0.0', PORTA_WEB), WebHandler)
    t = threading.Thread(target=web.serve_forever, daemon=True)
    t.start()

    threading.Timer(1.5, lambda: webbrowser.open(f'http://localhost:{PORTA_WEB}')).start()

    with socketserver.TCPServer(('0.0.0.0', PORTA), FotoHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n   Servidor encerrado. Até logo!")
            web.shutdown()

if __name__ == '__main__':
    main()