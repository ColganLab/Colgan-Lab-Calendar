const { initializeApp } = require('firebase/app');

const {
    getDatabase,
    ref,
    get,
    set
} = require('firebase/database');

/*
|--------------------------------------------------------------------------
| Firebase Configuration
|--------------------------------------------------------------------------
*/

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
};

/*
|--------------------------------------------------------------------------
| Initialize Firebase
|--------------------------------------------------------------------------
*/

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);

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
| Pending Email Creation
|--------------------------------------------------------------------------
*/

async function createPendingEmail(emailData) {

    const snapshot = await get(
        ref(db, 'pendingEmails')
    );

    const existing =
        snapshot.val() || {};

    /*
    |--------------------------------------------------------------------------
    | Prevent Duplicate Pending Emails
    |--------------------------------------------------------------------------
    */

    const alreadyExists =
        Object.values(existing).some(e => {

            return (
                e.type === emailData.type &&
                e.presenter === emailData.presenter &&
                e.presentationDate === emailData.presentationDate &&
                e.sent !== true
            );
        });

    if (alreadyExists) {

        console.log(
            `⏭️ Pending email already exists for ${emailData.presenter}`
        );

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | Create New Pending Email
    |--------------------------------------------------------------------------
    */

    const emailId =
        Date.now().toString() +
        Math.random().toString(36).substring(2, 8);

    await set(
        ref(db, `pendingEmails/${emailId}`),
        {
            ...emailData,
            approved: false,
            sent: false,
            createdAt: new Date().toISOString()
        }
    );

    console.log(
        `📬 Created pending email for ${emailData.presenter}`
    );
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

        const snapshot = await get(ref(db));

        const data = snapshot.val() || {};

        const rawParticipants =
            data.participants
                ? Object.values(data.participants)
                : [];

        /*
        |--------------------------------------------------------------------------
        | IMPORTANT:
        | Frontend uses scheduleState
        |--------------------------------------------------------------------------
        */

        let rawSchedule =
            data.scheduleState || [];

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

        const activeParticipants =
            rawParticipants.filter(
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
        | Determine Current Schedule Length
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
        | Generate More Schedule If Needed
        |--------------------------------------------------------------------------
        */

        if (daysRemaining < 120) {

            console.log(
                "⚠️ Schedule needs extending..."
            );

            /*
            |--------------------------------------------------------------------------
            | Start Next Monday
            |--------------------------------------------------------------------------
            */

            let iterDate =
                new Date(lastScheduledDate);

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

            let endLimit =
                new Date(iterDate);

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
            | Rotation Generation
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

                    const newPresentationEvent = {

                        id:
                            Date.now().toString() +
                            Math.random().toString(36).substring(2, 8),

                        date: new Date(iterDate),

                        type: 'PRES',

                        presenter: chosen,

                        assignmentEmailSent: false,

                        reminderEmailSent: false
                    };

                    schedule.push(
                        newPresentationEvent
                    );

                    /*
                    |--------------------------------------------------------------------------
                    | Create Pending Assignment Email
                    |--------------------------------------------------------------------------
                    */

                    if (chosen.email) {

                        await createPendingEmail({

                            type: 'ASSIGNED',

                            presenter: chosen.name,

                            email: chosen.email,

                            presentationDate:
                                newPresentationEvent.date.toISOString(),

                            subject:
                                '🧪 You Have Been Scheduled to Present',

                            body:
`Hi ${chosen.name.split(' ')[0]},

You have been scheduled to present at the Colgan Lab meeting on:

${newPresentationEvent.date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
})}

Best regards,
Colgan Lab Calendar`
                        });
                    }

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
            | Create 2 Week Reminder Emails
            |--------------------------------------------------------------------------
            */

            for (const event of schedule) {

                if (
                    event.type === 'PRES' &&
                    event.presenter &&
                    event.presenter.email
                ) {

                    const diffDays =
                        Math.round(
                            (
                                new Date(event.date) - new Date()
                            ) /
                            (1000 * 60 * 60 * 24)
                        );

                    if (
                        diffDays >= 13 &&
                        diffDays <= 14 &&
                        !event.reminderEmailSent
                    ) {

                        await createPendingEmail({

                            type: 'REMINDER',

                            presenter:
                                event.presenter.name,

                            email:
                                event.presenter.email,

                            presentationDate:
                                new Date(event.date)
                                    .toISOString(),

                            subject:
                                '🔔 Reminder: Presentation in 2 Weeks',

                            body:
`Hi ${event.presenter.name.split(' ')[0]},

This is your reminder that you are scheduled to present at the Colgan Lab meeting on:

${new Date(event.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
})}

Best regards,
Colgan Lab Calendar`
                        });

                        event.reminderEmailSent = true;
                    }
                }
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

            await set(
                ref(db, 'scheduleState'),
                serializedSchedule
            );

            console.log(
                "✅ Firebase updated successfully."
            );

        } else {

            console.log(
                "✅ Schedule already extends 4 months ahead."
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
