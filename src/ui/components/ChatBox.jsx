import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FADE_AFTER_MS = 10000;
const VISIBLE_ROWS = 8;

/** The token being typed (after the last space) and everything before it. */
function splitLast(value) {
  const m = value.match(/^([\s\S]*?)(\S*)$/);
  return { head: m ? m[1] : value, last: m ? m[2] : '' };
}

/** Usage string with the argument being typed picked out. */
function UsageLine({ usage, argIndex }) {
  if (!usage) return null;
  // Word 0 is "/command"; each later word is one argument, so "[x y z]"
  // lines up with three arguments.
  const words = usage.split(' ');
  return (
    <div className="font-mono text-[12px] leading-snug">
      {words.map((word, i) => (
        <span
          key={i}
          className={
            i === 0
              ? 'text-white font-bold'
              : i - 1 === argIndex
                ? 'text-[#ffe066] font-bold'
                : 'text-white/45'
          }
        >
          {i > 0 ? ' ' : ''}
          {word}
        </span>
      ))}
    </div>
  );
}

function Highlight({ text, query }) {
  const q = query.toLowerCase();
  const t = String(text);
  const at = q ? t.toLowerCase().indexOf(q) : -1;
  if (at < 0) return <>{t}</>;
  return (
    <>
      {t.slice(0, at)}
      <span className="text-[#ffe066]">{t.slice(at, at + q.length)}</span>
      {t.slice(at + q.length)}
    </>
  );
}

function CommandHelper({ helper, items, selected, query, onPick }) {
  const listRef = useRef(null);
  useEffect(() => {
    const row = listRef.current?.children?.[selected];
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  if (!helper) return null;
  const command = helper.command;
  const isCommandList = helper.kind === 'command';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="chat-helper"
      data-testid="chat-helper"
    >
      {!isCommandList && command && (
        <div className="px-3 pt-2.5 pb-2 border-b border-white/[0.06]">
          <UsageLine usage={command.usage} argIndex={helper.argIndex} />
          <div className="text-[11px] text-white/55 mt-0.5">
            {command.description}
          </div>
        </div>
      )}
      {isCommandList && (
        <div className="px-3 pt-2 pb-1 label-caps !text-[10px]">
          Commands
        </div>
      )}

      {items.length > 0 && (
        <div
          ref={listRef}
          className="overflow-y-auto py-1"
          style={{ maxHeight: `${VISIBLE_ROWS * 30 + 8}px` }}
        >
          {items.map((item, i) => (
            <button
              type="button"
              key={`${item.value}-${i}`}
              data-suggestion={item.value}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(item);
              }}
              className={`chat-suggestion ${i === selected ? 'is-selected' : ''}`}
            >
              <span className="font-mono text-[12.5px] font-semibold text-white whitespace-nowrap">
                <Highlight text={item.label ?? item.value} query={isCommandList ? `/${query}` : query} />
              </span>
              {isCommandList && item.usage && (
                <span className="font-mono text-[11px] text-white/35 whitespace-nowrap truncate">
                  {item.usage.split(' ').slice(1).join(' ')}
                </span>
              )}
              <span className="ml-auto pl-3 text-[11px] text-white/50 truncate text-right">
                {item.detail}
              </span>
            </button>
          ))}
        </div>
      )}

      {helper.error && (
        <div
          className="px-3 py-2 text-[12px] font-semibold text-[#ff8a80] border-t border-white/[0.06]"
          data-testid="chat-helper-error"
        >
          {helper.error}
        </div>
      )}
      {!helper.error && items.length === 0 && helper.hint && (
        <div className="px-3 py-2 text-[11px] text-white/45">{helper.hint}</div>
      )}

      <div className="px-3 py-1.5 text-[10px] text-white/35 border-t border-white/[0.06] flex gap-3">
        <span>
          <kbd className="chat-kbd">Tab</kbd> complete
        </span>
        <span>
          <kbd className="chat-kbd">↑↓</kbd> choose
        </span>
        <span>
          <kbd className="chat-kbd">Enter</kbd> run
        </span>
        <span>
          <kbd className="chat-kbd">Esc</kbd> close
        </span>
      </div>
    </motion.div>
  );
}

function MessageRow({ msg, faded }) {
  const tone =
    msg.type === 'error'
      ? 'chat-msg-error'
      : msg.type === 'system'
        ? 'chat-msg-system'
        : msg.type === 'bot'
          ? 'chat-msg-bot'
          : '';
  return (
    <motion.div
      layout="position"
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: faded ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: faded ? 0.6 : 0.18 }}
      className={`chat-msg ${tone}`}
    >
      {msg.type === 'user' && (
        <span className="text-white/55 font-semibold mr-1.5">
          &lt;{msg.sender}&gt;
        </span>
      )}
      {msg.type === 'bot' && (
        <span className="text-[#8fd46a] font-bold mr-1.5">[{msg.sender}]</span>
      )}
      <span className="leading-relaxed">{msg.text}</span>
    </motion.div>
  );
}

/**
 * Chat window. "/" opens it with a slash, T opens it empty. While typing a
 * command a helper lists matching commands and argument values.
 */
export const ChatBox = ({ game }) => {
  const [messages, setMessages] = useState(() => [
    ...(game.chat?.messages ?? []),
  ]);
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [now, setNow] = useState(() => Date.now());
  const draftRef = useRef('');
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const handleOpen = (e) => {
      const prefill = e.detail?.prefill ?? '';
      setValue(prefill);
      setSelected(0);
      setHistoryIndex(-1);
      setIsOpen(true);
      game.chat.visible = true;
      if (document.pointerLockElement) document.exitPointerLock();
      setTimeout(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(prefill.length, prefill.length);
      }, 30);
    };
    const handleUpdate = (e) => {
      setMessages([...e.detail]);
      setNow(Date.now());
    };
    window.addEventListener('chat-open', handleOpen);
    window.addEventListener('chat-updated', handleUpdate);
    return () => {
      window.removeEventListener('chat-open', handleOpen);
      window.removeEventListener('chat-updated', handleUpdate);
    };
  }, [game]);

  // While closed, messages fade out after a few seconds.
  useEffect(() => {
    if (isOpen) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [isOpen, messages]);

  const helper = useMemo(() => {
    if (!isOpen || !value.startsWith('/')) return null;
    return game.commandManager?.getSuggestions(value.slice(1)) ?? null;
  }, [game, isOpen, value]);

  const { last } = splitLast(value);
  const query = helper?.kind === 'command' ? value.slice(1).trim() : last;
  const items = useMemo(() => {
    const list = helper?.items ?? [];
    // A single suggestion that is already typed out is noise.
    if (list.length === 1 && list[0].value === query && helper?.kind !== 'command')
      return [];
    return list;
  }, [helper, query]);
  const sel = items.length ? Math.min(selected, items.length - 1) : 0;

  const close = () => {
    setIsOpen(false);
    setValue('');
    game.chat.visible = false;
    if (game.hasStarted && !game.isPaused && !game.gameState.isInventoryOpen) {
      game.input?.setPointerLock();
    }
  };

  const complete = (item) => {
    if (!item) return;
    let next;
    if (helper?.kind === 'command') {
      next = `/${item.value} `;
    } else {
      const { head } = splitLast(value);
      next = `${head}${item.value} `;
    }
    setValue(next);
    setSelected(0);
    setHistoryIndex(-1);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(next.length, next.length);
    });
  };

  const browseHistory = (dir) => {
    const history = game.chat?.history ?? [];
    if (history.length === 0) return;
    let index = historyIndex;
    if (index === -1) {
      if (dir > 0) return;
      draftRef.current = value;
      index = history.length;
    }
    index += dir;
    if (index < 0) index = 0;
    if (index >= history.length) {
      setHistoryIndex(-1);
      setValue(draftRef.current);
      return;
    }
    setHistoryIndex(index);
    setValue(history[index]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = value;
    close();
    if (text.trim()) game.chat.sendMessage(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (items.length === 0) return;
      if (e.shiftKey) {
        setSelected((sel - 1 + items.length) % items.length);
        return;
      }
      complete(items[sel]);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      if (items.length > 0 && historyIndex === -1) {
        setSelected((sel + dir + items.length) % items.length);
      } else {
        browseHistory(dir);
      }
    }
  };

  const shown = isOpen
    ? messages.slice(-40)
    : messages.filter((m) => now - m.timestamp < FADE_AFTER_MS).slice(-8);

  return (
    <div
      className={`absolute bottom-36 left-3 md:bottom-44 md:left-6 w-[calc(100%-1.5rem)] max-w-[480px] flex flex-col gap-2 ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      data-testid="chat-box"
    >
      <div
        ref={scrollRef}
        className={`flex flex-col gap-1 justify-end ${isOpen ? 'max-h-72 overflow-y-auto chat-scroll' : 'overflow-hidden max-h-60'}`}
      >
        <AnimatePresence initial={false}>
          {shown.map((msg) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              faded={!isOpen && now - msg.timestamp > FADE_AFTER_MS - 1000}
            />
          ))}
        </AnimatePresence>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="relative">
          <div className="absolute bottom-full left-0 right-0 mb-2">
            <CommandHelper
              helper={helper}
              items={items}
              selected={sel}
              query={query}
              onPick={complete}
            />
          </div>
          <input
            id="chat-input"
            ref={inputRef}
            type="text"
            value={value}
            autoComplete="off"
            spellCheck={false}
            maxLength={256}
            onChange={(e) => {
              setValue(e.target.value);
              setSelected(0);
              setHistoryIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            className="chat-input"
            placeholder="Say something, or type / for commands"
          />
          <button type="submit" className="hidden">
            Send
          </button>
        </form>
      )}
    </div>
  );
};
