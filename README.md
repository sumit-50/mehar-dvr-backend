# Mehar DVR — Backend REST API Service

Production REST API for **Mehar Advisory Daily Visit Reports (DVR)** system.

## 🚀 Technologies
- **Runtime:** Node.js (v20+) with TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL (with `pg` connection pool)
- **Authentication:** JWT & bcryptjs password hashing
- **External Integrations:**
  - **SMS OTP:** Zectagon SMS API (`MEHRPL`)
  - **Email OTP / Notifications:** Brevo (Sendinblue) API
  - **Geocoding & Places:** Amazon Location Service

## 📦 Environment Variables
Create a `.env` file in the root of the backend folder:
```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgres://MeharDvr:Mehar%40dvr@187.77.187.120:5321/meh
JWT_SECRET=mehar_dvr_super_secure_jwt_secret_2026
ZECTAGON_API_KEY=your_zectagon_sms_api_key
SMS_SENDER_ID=MEHRPL
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM=no-reply@meharadvisory.com
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_LOCATION_PLACE_INDEX=MeharDVRPlaceIndex
```

## 🛠️ Running Locally
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build production bundle
npm run build

# Start production server
npm start
```
