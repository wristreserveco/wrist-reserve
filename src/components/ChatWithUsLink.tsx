"use client";

export function ChatWithUsLink() {
  return (
    <button
      type="button"
      onClick={() => {
        document.querySelector<HTMLButtonElement>('[aria-label="Open chat"]')?.click();
      }}
      className="block w-full pt-2 text-center text-xs text-white/40 transition hover:text-gold-200"
    >
      Chat with us
    </button>
  );
}
