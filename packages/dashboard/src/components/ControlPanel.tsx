import React from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

const ControlPanel: React.FC = () => {
  const { ws, connectionStatus } = useWebSocket();

  const sendAction = (action: 'pause' | 'resume') => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ action });
      ws.send(message);
      console.log(`Sent control action: ${action}`);
    }
  };

  const handlePause = () => {
    sendAction('pause');
  };

  const handleResume = () => {
    sendAction('resume');
  };

  const isDisabled = connectionStatus !== 'connected' || !ws || ws.readyState !== WebSocket.OPEN;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Workflow Controls</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={handlePause}
            disabled={isDisabled}
            className={`px-6 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isDisabled
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-500'
            }`}
          >
            Pause
          </button>
          <button
            onClick={handleResume}
            disabled={isDisabled}
            className={`px-6 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isDisabled
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-green-500 text-white hover:bg-green-600 focus:ring-green-500'
            }`}
          >
            Resume
          </button>
        </div>
      </div>
      <div className="mt-2 text-sm text-gray-600">
        {isDisabled ? (
          <p>Controls disabled - WebSocket not connected</p>
        ) : (
          <p>Send pause/resume commands to the workflow engine</p>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;
