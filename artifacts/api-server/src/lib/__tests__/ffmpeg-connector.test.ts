import { describe, it, expect } from "vitest";
import { runSeguro, hayFfmpegSeguro } from "../ffmpeg-connector";

describe("ffmpeg-connector seguro", ()=>{
  it("rechaza bin no permitido", async()=>{
    await expect(runSeguro("curl" as any, ["--version"])).rejects.toThrow(/no permitido/i);
  });
  it("hayFfmpegSeguro no revienta sin binario", async()=>{
    const hay = await hayFfmpegSeguro();
    expect(typeof hay).toBe("boolean");
  });
});
