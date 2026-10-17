import React, { useEffect, useState } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

/** Shared building blocks for the menus. */

export const BlockButton = ({
  children,
  icon,
  color,
  className = '',
  big = false,
  ...props
}) => (
  <button
    className={`block-btn ${color ? `block-btn-${color}` : ''} ${big ? 'text-base py-4' : ''} ${className}`}
    {...props}
  >
    {icon && <span className="shrink-0 opacity-90">{icon}</span>}
    {children}
  </button>
);

/** Title bar with a back button. Escape also goes back. */
export const ScreenHeader = ({ title, subtitle, onBack, right }) => {
  useEscape(onBack);
  return (
    <div className="flex items-center gap-3">
      {onBack && (
        <button
          onClick={onBack}
          title="Back (Esc)"
          className="block-btn block-btn-ghost !p-2.5 shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold leading-tight truncate">{title}</h2>
        {subtitle && <p className="text-xs text-white/45 truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
};

// Escape handlers of the open screens; only the most recent one runs.
const escapeStack = [];
const onEscapeKey = (e) => {
  if (e.key !== 'Escape' || escapeStack.length === 0) return;
  if (e.target instanceof HTMLTextAreaElement) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  escapeStack[escapeStack.length - 1].current();
};

export function useEscape(handler) {
  const ref = React.useRef(handler);
  ref.current = handler;
  // Screens that are animating out no longer take the key.
  const present = useIsPresent();
  const enabled = Boolean(handler) && present;
  useEffect(() => {
    if (!enabled) return undefined;
    if (escapeStack.length === 0) window.addEventListener('keydown', onEscapeKey, true);
    escapeStack.push(ref);
    return () => {
      escapeStack.splice(escapeStack.indexOf(ref), 1);
      if (escapeStack.length === 0) window.removeEventListener('keydown', onEscapeKey, true);
    };
  }, [enabled]);
}

export const Panel = ({ children, className = '', ...props }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -12 }}
    transition={{ duration: 0.18 }}
    className={`glass-card p-5 md:p-6 flex flex-col gap-5 ${className}`}
    {...props}
  >
    {children}
  </motion.div>
);

export const Toggle = ({ label, desc, active, onToggle }) => (
  <button
    onClick={onToggle}
    role="switch"
    aria-checked={Boolean(active)}
    className="w-full flex items-center justify-between gap-4 p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-colors border-2 border-white/5 text-left"
  >
    <div className="flex flex-col min-w-0">
      <span className="text-sm font-bold">{label}</span>
      {desc && <span className="text-xs text-white/45">{desc}</span>}
    </div>
    <div
      className={`w-11 h-6 shrink-0 rounded-md relative transition-colors border-2 border-black/40 ${active ? 'bg-[#5fae3c]' : 'bg-white/10'}`}
    >
      <motion.div
        animate={{ x: active ? 20 : 2 }}
        initial={false}
        className="absolute top-0.5 w-4 h-4 bg-white rounded-sm shadow"
      />
    </div>
  </button>
);

export const Slider = ({
  label,
  desc,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  format = (v) => v,
}) => {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <div
      className={`flex flex-col gap-2 p-4 bg-white/[0.04] rounded-xl border-2 border-white/5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
    >
      <div className="flex justify-between items-baseline gap-3">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-sm font-bold text-[#ffe066] tabular-nums">{format(val)}</span>
      </div>
      {desc && <span className="text-xs text-white/45 -mt-1">{desc}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVal(v);
          onChange(v);
        }}
        className="w-full cursor-pointer accent-[#5fae3c]"
      />
    </div>
  );
};

/** A row of mutually exclusive options. */
export const Choice = ({ options, value, onChange, columns = Math.min(options.length, 4) }) => (
  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-colors ${
          value === o.value
            ? 'bg-[#5fae3c]/20 border-[#5fae3c] text-white'
            : 'bg-white/[0.04] border-white/5 text-white/60 hover:bg-white/[0.08]'
        }`}
      >
        {o.icon}
        <span className="text-sm font-bold">{o.label}</span>
        {o.desc && <span className="text-[11px] leading-snug text-white/45">{o.desc}</span>}
      </button>
    ))}
  </div>
);
