import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../copilot', () => ({ getCopilotSessionToken: vi.fn() }));
import { getCopilotSessionToken } from '../copilot';
import { catalogoDeCopilot, modelosDeCopilot, tokensCopilotGuardados, modelosCopilotEnAtlas } from '../copilot-modelos';
import { preferenciaModeloAtlas, copilotElegido } from '../preferencia-modelo-atlas';
import { estadoCopilot } from '../../../../ventas-pro/src/lib/estado-copilot';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe('selección real de modelos de Copilot', () => {
  it('una cuenta sin selector conserva los modelos informativos y distingue Auto de un catálogo vacío',async()=>{
    vi.mocked(getCopilotSessionToken).mockResolvedValue({token:'session-test',expiresAt:Date.now()/1000+1800,refreshIn:1800});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[
      {id:'gpt-4o',model_picker_enabled:false,capabilities:{type:'chat'}},
      {id:'premium-bloqueado',model_picker_enabled:false,policy:{state:'disabled'}},
    ]})}));
    expect(await catalogoDeCopilot('oauth-test')).toEqual({modelos:[],automaticos:['gpt-4o'],bloqueados:['premium-bloqueado'],soloAuto:true});
  });
  it('no adivina un plan Free cuando GitHub devuelve un catálogo vacío',async()=>{
    vi.mocked(getCopilotSessionToken).mockResolvedValue({token:'session-test',expiresAt:Date.now()/1000+1800,refreshIn:1800});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[]})}));
    expect((await catalogoDeCopilot('oauth-test')).soloAuto).toBe(false);
  });
  it('un token guardado no desaparece al recargar ni por vencer la sesión corta', () => {
    expect(estadoCopilot({hasGithubToken:true,hasCopilotSessionToken:true,copilotSessionExpiresAt:'2000-01-01'})).toMatchObject({guardado:true,vigente:false});
    expect(estadoCopilot({hasGithubToken:true}).etiqueta).toContain('guardado');
    expect(estadoCopilot({}).guardado).toBe(false);
  });
  it('reutiliza las credenciales existentes, sin duplicarlas ni perder las cuentas de respaldo', () => {
    expect(tokensCopilotGuardados({githubToken:'principal',copilotTokens:[{token:'otra'}]}, {GITHUB_TOKEN:'principal',GITHUB_COPILOT_TOKEN:'entorno',COPILOT_TOKENS:'["respaldo"]'})).toEqual(['principal','entorno','otra','respaldo']);
  });
  it('si la credencial principal no renueva intenta otra ya configurada', async () => {
    vi.mocked(getCopilotSessionToken).mockResolvedValueOnce(null).mockResolvedValueOnce({token:'session-test',expiresAt:Date.now()/1000+1800,refreshIn:1800});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[{id:'modelo-real'}]})}));
    expect(await modelosDeCopilot(['principal-anterior','respaldo-existente'])).toEqual(['modelo-real']);
  });
  it('reconoce la autenticación guardada en Atlas sin exponer sus credenciales',async()=>{
    vi.stubEnv('ATLAS_OPENCODE_HOST','https://atlas.test');vi.stubEnv('ATLAS_OPENCODE_USER','user-test');vi.stubEnv('ATLAS_OPENCODE_PASS','secret-test');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:['github-copilot'],all:[{id:'github-copilot',models:{'modelo-disponible':{}}}]})}));
    expect(await modelosCopilotEnAtlas()).toEqual(['modelo-disponible']);
  });
  it('un catálogo estático de Atlas no demuestra que Copilot esté conectado',async()=>{
    vi.stubEnv('ATLAS_OPENCODE_HOST','https://atlas.test');vi.stubEnv('ATLAS_OPENCODE_USER','user-test');vi.stubEnv('ATLAS_OPENCODE_PASS','secret-test');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:[],all:[{id:'github-copilot',models:{'no-autenticado':{}}}]})}));
    expect(await modelosCopilotEnAtlas()).toBeNull();
  });
  it('consulta con el token de sesión y omite modelos deshabilitados o sin selector', async () => {
    vi.mocked(getCopilotSessionToken).mockResolvedValue({ token:'session-test', expiresAt:Date.now()/1000+1800, refreshIn:1800 });
    const request = vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[
      {id:'chat-real',capabilities:{type:'chat'},policy:{state:'enabled'}},
      {id:'chat-real'}, {id:'embedding',capabilities:{type:'embeddings'}},
      {id:'bloqueado',policy:{state:'disabled'}}, {id:'automatico',model_picker_enabled:false}, {},
    ]})});
    vi.stubGlobal('fetch',request);
    expect(await modelosDeCopilot('oauth-test',{'Editor-Version':'test'})).toEqual(['chat-real']);
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer session-test');
    expect(request.mock.calls[0][1].headers['Editor-Version']).toBe('test');
  });
  it('una conexión inválida no reenvía el token OAuth como si fuera sesión', async () => {
    vi.mocked(getCopilotSessionToken).mockResolvedValue({token:'oauth-test',expiresAt:0,refreshIn:0});
    const request=vi.fn();vi.stubGlobal('fetch',request);
    await expect(modelosDeCopilot('oauth-test')).rejects.toThrow('El token guardado se conserva');
    expect(request).not.toHaveBeenCalled();
  });
  it('un rechazo de la cuenta no se convierte en un catálogo vacío exitoso', async () => {
    vi.mocked(getCopilotSessionToken).mockResolvedValue({token:'session-test',expiresAt:Date.now()/1000+1800,refreshIn:1800});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:403}));
    await expect(modelosDeCopilot('oauth-test')).rejects.toThrow('plan y las políticas');
  });
  it('Atlas usa githubModel y el id real de OpenCode, sin preferir un valor antiguo', () => {
    const fila={aiProvider:'github_copilot_internal',githubModel:'modelo-guardado'};
    expect(preferenciaModeloAtlas(fila,{github_copilot_internal:{model:'modelo-viejo'}})).toEqual({providerID:'github-copilot',modelID:'modelo-guardado'});
    expect(copilotElegido(fila,{ATLAS_OPENCODE_HOST:'http://configured',GITHUB_TOKEN:'oauth-test'})).toBe(true);
    expect(copilotElegido(fila,{})).toBe(false);
    expect(copilotElegido(fila,{ATLAS_OPENCODE_HOST:'http://configured'})).toBe(true);
    expect(copilotElegido({aiProvider:'groq'},{})).toBe(false);
    expect(preferenciaModeloAtlas({aiProvider:'groq'},{groq:{model:'llama'}})).toEqual({providerID:'groq',modelID:'llama'});
  });
});
