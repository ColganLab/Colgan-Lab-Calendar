# Colgan Lab Calendar

A modern lab scheduling and presentation rotation platform built for academic research groups.

This web application manages:

- Weekly presentation rotations
- Whole lab meetings
- Personnel directories
- Calendar exports/imports
- Presentation swap requests
- Automated assignment/reminder email approval workflows
- Firebase cloud syncing
- Drag-and-drop custom scheduling

---

# Features

## 📅 Calendar System

- Monthly calendar UI
- Full calendar archive modal
- Today highlighting
- Drag-and-drop custom events
- Recurring events
- Holiday scheduling
- Whole-lab updates
- Presentation rotation generation

---

## 👥 Personnel Management

- Add/edit/remove lab members
- Active vs retired personnel
- Hold presenters from rotation
- Personnel search
- Birthday tracking
- Group email drafting
- Directory views by role

---

## 🔄 Presentation Rotation Engine

Automatically generates fair presentation schedules based on:

- Previous presentation history
- Lab group balancing
- Hold exclusions
- Holidays
- Existing manually scheduled events

Supports:

- Cancel & shift
- Cancel only
- Insert guest speaker
- Admin swaps

---

## 📧 Email Approval Workflow

Presentation emails are:

1. Automatically generated
2. Stored in Firebase
3. Reviewed by admins
4. Approved manually
5. Sent using GitHub Actions + Nodemailer

Supports:

- Assignment emails
- Reminder emails
- Duplicate prevention
- Stale email cleanup

---

# ☁️ Firebase Realtime Sync

The app uses Firebase Realtime Database for:

- Schedule persistence
- Personnel storage
- Pending email queue
- Real-time synchronization

---

# Tech Stack

## Frontend

- HTML5
- CSS3
- Vanilla JavaScript

## Backend / Cloud

- Firebase Realtime Database
- GitHub Actions

## Email System

- Node.js
- Nodemailer

---

# Setup Instructions

## 1. Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/Colgan-Lab-Calendar.git
cd Colgan-Lab-Calendar
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Firebase

Create a Firebase project and enable:

- Realtime Database

Replace the Firebase config inside the app:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

---

## 4. Configure GitHub Secrets

Add the following repository secrets:

| Secret | Description |
|---|---|
| `EMAIL_USER` | Gmail address |
| `EMAIL_PASS` | Gmail App Password |
| `FIREBASE_DATABASE_URL` | Firebase database URL |

---

# GitHub Actions Email Sender

The repository includes an automated workflow:

```txt
.github/workflows/send-emails.yml
```

This workflow:

- Checks Firebase for approved emails
- Sends emails using Nodemailer
- Marks emails as sent
- Prevents duplicate sends

---

# Email Object Structure

Pending emails are stored like:

```json
{
  "presenter": "John Doe",
  "presenterEmail": "john@example.com",
  "presentationDate": "2026-06-01T15:00:00.000Z",
  "type": "assignment",
  "subject": "Presentation Assignment - 6/1/2026",
  "body": "Hello John...",
  "approved": false,
  "sent": false,
  "createdAt": 1779170983512
}
```

---

# Running Locally

You can serve locally with:

```bash
npx serve
```

or simply open:

```txt
index.html
```

in a browser.

---

# Security Notice

This project was originally built for internal academic scheduling and is NOT production hardened.

Do NOT store:

- PHI
- HIPAA-regulated data
- Confidential institutional data
- Sensitive credentials

before implementing:

- Proper authentication
- Role-based access control
- Secure backend validation
- Database security rules

---

# Future Improvements

Potential upgrades:

- Firebase Authentication
- OAuth login
- Role-based permissions
- Email templates
- ICS subscription feeds
- Dark mode
- Mobile app support
- Calendar filtering
- Presentation analytics

---

# License

MIT License

---

# Author

Built for the Colgan Lab scheduling and presentation workflow.
