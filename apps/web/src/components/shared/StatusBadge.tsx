export default function StatusBadge({ status }: { status: string }) {
  const connected = status === 'connected';
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs uppercase ${connected ? 'bg-[#12362f] text-[#6ee7b7]' : 'bg-[#3b2f16] text-[#fbbf24]'}`}
    >
      {status}
    </span>
  );
}
