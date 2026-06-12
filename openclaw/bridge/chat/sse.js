/**
 * SSE helpers — write to client + parse upstream chunks from chief-agents.
 */

function writeSseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

function writeSseEvent(res, { id, type, data }) {
  if (res.writableEnded) return;
  res.write(`id: ${id}\n`);
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSseComment(res, comment) {
  if (res.writableEnded) return;
  res.write(`: ${comment}\n\n`);
}

class SseParser {
  constructor() {
    this.buf = "";
    this.cur = { data: [] };
    this.out = [];
    this.decoder = new TextDecoder();
  }

  feed(chunk) {
    const s = typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    this.buf += s;
    let idx;
    while (true) {
      const lf2 = this.buf.indexOf("\n\n");
      const cr2 = this.buf.indexOf("\r\n\r\n");
      if (lf2 === -1 && cr2 === -1) break;
      // Pick whichever delimiter appears first.
      let sepLen;
      if (cr2 !== -1 && (lf2 === -1 || cr2 < lf2)) {
        idx = cr2;
        sepLen = 4;
      } else {
        idx = lf2;
        sepLen = 2;
      }
      const block = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + sepLen);
      this.parseBlock(block);
    }
  }

  drain() {
    const out = this.out;
    this.out = [];
    return out;
  }

  parseBlock(block) {
    this.cur = { data: [] };
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "id") this.cur.id = value;
      else if (field === "event") this.cur.event = value;
      else if (field === "data") this.cur.data.push(value);
    }
    if (this.cur.data.length > 0) {
      this.out.push({ id: this.cur.id, event: this.cur.event, data: this.cur.data.join("\n") });
    }
  }
}

module.exports = { writeSseHeaders, writeSseEvent, writeSseComment, SseParser };
