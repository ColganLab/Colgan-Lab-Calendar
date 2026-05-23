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

            if (
                email.approved === true &&
                email.sent !== true
            ) {

                console.log(
                    `📨 Sending email to ${email.presenterEmail}`
                );

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

                await db.ref(`pendingEmails/${id}`).update({

                    sent: true,

                    sentAt:
                        new Date().toISOString()
                });

                console.log(
                    `✅ Sent email to ${email.presenterEmail}`
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
