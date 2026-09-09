import dotenv from 'dotenv';
dotenv.config();

export const config = {
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  bridgeToken: process.env.NIM_BRIDGE_TOKEN || '',
  defaultModel: process.env.MODEL || 'moonshotai/kimi-k2.6',
  rpmLimit: parseInt(process.env.RPM_LIMIT || '30', 10),
  probeOnStart: process.env.PROBE_ON_START === 'true',
  nvidiaBaseUrl: 'https://integrate.api.nvidia.com/v1',
};
