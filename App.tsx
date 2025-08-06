import React, { useRef, useState } from 'react';
import MetaballCanvas, { MetaballCanvasHandles } from './components/MetaballCanvas';

const App: React.FC = () => {
  const canvasRef = useRef<MetaballCanvasHandles>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [error, setError] = useState('');

  const handleEnableAudio = async () => {
    if (canvasRef.current) {
      const success = await canvasRef.current.initAudio();
      if (success) {
        setAudioEnabled(true);
      } else {
        setError('Microphone access denied.');
      }
    }
  };


  return (
    <main className="relative w-screen h-screen bg-gray-900 text-white overflow-hidden">
      <MetaballCanvas ref={canvasRef} />
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col items-center justify-center">
        
      </div>
      {!audioEnabled && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <button 
            onClick={handleEnableAudio}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-300"
          >
            Enable Audio Reactivity
          </button>
           {error && <p className="text-red-500 text-xs text-center mt-2">{error}</p>}
        </div>
      )}
       <div className="absolute bottom-4 right-4 text-xs text-gray-500 pointer-events-none text-right">
        Move your mouse to shift the camera <br/>
        {audioEnabled && "Audio reactivity enabled"}
      </div>
    </main>
  );
};

export default App;