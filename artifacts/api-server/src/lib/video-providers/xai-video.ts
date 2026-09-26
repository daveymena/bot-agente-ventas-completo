import { writeFile } from "node:fs/promises";
import type { VideoAIInput, VideoAIProvider, VideoAIResult } from "./types";
const BASE_URL="https://api.x.ai/v1";
const apiKey=()=>process.env.XAI_API_KEY?.trim()||null;
const model=()=>process.env.XAI_VIDEO_MODEL?.trim()||"grok-imagine-video-1.5";
const json=async(r:Response)=>{const t=await r.text();try{return JSON.parse(t)}catch{return {message:t}}};
export const xaiVideoProvider:VideoAIProvider={name:"xai",get model(){return model()},isAvailable:()=>!!apiKey(),async generateFromImage(input):Promise<VideoAIResult>{
 const key=apiKey();if(!key)return{ok:false,provider:"xai",model:model(),error:"XAI_API_KEY no está configurada."};
 const start=await fetch(`${BASE_URL}/videos/generations`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify({model:model(),prompt:input.prompt,image:{url:`data:${input.mimeType};base64,${input.image.toString("base64")}`},duration:Math.max(5,Math.min(15,Math.round(input.durationSeconds||6))),aspect_ratio:input.aspectRatio||"9:16",resolution:input.resolution||"720p"}),signal:AbortSignal.timeout(Number(process.env.VIDEO_AI_HTTP_TIMEOUT_MS||90000))});
 if(!start.ok){const e=await json(start);return{ok:false,provider:"xai",model:model(),error:`xAI ${start.status}: ${String(e?.error?.message||e?.message||"error")}`};}
 const requestId=String((await start.json() as any)?.request_id||"");if(!requestId)return{ok:false,provider:"xai",model:model(),error:"xAI no devolvió request_id."};
 const deadline=Date.now()+Number(process.env.VIDEO_AI_TIMEOUT_MS||600000);
 while(Date.now()<deadline){await new Promise(r=>setTimeout(r,Number(process.env.VIDEO_AI_POLL_INTERVAL_MS||5000)));
  const s=await fetch(`${BASE_URL}/videos/${encodeURIComponent(requestId)}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(Number(process.env.VIDEO_AI_HTTP_TIMEOUT_MS||90000))});const d=await json(s);
  if(!s.ok)return{ok:false,provider:"xai",model:model(),error:`xAI no pudo consultar la generación (${s.status}).`};
  if(d.status==="failed"||d.status==="expired")return{ok:false,provider:"xai",model:model(),error:`xAI terminó en estado ${d.status}.`};
  if(d.status==="done"){const url=String(d?.video?.url||"");if(!url)return{ok:false,provider:"xai",model:model(),error:"xAI terminó sin URL de video."};const vr=await fetch(url,{signal:AbortSignal.timeout(Number(process.env.VIDEO_AI_DOWNLOAD_TIMEOUT_MS||180000))});if(!vr.ok)return{ok:false,provider:"xai",model:model(),error:`No se pudo descargar el video de xAI (${vr.status}).`};const buf=Buffer.from(await vr.arrayBuffer());if(buf.byteLength>Number(process.env.VIDEO_AI_MAX_DOWNLOAD_BYTES||300000000))return{ok:false,provider:"xai",model:model(),error:"El video supera el límite configurado."};await writeFile(input.outputPath,buf);return{ok:true,localPath:input.outputPath,provider:"xai",model:model(),duration:Number(d?.video?.duration||input.durationSeconds||6)};}
 }
 return{ok:false,provider:"xai",model:model(),error:"xAI superó el tiempo máximo configurado."};
}};
