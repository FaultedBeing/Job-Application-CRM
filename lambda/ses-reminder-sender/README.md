# Job CRM — Serverless Email Sender (AWS Lambda)

This Lambda sends reminder emails via **AWS SES** based on due reminders stored in your Supabase database. It runs on a schedule — **no PC required**.

## How It Works

1. EventBridge triggers this Lambda on a cron schedule (e.g., every hour).
2. Lambda reads SES credentials **from your Supabase `settings` table** (configured via the app's Notification Settings page).
3. Lambda queries due reminders from Supabase.
4. Sends emails via AWS SES SMTP.
5. Marks reminders as sent (`sent_at`) to prevent duplicates.

## Prerequisites

- An AWS account with SES enabled in your chosen region.
- A **verified email identity** in SES (the address you send FROM must be verified).
- A Supabase project (already set up via the app's Cloud Setup Wizard).

## Deployment Steps

### 1. Configure SES in the App First
Open the app → Settings → Notifications → **Serverless Email (AWS SES)** and fill in:
- AWS Region (e.g. `us-east-1`)
- AWS SES SMTP Username (from SES → SMTP Settings → Create Credentials)
- AWS SES SMTP Password
- From address (your verified SES email)
- To address (where you want reminders)

These settings sync to Supabase automatically. The Lambda reads them from there.

### 2. Package the Lambda
```bash
cd lambda/ses-reminder-sender
npm install
zip -r ses-reminder-sender.zip index.js node_modules package.json
```

### 3. Create the Lambda in AWS
1. Go to AWS Lambda → Create function.
2. Choose **Author from scratch**.
3. Runtime: **Node.js 18.x** (or later).
4. Upload the ZIP (`ses-reminder-sender.zip`).
5. Handler: `index.handler`.

### 4. Set Environment Variables in Lambda
In the Lambda console → Configuration → Environment variables, add:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Your Supabase **service_role** key (NOT the anon key) |

> ⚠️ Use the `service_role` key so the Lambda can bypass RLS and see all user records.

### 5. Set IAM Permissions
The Lambda needs permission to send emails via SES. Attach this policy to the Lambda's execution role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ses:SendEmail", "ses:SendRawEmail"],
    "Resource": "*"
  }]
}
```

Or simply use the `AmazonSESFullAccess` managed policy.

### 6. Schedule with EventBridge
1. Go to EventBridge → Rules → Create rule.
2. Choose **Schedule**.
3. Cron expression: `0 * * * ? *` (runs every hour on the hour).
4. Target: your Lambda function.
5. Save.

### 7. Test
Manually invoke the Lambda from the console (Test → any JSON payload). Check CloudWatch Logs for `[CRM-Lambda]` output.

## Multi-User Support
The Lambda automatically handles multiple users — each user's SES credentials and reminders are stored separately in Supabase under their `user_id`. No cross-user data sharing.

## Troubleshooting
- **"SES credentials not configured"** → Complete the SES setup in the app first and wait for sync.
- **"Email address not verified"** → Verify the `From` address in AWS SES before using it.
- **SES sandbox mode** → By default AWS SES is in sandbox (can only send to verified addresses). [Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
