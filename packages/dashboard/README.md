# Chimera Live Dashboard

A real-time web dashboard for monitoring Chimera CLI workflow events via WebSocket connection.

## Features

- **Live Event Streaming**: Connects to WebSocket gateway at `ws://localhost:4000/events`
- **Real-time Updates**: Displays ChimeraEventBus events as they happen
- **Event Visualization**: Color-coded event types with timestamps and payload summaries
- **Auto-reconnection**: Automatically reconnects if WebSocket connection is lost
- **Responsive Design**: Built with Tailwind CSS for clean, modern UI

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The dashboard will be available at http://localhost:5173

## Prerequisites

Make sure the Chimera CLI WebSocket gateway is running on port 4000. The dashboard expects to connect to:
- WebSocket URL: `ws://localhost:4000/events`

## Event Types

The dashboard displays various event types with color coding:

- **agent-start/agent-end**: Blue - Agent lifecycle events
- **progress**: Green - Progress updates with percentages
- **error**: Red - Error events and failures
- **log**: Gray - General log messages
- **workflow-start/workflow-complete**: Purple - Workflow lifecycle events

## Development

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Architecture

- **React 18** - Component framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **WebSocket API** - Real-time event streaming
