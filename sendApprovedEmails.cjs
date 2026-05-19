
const { initializeApp } = require('firebase/app');

const {
    getDatabase,
    ref,
    get,
    update
} = require('firebase/database');

const nodemailer =
    require('nodemailer');

/*
|--------------------------------------------------------------------------
| Firebase Config
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

const app =
    initializeApp(firebaseConfig);

const db =
    getDatabase(app);

/*
|--------------------------------------------------------------------------
| Gmail Transporter
|--------------------------------------------------------------------------
*/

const transporter =
    nodemailer.createTransport({

        service: 'gmail',

        auth: {

            user:
                process.env.GMAIL_USER,

            pass:
                process.env.GMAIL_APP_PASSWORD
        }
    });

/*
|--------------------------------------------------------------------------
| Send Approved Emails
|--------------------------------------------------------------------------
*/

async function sendApprovedEmails() {

    try {

        console.log(
            '📥 Checking pending emails...'
        );

        const snapshot =
            await get(
                ref(db, 'pendingEmails')
            );

        const emails =
            snapshot.val() || {};

        console.log(
            `📦 Found ${Object.keys(emails).length} total emails`
        );

        for (const [id, email] of Object.entries(emails)) {

            console.log(
                `🔍 Checking email ${id}`
            );

            console.log(email);

            if (
                email.approved === true &&
                email.sent !== true
            ) {

                console.log(
                    `📨 Sending email to ${email.email}`
                );

                console.log('Recipient field:', email.presenterEmail);
                
                await transporter.sendMail({

                    from:
                        process.env.GMAIL_USER,

                    to:
                        email.presenterEmail,

                    subject:
                        email.subject,

                    text:
                        email.body
                });

                await update(
                    ref(db, `pendingEmails/${id}`),
                    {
                        sent: true,
                        sentAt:
                            new Date().toISOString()
                    }
                );

                console.log(
                    `✅ Sent email to ${email.presenter}`
                );
            }
        }

        console.log(
            '🎉 Email processing complete.'
        );

        process.exit(0);

    } catch (error) {

        console.error(
            '❌ Email sender failure:',
            error
        );

        process.exit(1);
    }
}

sendApprovedEmails();
