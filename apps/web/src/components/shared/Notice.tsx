export interface NoticeData {
  type: 'success' | 'error';
  text: string;
}

export default function Notice({ notice }: { notice: NoticeData | null }) {
  if (!notice) return null;
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-down px-5 py-3 rounded-md shadow-xl bg-[#1a1f29] border border-[#374151]">
      <span className={notice.type === 'success' ? 'text-[#6ee7b7]' : 'text-[#fca5a5]'}>{notice.text}</span>
    </div>
  );
}
