export default function LoadingScreen() {
  return (
    <div className="min-h-screen espresso-surface flex items-center justify-center">
      <div className="text-center">
        <div className="w-24 h-24 mx-auto mb-5 relative">
          <img src="/logo.png" alt="JPOS" className="w-16 h-16 rounded-full object-cover absolute inset-0 m-auto ring-1 ring-caramel-300/40" />
          <div className="w-24 h-24 border-[3px] border-caramel-400 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
        </div>
        <h2 className="font-display text-3xl font-semibold text-cream-50 tracking-wide">JPOS</h2>
        <p className="font-script text-3xl text-caramel-300 mt-1">Brewing your workspace…</p>
      </div>
    </div>
  );
}
