/**
 * RESP2 Encoder — Encodes commands into RESP2 bulk string array format.
 * Reverses the direction: client → server encoding.
 */

const CRLF = '\r\n';

/**
 * Encode a command and its arguments into a RESP2 bulk string array.
 * e.g., encodeCommand('SET', 'key', 'value') →
 *   "*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n"
 */
export function encodeCommand(...parts: string[]): Buffer {
  let out = '*' + parts.length + CRLF;
  for (const part of parts) {
    const s = String(part);
    out += '$' + Buffer.byteLength(s) + CRLF + s + CRLF;
  }
  return Buffer.from(out, 'utf8');
}

/**
 * Encode a command from an array of strings.
 */
export function encodeCommandArray(parts: string[]): Buffer {
  return encodeCommand(...parts);
}

/**
 * Encode an inline command (for simple testing).
 */
export function encodeInline(command: string): Buffer {
  return Buffer.from(command + CRLF, 'utf8');
}
