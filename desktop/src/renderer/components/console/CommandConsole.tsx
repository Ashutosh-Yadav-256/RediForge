import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ConsoleEntry {
  id: number;
  command: string;
  output: string;
  error: string | null;
  timestamp: number;
}

export const CommandConsole: React.FC = () => {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [input, setInput] = useState('');
  const [safeMode, setSafeMode] = useState(false);
  const [commandList, setCommandList] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<string[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const history = useRef<string[]>([]);

  useEffect(() => {
    window.api.getCommandList().then(setCommandList);
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [entries]);

  useEffect(() => {
    if (!input.trim()) {
      setShowAutocomplete(false);
      return;
    }

    const parts = input.trim().split(/\s+/);
    if (parts.length > 1) {
      setShowAutocomplete(false);
      return;
    }

    const prefix = parts[0].toUpperCase();
    const matches = commandList.filter(cmd => cmd.startsWith(prefix) && cmd !== prefix);

    if (matches.length > 0 && matches.length <= 20) {
      setFilteredCommands(matches);
      setShowAutocomplete(true);
      setAutocompleteIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  }, [input, commandList]);

  const executeCommand = useCallback(async (cmd: string) => {
    if (!cmd.trim()) return;

    history.current.push(cmd);
    setHistoryIndex(-1);

    const result = await window.api.executeCommand(cmd, safeMode);

    setEntries(prev => [...prev, {
      id: nextId.current++,
      command: cmd,
      output: result.output,
      error: result.error,
      timestamp: Date.now(),
    }]);

    setInput('');
    setShowAutocomplete(false);
  }, [safeMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (showAutocomplete && filteredCommands.length > 0) {
        setInput(filteredCommands[autocompleteIndex] + ' ');
        setShowAutocomplete(false);
        return;
      }
      executeCommand(input);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (showAutocomplete && filteredCommands.length > 0) {
        setInput(filteredCommands[autocompleteIndex] + ' ');
        setShowAutocomplete(false);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showAutocomplete) {
        setAutocompleteIndex(prev => Math.max(0, prev - 1));
        return;
      }

      const h = history.current;
      if (h.length === 0) return;
      const newIdx = historyIndex === -1 ? h.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIdx);
      setInput(h[newIdx]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showAutocomplete) {
        setAutocompleteIndex(prev => Math.min(filteredCommands.length - 1, prev + 1));
        return;
      }
      const h = history.current;
      if (historyIndex === -1) return;
      const newIdx = historyIndex + 1;
      if (newIdx >= h.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(newIdx);
        setInput(h[newIdx]);
      }
      return;
    }

    if (e.key === 'Escape') {
      setShowAutocomplete(false);
    }

    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
    }
  };

  return (
    <div className="console">
      <div className="console__header">
        <div className="console__title">Command Console</div>
        <div className="console__safe-mode">
          <input
            type="checkbox"
            className="console__safe-toggle"
            checked={safeMode}
            onChange={(e) => setSafeMode(e.target.checked)}
            id="safe-mode"
          />
          <label htmlFor="safe-mode" style={{ cursor: 'pointer' }}>
            Safe Mode {safeMode ? '' : ''}
          </label>
        </div>
      </div>

      <div className="console__output selectable" ref={outputRef}>
        {entries.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Type a command and press Enter. Try: PING, SET hello world, GET hello
            <br />
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
              Ctrl+L to clear • ↑↓ for history • Tab for autocomplete
            </span>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="console__entry">
            <div>
              <span className="console__prompt">rediforge&gt; </span>
              <span className="console__command">{entry.command}</span>
            </div>
            {entry.error ? (
              <div className="console__error">{entry.error}</div>
            ) : entry.output ? (
              <div className="console__result">{entry.output}</div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="console__input-area" style={{ position: 'relative' }}>
        {showAutocomplete && filteredCommands.length > 0 && (
          <div className="autocomplete">
            {filteredCommands.map((cmd, i) => (
              <div
                key={cmd}
                className={`autocomplete__item ${i === autocompleteIndex ? 'autocomplete__item--active' : ''}`}
                onMouseDown={() => {
                  setInput(cmd + ' ');
                  setShowAutocomplete(false);
                  inputRef.current?.focus();
                }}
              >
                {cmd}
              </div>
            ))}
          </div>
        )}
        <span className="console__input-prompt">rediforge&gt;</span>
        <input
          ref={inputRef}
          className="console__input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
      </div>
    </div>
  );
};
