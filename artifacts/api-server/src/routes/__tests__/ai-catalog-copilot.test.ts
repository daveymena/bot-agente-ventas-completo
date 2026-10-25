import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@workspace/integrations-openai-ai-server',async importOriginal=>({...(await importOriginal<any>()),createAIClient:vi.fn()}));
vi.mock('../../lib/copilot',async importOriginal=>({...(await importOriginal<any>()),getCopilotSessionToken:vi.fn()}));
import { createAIClient } from '@workspace/integrations-openai-ai-server';
import { getCopilotSessionToken } from '../../lib/copilot';
import { db, settings } from '@workspace/db';
import router from '../ai-catalog';
import settingsRouter from '../settings';
import { preferenciaModeloAtlas } from '../../lib/preferencia-modelo-atlas';

async function llamar(method:string,path:string,body:any={}) {
  const capa=(router as any).stack.find((s:any)=>s.route?.path===path && s.route.methods[method]);
  let status=200;let data:any;
  const res:any={status(n:number){status=n;return this;},json(d:any){data=d;return this;}};
  await capa.route.stack[0].handle({tenant:{id:1,isAdmin:true},params:{proveedor:'github'},body},res,(e:any)=>{if(e)throw e;});
  return {status,data};
}
beforeEach(async()=>{await db.delete(settings);});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('catálogo de configuración de GitHub',()=>{
  it('probar usa la cuenta recién conectada, no un token antiguo del entorno',async()=>{
    await db.insert(settings).values({aiProvider:'github_copilot_internal',githubModel:'modelo-elegido',githubToken:'oauth-nuevo-prueba'});
    vi.stubEnv('GITHUB_COPILOT_TOKEN','oauth-viejo-prueba');
    vi.mocked(getCopilotSessionToken).mockResolvedValue({token:'session-prueba',expiresAt:Date.now()/1000+1800,refreshIn:1800});
    vi.mocked(createAIClient).mockReturnValue({chat:{completions:{create:vi.fn().mockResolvedValue({choices:[{message:{content:'OK'}}]})}}} as any);
    const {data}=await llamar('post','/test',{proveedor:'github_copilot_internal',model:'modelo-elegido'});
    expect(data.ok).toBe(true);
    expect(getCopilotSessionToken).toHaveBeenCalledWith('oauth-nuevo-prueba');
    expect(createAIClient).toHaveBeenCalledWith(expect.objectContaining({apiKey:'session-prueba',model:'modelo-elegido'}));
  });
  it('guardar desde el panel histórico actualiza el modelo que reciben el catálogo y Atlas',async()=>{
    await db.insert(settings).values({aiProvider:'deepseek',githubModel:'anterior'});
    const capa=(settingsRouter as any).stack.find((s:any)=>s.route?.path==='/' && s.route.methods.patch);
    let respuesta:any;
    const res:any={json(d:any){respuesta=d;return this;},status(){return this;}};
    await capa.route.stack.at(-1).handle({body:{aiProvider:'github_copilot_internal',githubModel:' modelo-elegido '}},res,(e:any)=>{if(e)throw e;});
    expect(respuesta.githubModel).toBe('modelo-elegido');
    expect((await llamar('get','/catalog')).data.activaModelo).toBe('modelo-elegido');
    const [fila]=await db.select().from(settings).limit(1);
    expect(preferenciaModeloAtlas(fila)).toEqual({providerID:'github-copilot',modelID:'modelo-elegido'});
  });
  it('al recargar conserva el modelo de Copilot y no devuelve sus credenciales',async()=>{
    await db.insert(settings).values({aiProvider:'github_copilot_internal',githubModel:'modelo-guardado',githubToken:'oauth-solo-prueba',businessConfig:{aiProviders:{github_copilot_internal:{model:'modelo-viejo'}}}});
    const {data}=await llamar('get','/catalog');
    expect(data.activaModelo).toBe('modelo-guardado');
    expect(data.proveedores.find((p:any)=>p.id==='github_copilot_internal')).toMatchObject({modeloElegido:'modelo-guardado',tieneClave:true});
    expect(data.proveedores.find((p:any)=>p.id==='github').retirado).toBe(true);
    expect(JSON.stringify(data)).not.toContain('oauth-solo-prueba');
  });
  it.each([['get','/models/:proveedor'],['put','/provider'],['put','/active'],['post','/test']])('no intenta reactivar GitHub Models mediante %s %s',async(method,path)=>{
    const {status,data}=await llamar(method,path,{proveedor:'github',model:'cualquiera'});
    expect(status).toBe(410);expect(data.error).toContain('retirado');
  });
});
