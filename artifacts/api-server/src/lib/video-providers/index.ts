import { googleVeoProvider } from "./google-veo";
import { xaiVideoProvider } from "./xai-video";
import type { VideoAIProvider,VideoAIProviderName,VideoAIProviderSelection } from "./types";
export type { VideoAIProvider,VideoAIProviderName,VideoAIProviderSelection } from "./types";
const PROVIDERS:Record<VideoAIProviderName,VideoAIProvider>={xai:xaiVideoProvider,google:googleVeoProvider};
export const getAvailableVideoAIProviders=()=>Object.values(PROVIDERS).filter(p=>p.isAvailable());
export const selectVideoAIProviders=(selection:VideoAIProviderSelection="auto")=>{if(selection!=="auto"){const p=PROVIDERS[selection];return p?.isAvailable()?[p]:[]}const configured=(process.env.VIDEO_AI_PROVIDER||"auto").trim().toLowerCase();if(configured==="xai"||configured==="google"){const p=PROVIDERS[configured];return p?.isAvailable()?[p]:[]}return getAvailableVideoAIProviders()};
export const videoAIStatus=()=>Object.values(PROVIDERS).map(p=>({provider:p.name,model:p.model,available:p.isAvailable()}));
