#!/bin/bash
set -e

PROJECT="community-manager-bot-508316"
REGION="asia-southeast1"
SERVICE="community-manager"
IMAGE="asia-southeast1-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/community-manager:latest"
REDIRECT_URI="https://community-manager-bot-720940628402.asia-southeast1.run.app/api/v1/auth/callback"
APP_URL="https://community-manager-bot-720940628402.asia-southeast1.run.app"

echo "====== Step 1: Build & push image via Cloud Build ======"
gcloud builds submit \
  --tag="${IMAGE}" \
  --project="${PROJECT}"

echo "====== Step 2: Delete old service to clear locked annotations ======"
gcloud run services delete "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --quiet 2>/dev/null || echo "Service not found or already deleted — continuing."

echo "====== Step 3: Deploy fresh service ======"
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --service-account="720940628402-compute@developer.gserviceaccount.com" \
  --set-secrets="DISCORD_BOT_TOKEN=DISCORD_BOT_TOKEN:latest,DISCORD_CLIENT_SECRET=DISCORD_CLIENT_SECRET:latest,SESSION_SECRET=SESSION_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="APP_RUNTIME_MODE=PRODUCTION,NODE_ENV=production,PORT=3000,GOOGLE_CLOUD_PROJECT_ID=${PROJECT},GOOGLE_CLOUD_REGION=${REGION},FIRESTORE_DATABASE_ID=ai-studio-communitymanager-59f17f1d-8b74-490e-9248-bc41e69de7ef,DISCORD_CLIENT_ID=1547515985416822884,DISCORD_APPLICATION_ID=1547515985416822884,DISCORD_PUBLIC_KEY=522efd135b52e2b8e56ad6d7bebd2b787e5e78584301d4a69368ef5d98d3717f,DISCORD_REDIRECT_URI=${REDIRECT_URI},APP_URL=${APP_URL},VITE_DISCORD_CLIENT_ID=1547515985416822884,PLATFORM_OWNER_EMAIL=kunalpareekusa@gmail.com,PLATFORM_OWNER_USER_ID=436486741080408064,FREE_MODE=true,MAX_AI_REQUESTS_PER_DAY=100,MAX_APPLICATIONS_PER_DAY=50" \
  --project="${PROJECT}"

echo ""
echo "====== Deployment complete! ======"
echo "Service URL: ${APP_URL}"
echo ""
echo "====== Step 4: Health check ======"
sleep 5
curl -sf "${APP_URL}/health/live" && echo "Health check PASSED" || echo "Health check failed — check logs below"

echo ""
echo "====== Step 5: Live logs (Ctrl+C to stop) ======"
gcloud run services logs read "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --limit=50
