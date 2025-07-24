import React, { useState, useEffect } from 'react';
import { useEvents, ChimeraEvent } from '../contexts/EventContext';

interface ProgressState {
  percentage: number;
  isComplete: boolean;
  isIndeterminate: boolean;
}

const ProgressBar: React.FC = () => {
  const { events } = useEvents();
  const [progressState, setProgressState] = useState<ProgressState>({
    percentage: 0,
    isComplete: false,
    isIndeterminate: true
  });

  useEffect(() => {
    // Process events to find the latest progress and completion status
    let latestProgress = 0;
    let hasReceivedProgress = false;
    let isWorkflowComplete = false;

    // Process events in chronological order
    for (const event of events) {
      if (event.type === 'progress' && event.payload?.percentage !== undefined) {
        latestProgress = Math.max(0, Math.min(100, event.payload.percentage));
        hasReceivedProgress = true;
      } else if (event.type === 'workflow-complete') {
        isWorkflowComplete = true;
        latestProgress = 100;
        hasReceivedProgress = true;
      }
    }

    setProgressState({
      percentage: latestProgress,
      isComplete: isWorkflowComplete,
      isIndeterminate: !hasReceivedProgress
    });
  }, [events]);

  const getProgressBarClasses = () => {
    if (progressState.isIndeterminate) {
      return "h-2 rounded bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 animate-pulse bg-[length:200%_100%]";
    }
    return "h-2 rounded bg-emerald-500 transition-all duration-300 ease-out";
  };

  const getProgressText = () => {
    if (progressState.isComplete) {
      return "Done";
    }
    if (progressState.isIndeterminate) {
      return "Starting...";
    }
    return `${Math.round(progressState.percentage)}%`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">Workflow Progress</h3>
        <span className={`text-sm font-medium ${
          progressState.isComplete ? 'text-emerald-600' : 'text-gray-600'
        }`}>
          {getProgressText()}
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded h-2 overflow-hidden">
        {progressState.isIndeterminate ? (
          <div className="h-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 animate-pulse bg-[length:200%_100%] rounded"></div>
        ) : (
          <div 
            className={getProgressBarClasses()}
            style={{ width: `${progressState.percentage}%` }}
          ></div>
        )}
      </div>
      
      {progressState.isComplete && (
        <div className="mt-2 text-xs text-emerald-600 font-medium">
          Workflow completed successfully
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
