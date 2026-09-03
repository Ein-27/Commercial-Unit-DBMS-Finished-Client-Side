import { useState, useRef, useEffect } from 'react';

interface Props {
  message: string;
  confirmLabel?: string;
  confirmClassName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Custom confirmation popup — replaces window.confirm() throughout the system. */
export function ConfirmDialog({ message, confirmLabel = 'Confirm', confirmClassName, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <p className="text-gray-700 text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={confirmClassName ?? 'flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700'}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** State type used by useConfirm hook. */
interface ConfirmState {
  message: string;
  confirmLabel?: string;
  confirmClassName?: string;
  onYes: () => void;
}

/**
 * Pop-up dialog for entering a print report title.
 * Replaces window.prompt() for the print title prompt.
 */
export function PrintTitleModal({ defaultTitle, onConfirm, onCancel }: {
  defaultTitle: string; onConfirm: (title: string) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const confirm = () => onConfirm(title.trim() || defaultTitle);
  return (
    <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm">Print Report</h3>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Report Title <span className="text-gray-400">(leave blank for default)</span></label>
          <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirm()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={defaultTitle} />
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={confirm} className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800">Print</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook that provides a programmatic confirm() equivalent.
 * Returns `ask` (triggers dialog) and `dialog` (JSX to render).
 *
 * Usage:
 *   const { ask, dialog } = useConfirm();
 *   // in JSX: {dialog}
 *   // to trigger: ask('Are you sure?', () => doSomething())
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const ask = (message: string, onYes: () => void, confirmLabel?: string, confirmClassName?: string) => {
    setState({ message, onYes, confirmLabel, confirmClassName });
  };

  const dialog = state ? (
    <ConfirmDialog
      message={state.message}
      confirmLabel={state.confirmLabel}
      confirmClassName={state.confirmClassName}
      onConfirm={() => { state.onYes(); setState(null); }}
      onCancel={() => setState(null)}
    />
  ) : null;

  return { ask, dialog };
}
