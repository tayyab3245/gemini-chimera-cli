import EventStream from './components/EventStream';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Chimera Live Dashboard
          </h1>
          <p className="text-lg text-gray-600">
            Real-time monitoring of workflow agents and events
          </p>
        </header>
        
        <main>
          <EventStream />
        </main>
        
        <footer className="mt-8 text-center text-sm text-gray-500">
          <p>Chimera CLI Dashboard - Built with React + Vite</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
