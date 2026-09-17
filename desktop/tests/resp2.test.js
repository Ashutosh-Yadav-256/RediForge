const { describe, it } = require('node:test');
const assert = require('node:assert');
const { RespParser } = require('../dist/main/resp2/parser');
const { encodeCommand, encodeCommandArray, encodeInline } = require('../dist/main/resp2/encoder');

describe('RESP2 Encoder', () => {
  it('encodes a simple single-part command', () => {
    const encoded = encodeCommand('PING');
    assert.strictEqual(encoded.toString('utf8'), '*1\r\n$4\r\nPING\r\n');
  });

  it('encodes multi-argument commands', () => {
    const encoded = encodeCommand('SET', 'mykey', 'myvalue');
    assert.strictEqual(encoded.toString('utf8'), '*3\r\n$3\r\nSET\r\n$5\r\nmykey\r\n$7\r\nmyvalue\r\n');
  });

  it('encodes command from array of strings', () => {
    const encoded = encodeCommandArray(['HSET', 'user:100', 'name', 'Alice']);
    assert.strictEqual(
      encoded.toString('utf8'),
      '*4\r\n$4\r\nHSET\r\n$8\r\nuser:100\r\n$4\r\nname\r\n$5\r\nAlice\r\n'
    );
  });

  it('encodes inline commands', () => {
    const encoded = encodeInline('PING');
    assert.strictEqual(encoded.toString('utf8'), 'PING\r\n');
  });
});

describe('RESP2 Parser', () => {
  it('parses Simple String (+OK)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('+OK\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], 'OK');
  });

  it('parses Error (-ERR unknown command)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('-ERR unknown command\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert(results[0] instanceof Error);
    assert.strictEqual(results[0].message, 'ERR unknown command');
  });

  it('parses Integer (:1000)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from(':1000\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], 1000);
  });

  it('parses negative Integer (:-42)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from(':-42\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], -42);
  });

  it('parses Bulk String ($6\\r\\nfoobar\\r\\n)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('$6\r\nfoobar\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], 'foobar');
  });

  it('parses Empty Bulk String ($0\\r\\n\\r\\n)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('$0\r\n\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], '');
  });

  it('parses Null Bulk String ($-1\\r\\n)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('$-1\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], null);
  });

  it('parses Array (*2\\r\\n$3\\r\\nfoo\\r\\n$3\\r\\nbar\\r\\n)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(results[0], ['foo', 'bar']);
  });

  it('parses Empty Array (*0\\r\\n)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('*0\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(results[0], []);
  });

  it('parses Null Array (*-1\\r\\n)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('*-1\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], null);
  });

  it('parses nested Array (*2\\r\\n*1\\r\\n:1\\r\\n*1\\r\\n:2\\r\\n)', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('*2\r\n*1\r\n:1\r\n*1\r\n:2\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(results[0], [[1], [2]]);
  });

  it('handles chunked / fragmented packets gracefully', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('*2\r\n$5\r\nhe'));
    let results = parser.parse();
    assert.strictEqual(results.length, 0);

    parser.append(Buffer.from('llo\r\n$5\r\nworld\r\n'));
    results = parser.parse();
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(results[0], ['hello', 'world']);
  });

  it('parses multiple messages in a single buffer', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('+PONG\r\n:42\r\n$4\r\ntest\r\n'));
    const results = parser.parse();
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0], 'PONG');
    assert.strictEqual(results[1], 42);
    assert.strictEqual(results[2], 'test');
  });
});
