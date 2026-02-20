# Tennis Scheduler

A full-stack web app for tennis coaches to manage team schedules, player availability, line assignments, and scores.

## Features

- **Player Roster** — Add/import players (name, email, cell). Bulk import via CSV paste.
- **Seasons & Line Templates** — Define season defaults: play day, start time, and line configuration (e.g., 4 doubles + 1 singles).
- **Match Schedule** — Create matches with opponent, date/time, home/away (with address).
  - Use a standard match date or assign **custom dates per line**.
- **Availability Notifications** — Generate unique SMS links per player. Players click the link and mark which dates/lines they can play — no login required.
- **Line Assignment** — Captain assigns players to lines using the availability data. Send SMS notifications to the team about assignments.
- **Score Tracking** — Enter set-by-set scores and win/loss for each line.
- **Player Records** — View full match history and win/loss record per player, broken down by singles/doubles.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3 — no setup required)
- **SMS**: Twilio (optional — configure via `.env`)

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure environment (optional — for SMS)

```bash
cp server/.env.example server/.env
# Edit server/.env with your Twilio credentials
```

### 3. Run in development

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### 4. Production build

```bash
npm run build
npm start
```

## SMS Setup (Twilio)

1. Create a [Twilio account](https://www.twilio.com)
2. Get a phone number capable of SMS
3. Add to `server/.env`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_FROM_NUMBER=+1xxxxxxxxxx
   BASE_URL=https://your-app-domain.com
   ```

Without Twilio configured, you can still use the **Get Links** feature to copy/paste availability links manually.

## Usage Flow

1. **Setup**: Create a Season with your line template (e.g., 4 Doubles + 1 Singles, Sundays at 1pm)
2. **Add Players**: Import your team roster with their cell numbers
3. **Create Match**: Pick opponent, date, home/away. Lines auto-populate from your season template.
4. **Send Availability**: Click "Send SMS" — each player gets a personal link to mark if they can play
5. **Assign Lines**: Once responses come in, assign available players to each line
6. **Notify Team**: Send SMS to let everyone know who's playing where
7. **Enter Scores**: After the match, enter scores for each line
8. **View Records**: Check any player's win/loss history
