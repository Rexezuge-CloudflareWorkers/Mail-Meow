'use client';

export default function Unauthorized() {
  return (
    <div className="min-h-screen bg-[#101319] text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-sm uppercase tracking-[0.16em] text-[#6ee7b7] font-semibold mb-3">Mail-Meow</div>
        <h1 className="text-3xl font-semibold mb-3">Access required</h1>
        <p className="text-[#aab4c2] leading-7">
          This console is protected by Cloudflare Zero Trust. Sign in through the configured Access application to continue.
        </p>
      </div>
    </div>
  );
}
