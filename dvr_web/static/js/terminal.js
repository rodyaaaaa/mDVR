// Terminal client for '/term' namespace using xterm.js
// Provides: connectTerminal(), disconnectTerminal(), clearTerminal(), focusTerminal()

(function () {
  let termSocket = null;
  let connected = false;
  let term = null;
  let fitAddon = null;

  const els = {
    status: () => document.getElementById('terminal-status'),
    username: () => document.getElementById('term-username'),
    password: () => document.getElementById('term-password'),
    btnConnect: () => document.getElementById('term-connect-btn'),
    btnDisconnect: () => document.getElementById('term-disconnect-btn'),
    container: () => document.getElementById('terminal-container'),
    xtermHost: () => document.getElementById('xterm'),
  };

  function ensureTerminal() {
    if (term) return;
    if (!window.Terminal) return;
    term = new Terminal({
      cursorBlink: true,
      fontFamily: 'monospace',
      theme: {
        background: '#0b1320',
      },
    });
    fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    const host = els.xtermHost();
    term.open(host);
    safeFit();
    window.addEventListener('resize', safeFit);

    // Send input to backend
    term.onData((data) => {
      if (!connected || !termSocket) return;
      termSocket.emit('term_input', { data });
    });
  }

  function safeFit() {
    try { if (fitAddon) fitAddon.fit(); } catch (e) { /* ignore */ }
  }

  function setStatus(text) {
    const s = els.status();
    if (s) s.textContent = text;
  }

  function bindSocketEvents() {
    if (!termSocket) return;
    termSocket.on('connect', () => setStatus('Connected'));
    termSocket.on('disconnect', () => {
      setStatus('Disconnected');
      connected = false;
      updateButtons();
    });
    termSocket.on('term_status', (msg) => {
      if (msg && msg.status === 'started') {
        connected = true;
        setStatus('Terminal started');
        updateButtons();
        focusTerminal();
      } else if (msg && msg.status) {
        setStatus(String(msg.status));
      }
    });
    termSocket.on('term_output', (msg) => {
      if (!term) return;
      term.write(msg && msg.data ? msg.data : '');
    });
    termSocket.on('term_error', (msg) => {
      if (term) term.write(`\r\n[error] ${msg && msg.error ? msg.error : 'error'}\r\n`);
    });
    termSocket.on('term_closed', () => {
      if (term) term.write(`\r\n[session closed]\r\n`);
      connected = false;
      updateButtons();
      setStatus('Closed');
    });
  }

  function updateButtons() {
    const bc = els.btnConnect();
    const bd = els.btnDisconnect();
    if (bc) bc.disabled = connected;
    if (bd) bd.disabled = !connected;
  }

  async function connectTerminal() {
    const username = (els.username().value || '').trim();
    const password = els.password().value || '';
    if (!username || !password) {
      setStatus('Enter username and password');
      return;
    }
    ensureTerminal();
    if (term) {
      term.clear();
    }
    try {
      if (!termSocket) {
        termSocket = io('/term', { transports: ['websocket'] });
        bindSocketEvents();
      } else if (termSocket.disconnected) {
        termSocket.connect();
      }
      setStatus('Starting...');
      termSocket.emit('term_open', { username, password });
      updateButtons();
      setTimeout(safeFit, 50);
    } catch (e) {
      setStatus('Failed to connect');
    }
  }

  function disconnectTerminal() {
    if (!termSocket) return;
    try { termSocket.disconnect(); } catch (e) {}
  }

  function clearTerminal() {
    ensureTerminal();
    if (term) term.clear();
  }

  function focusTerminal() {
    ensureTerminal();
    if (term) term.focus();
  }

  // Click-to-focus inside terminal area
  (function bindContainerClick(){
    const c = els.container();
    if (!c) return;
    c.addEventListener('click', () => focusTerminal());
  })();

  // Expose
  window.connectTerminal = connectTerminal;
  window.disconnectTerminal = disconnectTerminal;
  window.clearTerminal = clearTerminal;
  window.focusTerminal = focusTerminal;
})();
