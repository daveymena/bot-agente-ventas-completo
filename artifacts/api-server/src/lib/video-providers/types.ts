export type VideoAIProviderName = "xai" | "google";
export type VideoAIProviderSelection = VideoAIProviderName | "auto";
export interface VideoAIInput { image: Buffer; mimeType: string; prompt: string; durationSeconds?: number; aspectRatio?: "9:16"|"16:9"|"1:1"; resolution?: "720p"|"1080p"; outputPath: string; }
export interface VideoAIResult { ok:boolean; localPath?:string; provider?:VideoAIProviderName; model?:string; duration?:number; error?:string; }
export interface VideoAIProvider { name:VideoAIProviderName; readonly model:string; isAvailable():boolean; generateFromImage(input:VideoAIInput):Promise<VideoAIResult>; }
