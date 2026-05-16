const firebase = require('firebase/app');
require('firebase/database');
const nodemailer = require('nodemailer');

// 1. Firebase Configuration (Matches your Colgan Lab app)
const firebaseConfig = {
    apiKey: "AIzaSyBzPqdfIkuDknOw91epsBvvHjGx6Saf6I4",
    authDomain: "colgan-lab-calendar-efb7a.firebaseapp.com",
    databaseURL: "https://colgan-lab-calendar-efb7a-default-rtdb.firebaseio.com",
    projectId: "colgan-lab-calendar-efb7a",
    storageBucket: "colgan-lab-calendar-efb7a.firebasestorage.app",
    messagingSenderId: "671642193278",
    appId: "1:671642193278:web:17fd43b883840c3091772f",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 2. Email Transporter Configuration (Uses environment variables for security)
const transporter = nodemailer.createTransport({
    service: 'gmail', // You can change this to your institutional SMTP server if needed
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  // Uses an App Password, NOT your regular password
    }
});

// Helper: Calculate standard laboratory holidays
function getHoliday(date) {
    const d = date.getDate();
    const m = date.getMonth(); // 0-indexed
    const day = date.getDay(); // 0 = Sunday, 1 = Monday
    
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

// Main Automation Function
async function runAutomation() {
    try {
        console.log("📥 Fetching lab metadata from Firebase...");
        
        // Fetch current participants and existing schedule from Firebase
        const snapshot = await db.ref().get();
        const data = snapshot.val() || {};
        
        let rawParticipants = data.participants ? Object.values(data.participants) : [];
        let rawSchedule = data.schedule || [];

        // Parse dates out of raw schedule data
        let schedule = rawSchedule.map(s => ({
            ...s,
            date: new Date(s.date),
            endDate: s.endDate ? new Date(s.endDate) : null
        })).sort((a, b) => a.date - b.date);

        const activeParticipants = rawParticipants.filter(p => !p.hold && !p.retired);
        
        if (activeParticipants.length === 0) {
            console.log("❌ No active scientists found in the directory. Exiting.");
            process.exit(0);
        }

        // --- FEATURE 1: AUTO-EXTEND SCHEDULE IF RUNNING LOW ---
        const today = new Date();
        let lastScheduledEvent = schedule[schedule.length - 1];
        let lastScheduledDate = lastScheduledEvent ? lastScheduledEvent.date : new Date();

        // Check if schedule runs out within the next 30 days
        const daysRemaining = (lastScheduledDate - today) / (1000 * 60 * 60 * 24);
        
        if (daysRemaining < 30) {
            console.log(`⚠️ Schedule is running low (${Math.round(daysRemaining)} days left). Auto-extending schedule...`);
            
            let iterDate = new Date(lastScheduledDate);
            iterDate.setDate(iterDate.getDate() + 7); // Start on the Monday after the last event
            
            // Generate a fresh 4-month chunk of scheduling automatically
            let endLimit = new Date(iterDate);
            endLimit.setMonth(endLimit.getMonth() + 4);

            // Establish historical map of who presented last to preserve balancing metrics
            let lastPresDateMap = {};
            activeParticipants.forEach(p => { lastPresDateMap[p.name] = 0; });
            schedule.forEach(s => {
                if (s.type === 'PRES' && s.presenter && lastPresDateMap[s.presenter.name] !== undefined) {
                    if (s.date.getTime() > lastPresDateMap[s.presenter.name]) {
                        lastPresDateMap[s.presenter.name] = s.date.getTime();
                    }
                }
            });

            let lastGroup = "";
            const lastPresEvent = [...schedule].reverse().find(s => s.type === 'PRES' && s.presenter);
            if (lastPresEvent) lastGroup = lastPresEvent.presenter.group;

            while (iterDate <= endLimit) {
                // Ensure we are targeted precisely on a Monday
                while(iterDate.getDay() !== 1) {
                    iterDate.setDate(iterDate.getDate() + 1);
                }

                const holiday = getHoliday(iterDate);
                const isFirstMon = iterDate.getDate() <= 7;

                if (holiday) {
                    schedule.push({
                        date: new Date(iterDate),
                        type: 'HOLIDAY',
                        title: holiday
                    });
                } else if (isFirstMon) {
                    schedule.push({
                        date: new Date(iterDate),
                        type: 'WHOLE',
                        title: 'Whole Lab Update'
                    });
                } else {
                    // Match the precise HTML group-alternating rotation algorithm
                    let candidates = [...activeParticipants];
                    let diffGroupCands = candidates.filter(p => p.group !== lastGroup);
                    if (diffGroupCands.length > 0) candidates = diffGroupCands;
                    
                    candidates.sort((a, b) => lastPresDateMap[a.name] - lastPresDateMap[b.name]);
                    let chosen = candidates[0];

                    schedule.push({
                        date: new Date(iterDate),
                        type: 'PRES',
                        presenter: chosen
                    });
                    
                    lastGroup = chosen.group;
                    lastPresDateMap[chosen.name] = iterDate.getTime();
                }
                iterDate.setDate(iterDate.getDate() + 7); // Advance 1 week
            }

            // Convert JavaScript date objects back into compliant ISO strings for database stability
            const serializedSchedule = schedule.map(s => ({
                ...s,
                date: s.date.toISOString(),
                endDate: s.endDate ? s.endDate.toISOString() : null
            }));

            await db.ref('scheduleState').set(serializedSchedule);
            console.log("✅ Database expanded with new presentations successfully.");
        } else {
            console.log(`📅 Schedule healthy. (${Math.round(daysRemaining)} days planned out ahead)`);
        }

        // --- FEATURE 2: AUTO-NOTIFY UPCOMING PRESENTERS ---
        console.log("🔍 Checking upcoming assignments for next week...");
        
        // Define a 7-day target window to find who is presenting next week
        const targetReminderDate = new Date();
        targetReminderDate.setDate(targetReminderDate.getDate() + 7);
        
        const upcomingPresentation = schedule.find(s => {
            if (s.type !== 'PRES' || !s.presenter) return false;
            const diffTime = s.date - today;
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays <= 8; // Presenting within the upcoming week
        });

        if (upcomingPresentation && upcomingPresentation.presenter.email) {
            const presenter = upcomingPresentation.presenter;
            const presentationDateStr = upcomingPresentation.date.toLocaleDateString('en-US', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            });

            console.log(`✉️ Found upcoming presenter: ${presenter.name}. Preparing email notice...`);

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: presenter.email,
                subject: `🔔 Automated Notification: Lab Meeting Presentation on ${presentationDateStr}`,
                text: `Hi ${presenter.name.split(' ')[0]},\n\nThis is an automated notification from the Colgan Lab Calendar to let you know that you are scheduled to give your presentation on ${presentationDateStr}.\n\nIf you have an immediate scheduling conflict, please use the website interface to swap slots with another team member.\n\nBest regards,\nColgan Lab Management System`
            };

            await transporter.sendMail(mailOptions);
            console.log(`🚀 Automated alert email dispatched successfully to ${presenter.email}`);
        } else {
            console.log("ℹ️ No regular individual presenter scheduled for next week (or no email configured).");
        }

        console.log("🎉 Automation cycle complete.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Critical Automation Failure:", error);
        process.exit(1);
    }
}

runAutomation();
