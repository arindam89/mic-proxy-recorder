interface Props {
  errorMessage: string | null;
  onDismissError: () => void;
}

export default function StatusBar({ errorMessage, onDismissError }: Props) {
  if (!errorMessage) return null;

  return (
    <div className="flex items-center justify-between border-t border-red-800 bg-red-950 px-6 py-2">
      <p className="text-sm text-red-300">{errorMessage}</p>
      <button
        onClick={onDismissError}
        className="text-xs text-red-400 hover:text-red-200 focus:outline-none"
      >
        Dismiss
      </button>
    </div>
  );
}
