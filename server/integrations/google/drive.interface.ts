export interface DriveFileResult {
  fileId: string;
  fileName: string;
  webViewLink?: string;
  createdTime: string;
}

export interface IGoogleDriveService {
  isConfigured(): boolean;
  createCommunityFolder(communityName: string): Promise<DriveFileResult>;
  uploadExport(folderId: string, fileName: string, content: Buffer | string, mimeType: string): Promise<DriveFileResult>;
}
