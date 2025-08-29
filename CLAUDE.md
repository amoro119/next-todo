# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 重要
1. 仔细思考，只执行我给你的具体任务，用最简洁优化的解决方案，尽可能少地修改代码。
2. 专注于解决核心问题！

## Project Overview

This is a local-first todo application built with Next.js, Electron, and PGlite. The application works both as a web app and as a desktop application. It uses ElectricSQL for synchronization between local and remote PostgreSQL databases.

Key features:
- Local-first architecture with offline support
- Real-time synchronization with cloud database
- Multi-platform desktop app via Electron
- Todo management with lists, calendar views, and import/export functionality

## Architecture

### Core Components

1. **Frontend (Next.js)**
   - Main application in `app/page.tsx`
   - Database provider in `app/electric-provider.tsx`
   - PGlite worker in `app/pglite-worker.ts`
   - UI components in `components/`

2. **Database Layer**
   - **PGlite**: Embedded PostgreSQL in the browser (Web Worker) or Electron main process
   - **ElectricSQL**: Handles bidirectional sync between local PGlite and remote PostgreSQL
   - **Offline Sync System**: Custom implementation in `lib/sync/` for queuing and processing local changes

3. **Backend Services**
   - **PostgreSQL**: Primary database (Docker container)
   - **ElectricSQL Server**: Sync engine (Docker container)
   - **Supabase**: Production backend for authentication and functions

4. **Desktop Application (Electron)**
   - Main process in `main.js`
   - Preload script in `preload.js`
   - Database handler in `electron/database-handler.js`

### Data Flow

1. **Local Operations**: All user actions are first written to the local PGlite database
2. **Change Capture**: Database triggers capture changes and store them in a sync queue
3. **Offline Queue**: Local changes are queued for synchronization when online
4. **Bidirectional Sync**: ElectricSQL handles synchronization between local and remote databases
5. **Conflict Resolution**: ElectricSQL's built-in conflict resolution handles concurrent changes

## Common Development Tasks

### Running the Application

```bash
# Development mode (web)
npm run next:dev

# Development mode (desktop)
npm run electron:dev

# Production build
npm run build
```

### Database Operations

```bash
# Reset local database
# Delete IndexedDB data in browser or ~/Library/Application Support/[app-name]/pglite-data in Electron

# Run migrations
# Migrations are automatically applied on first run
```

### Testing Offline Sync

1. Use browser dev tools to go offline
2. Make changes to todos
3. Go back online to see sync happen automatically

## Project Structure

- `app/` - Next.js app router pages and providers
- `components/` - React UI components
- `lib/` - Business logic and utilities
- `lib/sync/` - Offline synchronization system
- `db/` - Database migrations and schema
- `electron/` - Electron-specific code
- `public/` - Static assets
- `supabase/` - Supabase functions and configuration

## Key Technologies

- **Next.js 15** - React framework
- **PGlite** - Embedded PostgreSQL
- **ElectricSQL** - Real-time sync engine
- **Electron** - Desktop application wrapper
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety