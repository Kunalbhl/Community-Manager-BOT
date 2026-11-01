#!/usr/bin/env bash
# One-time: let GitHub Actions (only this repo, only main) deploy the website to Cloud Run.
# Keyless (Workload Identity Federation): no service-account keys or passwords are created.
# Safe to re-run. Run in Google Cloud Shell.
set -euo pipefail
P=community-manager-bot-508316
REPO=Kunalbhl/Community-Manager-BOT
SA=github-deployer
POOL=github
PROV=github-actions
gcloud config set project $P >/dev/null
PN=$(gcloud projects describe $P --format='value(projectNumber)')
echo "==> Enabling APIs"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com >/dev/null
echo "==> Deploy identity"
gcloud iam service-accounts describe $SA@$P.iam.gserviceaccount.com >/dev/null 2>&1 || \
  gcloud iam service-accounts create $SA --display-name="GitHub deploy (Community Manager)" >/dev/null
for R in roles/cloudbuild.builds.editor roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer roles/storage.admin roles/serviceusage.serviceUsageConsumer roles/logging.viewer; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$SA@$P.iam.gserviceaccount.com --role=$R --condition=None >/dev/null
done
# Cloud Build's own account must be able to deploy to Cloud Run.
CB=$PN@cloudbuild.gserviceaccount.com
for R in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.admin roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$CB --role=$R --condition=None >/dev/null 2>&1 || true
done
CE=$PN-compute@developer.gserviceaccount.com
for R in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.admin roles/logging.logWriter roles/storage.admin; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$CE --role=$R --condition=None >/dev/null 2>&1 || true
done
echo "==> Image storage"
gcloud artifacts repositories describe cloud-run-source-deploy --location=asia-southeast1 >/dev/null 2>&1 || \
  gcloud artifacts repositories create cloud-run-source-deploy --repository-format=docker --location=asia-southeast1 >/dev/null
echo "==> Trust GitHub (this repo only)"
gcloud iam workload-identity-pools describe $POOL --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create $POOL --location=global --display-name="GitHub" >/dev/null
gcloud iam workload-identity-pools providers describe $PROV --location=global --workload-identity-pool=$POOL >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc $PROV --location=global --workload-identity-pool=$POOL \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref \
    --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'" >/dev/null
gcloud iam service-accounts add-iam-policy-binding $SA@$P.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" >/dev/null
echo
echo "GITHUB_DEPLOY_READY projectNumber=$PN"
