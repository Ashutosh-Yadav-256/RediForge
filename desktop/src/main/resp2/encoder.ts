const CRLF = '\r\n';

export function encodeCommand(...parts: string[]): Buffer {
  let out = '*' + parts.length + CRLF;
  for (const part of parts) {
    const s = String(part);
    out += '$' + Buffer.byteLength(s) + CRLF + s + CRLF;
  }
  return Buffer.from(out, 'utf8');
}

export function encodeCommandArray(parts: string[]): Buffer {
  return encodeCommand(...parts);
}

export function encodeInline(command: string): Buffer {
  return Buffer.from(command + CRLF, 'utf8');
}
