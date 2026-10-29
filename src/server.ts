import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { MeshNode, type CRDTDelta } from './mesh-node.ts';

export class CRDTServer {
  private node: MeshNode;
  private server: http.Server | null = null;
  private startTime: number = Date.now();

  constructor(node?: MeshNode) {
    this.node = node || new MeshNode(`node-${Math.random().toString(36).slice(2, 6)}`);
  }

  getNode(): MeshNode {
    return this.node;
  }

  listen(port: number = 9092, host: string = '127.0.0.1'): Promise<{ port: number; host: string }> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        const addr = this.server!.address();
        if (typeof addr === 'object' && addr !== null) {
          resolve({ port: addr.port, host });
        } else {
          resolve({ port, host });
        }
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
      this.server = null;
    });
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  }

  private sendJson(res: ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    try {
      if (method === 'GET' && pathname === '/health') {
        const s = this.node.getState();
        return this.sendJson(res, 200, {
          status: 'healthy',
          uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
          nodeId: s.nodeId,
          counter: s.counter,
          setElements: s.set.length,
          textLength: s.text.length,
          peersConnected: s.peers.length
        });
      }

      if (method === 'GET' && pathname === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        return res.end(this.node.exportPrometheus());
      }

      if (method === 'GET' && pathname === '/state') {
        return this.sendJson(res, 200, this.node.getState());
      }

      if (method === 'GET' && pathname === '/peers') {
        return this.sendJson(res, 200, { peers: this.node.getPeers() });
      }

      if (method === 'GET' && pathname === '/snapshot') {
        return this.sendJson(res, 200, this.node.getFullSnapshot());
      }

      if (method === 'POST' && pathname === '/mutate/counter') {
        const payload = await this.parseBody(req);
        const amount = Number(payload.amount ?? 1);
        const delta = this.node.mutateCounter(amount);
        return this.sendJson(res, 200, { status: 'mutated', delta, state: this.node.getState() });
      }

      if (method === 'POST' && pathname === '/mutate/set') {
        const payload = await this.parseBody(req);
        if (!payload.element) {
          return this.sendJson(res, 400, { error: 'Payload requires element string' });
        }
        let delta: CRDTDelta;
        if (payload.action === 'remove') {
          delta = this.node.removeSetElement(payload.element);
        } else {
          delta = this.node.addSetElement(payload.element);
        }
        return this.sendJson(res, 200, { status: 'mutated', delta, state: this.node.getState() });
      }

      if (method === 'POST' && pathname === '/mutate/text') {
        const payload = await this.parseBody(req);
        if (payload.action === 'delete') {
          if (!payload.id) return this.sendJson(res, 400, { error: 'Delete requires node id' });
          const delta = this.node.deleteText(payload.id);
          return this.sendJson(res, 200, { status: 'deleted', delta, state: this.node.getState() });
        } else {
          if (!payload.char) return this.sendJson(res, 400, { error: 'Insert requires char' });
          const { nodeCreatedId, delta } = this.node.insertText(payload.char, payload.anchorId || 'START');
          return this.sendJson(res, 200, { status: 'inserted', nodeCreatedId, delta, state: this.node.getState() });
        }
      }

      if (method === 'POST' && pathname === '/sync/delta') {
        const delta = await this.parseBody(req) as CRDTDelta;
        if (!delta.originNodeId || !delta.clock) {
          return this.sendJson(res, 400, { error: 'Invalid CRDTDelta payload' });
        }
        const applied = this.node.applyDelta(delta);
        return this.sendJson(res, 200, { status: applied ? 'applied' : 'ignored', state: this.node.getState() });
      }

      return this.sendJson(res, 404, { error: 'Route not found' });
    } catch (err: any) {
      return this.sendJson(res, 500, { error: err.message || 'Internal Server Error' });
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const server = new CRDTServer();
  const port = Number(process.env.PORT || 9092);
  const info = await server.listen(port);
  console.log(`CRDT Collaborative State Mesh Server listening at http://${info.host}:${info.port}`);
}
