export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-espresso-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 relative">
          <div className="w-16 h-16 border-4 border-espresso-200 rounded-full"></div>
          <div className="w-16 h-16 border-4 border-espresso-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
        </div>
        <h2 className="font-display text-2xl text-espresso-800">JPOS</h2>
        <p className="text-bark-500 text-sm mt-1 font-body">Loading your workspace...</p>
      </div>
    </div>
  );
}
