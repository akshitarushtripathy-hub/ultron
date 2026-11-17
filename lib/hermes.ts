// Hermes Android bridge client.
//
// The phone runs the hermes-android accessibility bridge and connects OUT to a
// Hermes relay (aiohttp, port 8766). ULTRON connects to the same relay, pairs
// with a 6-character code, and calls android_* tools by name.
//
// Relay wire format used here (JSON messages over WebSocket):
//   -> { type: "auth", code: "ABC123" }
//   <- { type: "auth_ok", devices: [...] }
//   -> { type: "tool", id: "1", tool: "android_tap", args: { x: 500, y: 900 } }
//   <- { type: "tool_result", id: "1", ok: true, result: {...} }
//
// If your relay uses a slightly different envelope, adjust `send` / `onMessage`.

export type HermesToolResult = { ok: boolean; result?: any; error?: string };

export type HermesStatus = {
  connected: boolean;
  authenticated: boolean;
  devices: string[];
  lastError?: string;
};

type Pending = { resolve: (value: HermesToolResult) => void; timer: ReturnType<typeof setTimeout> };

export class HermesClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private url: string;
  private code: string;
  status: HermesStatus = { connected: false, authenticated: false, devices: [] };
  onStatus?: (status: HermesStatus) => void;

  constructor(url: string, code: string) {
    this.url = url;
    this.code = code;
  }

  private emit(patch: Partial<HermesStatus>) {
    this.status = { ...this.status, ...patch };
    this.onStatus?.(this.status);
  }

  connect(): Promise<HermesStatus> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(this.url);
        this.ws = ws;

        ws.onopen = () => {
          this.emit({ connected: true });
          ws.send(JSON.stringify({ type: 'auth', code: this.code }));
        };

        ws.onmessage = (event) => {
          let msg: any;
          try { msg = JSON.parse(String(event.data)); } catch { return; }

          if (msg.type === 'auth_ok') {
            this.emit({ authenticated: true, devices: msg.devices || [], lastError: undefined });
            resolve(this.status);
          } else if (msg.type === 'auth_failed') {
            const error = 'Pairing failed — check the code and that the phone is online.';
            this.emit({ authenticated: false, lastError: error });
            resolve(this.status);
          } else if (msg.type === 'tool_result' && this.pending.has(String(msg.id))) {
            const p = this.pending.get(String(msg.id))!;
            clearTimeout(p.timer);
            this.pending.delete(String(msg.id));
            p.resolve({ ok: msg.ok !== false, result: msg.result, error: msg.error });
          }
        };

        ws.onerror = () => {
          const error = 'Could not reach the Hermes relay. Check the URL and that the relay is running.';
          this.emit({ lastError: error });
          resolve(this.status);
        };

        ws.onclose = () => {
          this.emit({ connected: false, authenticated: false });
        };
      } catch (e: any) {
        this.emit({ lastError: e.message });
        resolve(this.status);
      }
    });
  }

  call(tool: string, args: Record<string, unknown> = {}, timeoutMs = 15000): Promise<HermesToolResult> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        resolve({ ok: false, error: 'Hermes relay is not connected.' });
        return;
      }
      const id = String(++this.seq);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'Device did not respond in time.' });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.ws.send(JSON.stringify({ type: 'tool', id, tool, args }));
    });
  }

  disconnect() {
    this.pending.forEach((p) => clearTimeout(p.timer));
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
    this.emit({ connected: false, authenticated: false, devices: [] });
  }
}

// The tool set exposed in the UI (a focused subset of hermes-android's 38 tools).
export const ANDROID_TOOLS = [
  { tool: 'android_ping', label: 'Ping device', args: '{}' },
  { tool: 'android_read_screen', label: 'Read screen', args: '{}' },
  { tool: 'android_screenshot', label: 'Screenshot', args: '{}' },
  { tool: 'android_get_apps', label: 'List apps', args: '{}' },
  { tool: 'android_current_app', label: 'Current app', args: '{}' },
  { tool: 'android_notifications', label: 'Notifications', args: '{}' },
  { tool: 'android_press_key', label: 'Press HOME', args: '{ "key": "home" }' },
  { tool: 'android_location', label: 'Location', args: '{}' },
  { tool: 'android_clipboard_read', label: 'Read clipboard', args: '{}' },
  { tool: 'android_speak', label: 'Speak on phone', args: '{ "text": "ULTRON online" }' },
] as const;
