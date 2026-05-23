const admin = require('firebase-admin');

const {
    getDatabase
} = require('firebase-admin/database');

const nodemailer =
    require('nodemailer');

/*
|--------------------------------------------------------------------------
| Firebase Admin Setup
|--------------------------------------------------------------------------
*/

const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({

    credential:
        admin.credential.cert(serviceAccount),

    databaseURL:
        process.env.FIREBASE_DATABASE_URL
});

const db =
    getDatabase();

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
            await db.ref('pendingEmails').get();

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

            /*
            |--------------------------------------------------------------------------
            | Only Send Approved + Unsent + Non-Denied Emails
            |--------------------------------------------------------------------------
            */

            if (
                email.approved === true &&
                email.denied !== true &&
                email.sent !== true
            ) {

                /*
                |--------------------------------------------------------------------------
                | Handle Different Email Schemas
                |--------------------------------------------------------------------------
                */

                const recipient =
                    email.presenterEmail || email.email;

                if (!recipient) {

                    console.log(
                        `⚠️ Skipping email ${id} — no recipient`
                    );

                    continue;
                }

                console.log(
                    `📨 Sending email to ${recipient}`
                );

                /*
                |--------------------------------------------------------------------------
                | Send Email
                |--------------------------------------------------------------------------
                */

                await transporter.sendMail({

                    from:
                        process.env.GMAIL_USER,

                    to:
                        recipient,

                    subject:
                        email.subject,

                    text:
                        email.body
                });

                /*
                |--------------------------------------------------------------------------
                | Mark Email As Sent
                |--------------------------------------------------------------------------
                */

                await db.ref(`pendingEmails/${id}`).update({

                    sent: true,

                    sentAt:
                        new Date().toISOString()
                });

                console.log(
                    `✅ Sent email to ${recipient}`
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
