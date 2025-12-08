# Sporcle League

A real-time competitive trivia platform built with Firebase and vanilla JavaScript. Players compete daily on Sporcle quizzes, earn points throughout the season, and face off in Head-to-Head matchmaking and playoff tournaments.

## Features

### Daily Quiz Competition

- **Daily Leaderboard**: Submit scores from daily Sporcle quizzes with automatic ranking
- **Tiebreaker System**: Time remaining serves as the tiebreaker for identical scores
- **Real-time Updates**: Standings update instantly via Firebase real-time listeners

### Season Standings

- **Point System**: Points awarded based on daily ranking (1st place = most points)
- **Cumulative Tracking**: Season-long leaderboard tracks total points earned
- **First/Last Place Stats**: Track who gets the most first places and last places

### Head-to-Head Matchmaking

- **Real-time Queuing**: Find opponents instantly with websocket-style matching
- **Category Selection**: Choose from 9 queue types (Random + 8 specific categories)
- **Category-based Standings**: Track win/loss records per category
- **Streak Tracking**: Current streak and best win streak displayed

### Playoff Tournament System

- **32-Team Bracket**: Standard NCAA-style tournament bracket
- **Seeded Matchups**: Seeds determined by season standings (1 vs 32, 2 vs 31, etc.)
- **BYE Handling**: Automatic advancement when fewer than 32 players
- **Real-time Bracket Updates**: Live bracket visualization with React components

### Quiz Wheel

- **Animated Spinner**: Physics-based wheel animation for quiz selection
- **8 Categories**: Geography, History, Science, Sports, Movies/TV, Music, Literature, Misc
- **Quiz Database**: Admins can add quizzes with category tags via the Quiz Manager

### Hall of Champions

- **Season Awards**: Four awards given at season end:
  - 🏆 Commissioner's Trophy (most regular season points)
  - 🥇 Sporcle Cup (playoff champion)
  - 👹 Head to Head Demon (most H2H wins)
  - ⭐ Highest Highs (most first places)
- **Champion Badges**: Award winners display badges next to their names

### User Authentication

- **Email/Password Auth**: Users create accounts to track their stats
- **Persistent Sessions**: Stay logged in across browser sessions
- **Profile Management**: Edit display name and alias

### Admin Controls

- **Quiz Management**: Set daily quiz links, manage quiz database
- **Points Management**: Edit/delete player points, award points manually
- **Season Management**: End playoffs, archive and reset season data
- **Playoff Controls**: Finalize brackets, manually set match winners

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **UI Framework**: Bootstrap 5 with Bootswatch Minty theme
- **Backend**: Firebase (Firestore, Authentication, Cloud Functions)
- **Real-time Data**: Firestore real-time listeners
- **Rendering**: React (for playoff bracket component)

## Project Structure

```
public/
├── index.html          # Main application (7000+ lines)
│   ├── Firebase initialization
│   ├── Authentication system
│   ├── Daily quiz section with wheel
│   ├── Today's standings
│   ├── Season standings
│   ├── Head-to-Head matchmaking
│   ├── Playoff bracket (React)
│   ├── Hall of Champions
│   └── Admin panel
├── app.js              # Application logic
│   ├── Champion badges system
│   ├── Standings rendering
│   ├── Awards display
│   ├── Admin UI handlers
│   └── Tab navigation
├── styles.css          # Custom styles
│   ├── Bracket layout
│   ├── Responsive breakpoints
│   └── Component styling
└── quiz-admin.html     # Quiz database manager
    ├── Quiz CRUD operations
    ├── Category management
    └── Admin authentication
```

## Firebase Collections

| Collection          | Purpose                              |
| ------------------- | ------------------------------------ |
| `today`             | Current day's quiz submissions       |
| `points`            | Season standings (cumulative points) |
| `userProfiles`      | User account information             |
| `headtoheadQueue`   | H2H matchmaking queue                |
| `headtoheadMatches` | Active/completed H2H matches         |
| `headtoheadRecords` | H2H win/loss statistics              |
| `playoffSeries`     | Playoff bracket matchups             |
| `wheelQuizzes`      | Quiz database with categories        |
| `wheelSpin`         | Current wheel spin state             |
| `quizLink`          | Today's quiz URL                     |
| `config`            | App configuration (playoffs state)   |
| `archivedPoints`    | Historical season data               |
| `archivedH2H`       | Historical H2H records               |

## Key Features Implementation

### Real-time Matchmaking

The H2H system uses a polling-based matchmaking approach:

1. Player joins queue with selected category
2. System checks for compatible opponents every 3 seconds
3. When matched, both players receive the same quiz
4. Scores submitted and winner determined automatically

### Tiebreaker System

When players have identical scores:

1. Higher percentage wins
2. If tied: More time remaining wins
3. If still tied: Higher raw score wins
4. If still tied: Alphabetical by name

### Playoff Bracket Algorithm

Uses standard NCAA tournament seeding:

- Seeds 1-32 based on regular season points
- Bracket pairs: 1v32, 16v17, 8v25, 9v24, etc.
- Winners advance to next round automatically

## Setup Instructions

1. **Create Firebase Project**

   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create new project
   - Enable Firestore Database
   - Enable Authentication (Email/Password)

2. **Configure Firebase**

   - Copy your Firebase config to `index.html`
   - Deploy Firestore security rules

3. **Deploy**

   ```bash
   firebase deploy --only hosting
   ```

4. **Set Admin Access**
   - Use Firebase Admin SDK to set custom claims
   - Run in Google Cloud Shell:
   ```javascript
   admin.auth().setCustomUserClaims(USER_UID, { admin: true });
   ```

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null && request.auth.token.admin == true;
    }

    match /config/{document} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /points/{alias} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /today/{alias} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /userProfiles/{uid} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    match /headtoheadQueue/{doc} {
      allow read, write: if request.auth != null;
    }

    match /headtoheadMatches/{doc} {
      allow read, write: if request.auth != null;
    }

    match /headtoheadRecords/{alias} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /playoffSeries/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /wheelQuizzes/{doc} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if isAdmin();
    }

    match /wheelSpin/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /archivedPoints/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /archivedH2H/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

## Future Enhancements

- [ ] Push notifications for H2H matches
- [ ] Historical season browser
- [ ] Player profile pages
- [ ] Match history viewer
- [ ] Mobile app version
- [ ] Discord integration

## License

This project was created for educational purposes as part of a web development course.

## Author

Jared Ellis

## Acknowledgments

- [Sporcle](https://www.sporcle.com) for the quiz content
- [Firebase](https://firebase.google.com) for the backend infrastructure
- [Bootstrap](https://getbootstrap.com) for the UI framework
- [Bootswatch](https://bootswatch.com) for the Minty theme
