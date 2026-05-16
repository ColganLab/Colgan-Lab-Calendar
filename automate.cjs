const firebase = require('firebase/app');
require('firebase/database');
const nodemailer = require('nodemailer');

/*
|--------------------------------------------------------------------------
| Firebase Configuration
|--------------------------------------------------------------------------
*/

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/*
|--------------------------------------------------------------------------
| Email Transporter
|--------------------------------------------------------------------------
*/

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/*
|--------------------------------------------------------------------------
| Holiday Logic
|--------------------------------------------------------------------------
*/

function getHoliday(date) {
    const d = date.getDate();
    const m = date.getMonth();
    const day = date.getDay();

    if (day !== 1) return null;

    if (m === 0 && d === 1) return "New Year's Day";
    if (m === 0 && d >= 15 && d <= 21) return "MLK Jr. Day";
    if (m === 4 && d >= 25) return "Memorial Day";
    if (m === 5 && d === 19) return "Juneteenth";
    if (m === 6 && d === 4) return "Independence Day";
    if (m === 8 && d <= 7) return "Labor Day";
    if (m === 10 && d >= 22 && d <= 28) return "Thanksgiving Monday (Observed)";
    if (m === 11 && d === 25) return "Christmas Day";

    return null;
}

/*
|--------------------------------------------------------------------------
| Main Automation
|--------------------------------------------------------------------------
*/

async function runAutomation() {

    try {

        console.log("📥 Fetching lab metadata from Firebase...");

        /*
        |--------------------------------------------------------------------------
        | Fetch Firebase Data
        |--------------------------------------------------------------------------
        */

        const snapshot = await db.ref().get();

        const data = snapshot.val() || {};

        const rawParticipants =
            data.participants
                ? Object.values(data.participants)
                : [];

        // IMPORTANT FIX:
        // Frontend uses scheduleState
        let rawSchedule = data.scheduleState || [];

        /*
        |--------------------------------------------------------------------------
        | Parse Existing Schedule
        |--------------------------------------------------------------------------
        */

        let schedule = rawSchedule
            .map(s => ({
                ...s,
                date: new Date(s.date),
                endDate: s.endDate
                    ? new Date(s.endDate)
                    : null
            }))
            .sort((a, b) => a.date - b.date);

        /*
        |--------------------------------------------------------------------------
        | Active Participants
        |--------------------------------------------------------------------------
        */

        const activeParticipants = rawParticipants.filter(
            p => !p.hold && !p.retired
        );

        if (activeParticipants.length === 0) {

            console.log(
                "❌ No active scientists found."
            );

            process.exit(0);
        }

        /*
        |--------------------------------------------------------------------------
        | Determine If Schedule Needs Extending
        |--------------------------------------------------------------------------
        */

        const today = new Date();

        let lastScheduledEvent =
            schedule[schedule.length - 1];

        let lastScheduledDate =
            lastScheduledEvent
                ? lastScheduledEvent.date
                : new Date();

        const daysRemaining =
            (lastScheduledDate - today) /
            (1000 * 60 * 60 * 24);

        console.log(
            `📅 Current schedule extends ${Math.round(daysRemaining)} days ahead`
        );

        /*
        |--------------------------------------------------------------------------
        | Auto Generate Additional 4 Months
        |--------------------------------------------------------------------------
        */

        if (daysRemaining < 120) {

            console.log(
                "⚠️ Schedule needs extending..."
            );

            /*
            |--------------------------------------------------------------------------
            | Start Next Monday After Last Event
            |--------------------------------------------------------------------------
            */

            let iterDate = new Date(lastScheduledDate);

            iterDate.setDate(
                iterDate.getDate() + 7
            );

            while (iterDate.getDay() !== 1) {
                iterDate.setDate(
                    iterDate.getDate() + 1
                );
            }

            /*
            |--------------------------------------------------------------------------
            | Generate 4 Months Ahead
            |--------------------------------------------------------------------------
            */

            let endLimit = new Date(iterDate);

            endLimit.setMonth(
                endLimit.getMonth() + 4
            );

            /*
            |--------------------------------------------------------------------------
            | Presentation History
            |--------------------------------------------------------------------------
            */

            let lastPresDateMap = {};

            activeParticipants.forEach(p => {
                lastPresDateMap[p.name] = 0;
            });

            schedule.forEach(s => {

                if (
                    s.type === 'PRES' &&
                    s.presenter &&
                    lastPresDateMap[s.presenter.name] !== undefined
                ) {

                    if (
                        s.date.getTime() >
                        lastPresDateMap[s.presenter.name]
                    ) {

                        lastPresDateMap[
                            s.presenter.name
                        ] = s.date.getTime();
                    }
                }
            });

            /*
            |--------------------------------------------------------------------------
            | Last Group Tracking
            |--------------------------------------------------------------------------
            */

            let lastGroup = "";

            const lastPresEvent =
                [...schedule]
                    .reverse()
                    .find(
                        s =>
                            s.type === 'PRES' &&
                            s.presenter
                    );

            if (lastPresEvent) {
                lastGroup =
                    lastPresEvent.presenter.group;
            }

            /*
            |--------------------------------------------------------------------------
            | Generate Rotation
            |--------------------------------------------------------------------------
            */

            while (iterDate <= endLimit) {

                while (iterDate.getDay() !== 1) {

                    iterDate.setDate(
                        iterDate.getDate() + 1
                    );
                }

                const holiday =
                    getHoliday(iterDate);

                const isFirstMon =
                    iterDate.getDate() <= 7;

                /*
                |--------------------------------------------------------------------------
                | Holiday
                |--------------------------------------------------------------------------
                */

                if (holiday) {

                    schedule.push({
                        date: new Date(iterDate),
                        type: 'HOLIDAY',
                        title: holiday
                    });
                }

                /*
                |--------------------------------------------------------------------------
                | Whole Lab Meeting
                |--------------------------------------------------------------------------
                */

                else if (isFirstMon) {

                    schedule.push({
                        date: new Date(iterDate),
                        type: 'WHOLE',
                        title: 'Whole Lab Update'
                    });
                }

                /*
                |--------------------------------------------------------------------------
                | Presenter Rotation
                |--------------------------------------------------------------------------
                */

                else {

                    let candidates = [
                        ...activeParticipants
                    ];

                    let diffGroupCands =
                        candidates.filter(
                            p =>
                                p.group !==
                                lastGroup
                        );

                    if (
                        diffGroupCands.length > 0
                    ) {
                        candidates =
                            diffGroupCands;
                    }

                    candidates.sort(
                        (a, b) =>
                            lastPresDateMap[a.name] -
                            lastPresDateMap[b.name]
                    );

                    let chosen =
                        candidates[0];

                    schedule.push({
                        date: new Date(iterDate),
                        type: 'PRES',
                        presenter: chosen
                    });

                    lastGroup =
                        chosen.group;

                    lastPresDateMap[
                        chosen.name
                    ] = iterDate.getTime();
                }

                iterDate.setDate(
                    iterDate.getDate() + 7
                );
            }

            /*
            |--------------------------------------------------------------------------
            | Sort Schedule
            |--------------------------------------------------------------------------
            */

            schedule.sort(
                (a, b) => a.date - b.date
            );

            /*
            |--------------------------------------------------------------------------
            | Serialize Dates
            |--------------------------------------------------------------------------
            */

            const serializedSchedule =
                schedule.map(s => ({
                    ...s,
                    date:
                        s.date instanceof Date
                            ? s.date.toISOString()
                            : s.date,

                    endDate:
                        s.endDate instanceof Date
                            ? s.endDate.toISOString()
                            : (
                                s.endDate || null
                            )
                }));

            /*
            |--------------------------------------------------------------------------
            | Debug Logging
            |--------------------------------------------------------------------------
            */

            console.log(
                "📦 Saving events:",
                serializedSchedule.length
            );

            console.log(
                JSON.stringify(
                    serializedSchedule.slice(0, 3),
                    null,
                    2
                )
            );

            /*
            |--------------------------------------------------------------------------
            | Save To Firebase
            |--------------------------------------------------------------------------
            */

            // IMPORTANT FIX:
            // Must save to scheduleState
            await db
                .ref('scheduleState')
                .set(serializedSchedule);

            console.log(
                "✅ Firebase updated successfully."
            );

        } else {

            console.log(
                "✅ Schedule already extends 4 months ahead."
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Notify Upcoming Presenter
        |--------------------------------------------------------------------------
        */

        console.log(
            "🔍 Checking next week's presenters..."
        );

        const upcomingPresentation =
            schedule.find(s => {

                if (
                    s.type !== 'PRES' ||
                    !s.presenter
                ) {
                    return false;
                }

                const diffDays =
                    (s.date - today) /
                    (1000 * 60 * 60 * 24);

                return (
                    diffDays >= 0 &&
                    diffDays <= 8
                );
            });

        if (
            upcomingPresentation &&
            upcomingPresentation.presenter.email
        ) {

            const presenter =
                upcomingPresentation.presenter;

            const presentationDateStr =
                upcomingPresentation.date
                    .toLocaleDateString(
                        'en-US',
                        {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        }
                    );

            console.log(
                `✉️ Sending reminder to ${presenter.name}`
            );

            const mailOptions = {

                from: process.env.EMAIL_USER,

                to: presenter.email,

                subject:
                    `🔔 Upcoming Lab Presentation - ${presentationDateStr}`,

                text:
`Hi ${presenter.name.split(' ')[0]},

This is an automated reminder from the Colgan Lab Calendar.

You are scheduled to present on:

${presentationDateStr}

If you need to swap presentation dates, please use the calendar website.

Best regards,
Colgan Lab Management System`
            };

            await transporter.sendMail(
                mailOptions
            );

            console.log(
                `🚀 Reminder sent to ${presenter.email}`
            );

        } else {

            console.log(
                "ℹ️ No presenter reminder needed."
            );
        }

        console.log(
            "🎉 Automation completed successfully."
        );

        process.exit(0);

    } catch (error) {

        console.error(
            "❌ Automation failure:",
            error
        );

        process.exit(1);
    }
}

runAutomation();
