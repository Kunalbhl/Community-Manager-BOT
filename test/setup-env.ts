process.env.DEV_SIMULATION_ENABLED = 'true';
process.env.APP_RUNTIME_MODE = 'DEVELOPMENT_SIMULATION';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
delete process.env.GOOGLE_CLOUD_PROJECT_ID;
delete process.env.GOOGLE_CLOUD_PROJECT;
delete process.env.GCP_PROJECT;
delete process.env.GCLOUD_PROJECT;
