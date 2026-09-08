# 🚀 Coolify Deployment Guide — Mehar DVR

This guide walks you through deploying **Mehar DVR** on [Coolify](https://coolify.io).

---

## 🌟 Port Numbers for Coolify

| Service | Technology | Port to set in Coolify |
| :--- | :--- | :--- |
| **Backend API** | Node.js Express REST API | **`5000`** |
| **Frontend App** | TanStack React Start SSR | **`3000`** |

---

## 📦 Deploying as Separate Repositories

### 1. Deploy Backend (`mehar-dvr-backend`)
1. In Coolify: **+ New Resource** → **Public/Private Repository** → `https://github.com/sumit-50/mehar-dvr-backend`.
2. Set:
   - **Build Pack:** `Dockerfile`
   - **Exposed Port:** `5000`
   - **Domains:** `https://api.dvr.yourdomain.com`
3. Set Environment Variables:
   ```env
   NODE_ENV=production
   PORT=5000
   DATABASE_URL=postgres://MeharDvr:Mehar%40dvr@187.77.187.120:5321/meh
   JWT_SECRET=your_production_jwt_secret_key
   ZECTAGON_API_KEY=your_sms_key
   SMS_SENDER_ID=MEHRPL
   BREVO_API_KEY=your_brevo_key
   EMAIL_FROM=no-reply@meharadvisory.com
   AWS_REGION=ap-south-1
   AWS_ACCESS_KEY_ID=your_aws_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret
   AWS_LOCATION_PLACE_INDEX=MeharDVRPlaceIndex
   ```
4. Click **Deploy**.

---

### 2. Deploy Frontend (`mehar-dvr-frontend`)
1. In Coolify: **+ New Resource** → **Public/Private Repository** → `https://github.com/sumit-50/mehar-dvr-frontend`.
2. Set:
   - **Build Pack:** `Dockerfile`
   - **Exposed Port:** `3000`
   - **Domains:** `https://dvr.yourdomain.com`
3. Under **Build Time Arguments** / **Environment Variables**:
   ```env
   VITE_API_URL=https://api.dvr.yourdomain.com/api
   ```
4. Click **Deploy**.
