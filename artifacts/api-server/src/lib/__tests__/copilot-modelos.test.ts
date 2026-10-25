import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../copilot', () => ({ getCopilotSessionToken: vi.fn() }));
import { getCopilotSessionToken } from '../copilot';
import { modelosDeCopilot } from '../copilot-modelos';
import { preferenciaModeloAtlas, copilotElegido } from '../preferencia-modelo-atlas';

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
describe('selección real de modelos de Copilot', () => {
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
    await expect(modelosDeCopilot('oauth-test')).rejects.toThrow('Vuelve a conectar');
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
    expect(copilotElegido(fila,{ATLAS_OPENCODE_HOST:'http://configured'})).toBe(false);
    expect(copilotElegido({aiProvider:'groq'},{})).toBe(false);
    expect(preferenciaModeloAtlas({aiProvider:'groq'},{groq:{model:'llama'}})).toEqual({providerID:'groq',modelID:'llama'});
  });
});
