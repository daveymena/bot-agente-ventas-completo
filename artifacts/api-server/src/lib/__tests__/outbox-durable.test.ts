import { describe, it, expect } from 'vitest';
import { MessageQueue, type QueuedMessage, type QueueStore } from '../message-queue';
import { restaurarSesiones } from '../restaurar-sesiones';
const incoming = (tenantId: string, messageId: string) => ({tenantId, messageId, from:'57300@s.whatsapp.net', to:tenantId, body:'hola', timestamp:new Date(), isGroup:false});
describe('outbox durable', () => {
  it('restores unsent reply parts after restart and retries persistence failures', async () => {
    const rows = new Map<string, QueuedMessage>(); let fail = true;
    const store: QueueStore = {load:async()=>[...rows.values()], cleanup:async()=>{}, save:async batch=>{if(fail) throw Error('database unavailable'); for(const m of batch) rows.set(m.id, structuredClone(m));}};
    const q = new MessageQueue(); await q.attachStore(store);
    const m = q.enqueue(incoming('1','a')); q.guardarPartes(m.id,[{kind:'text',content:'respuesta'}]);
    await expect(q.flush()).rejects.toThrow();
    fail=false; await q.flush();
    const restarted = new MessageQueue(); await restarted.attachStore(store);
    expect(restarted.dequeue()?.parts).toEqual([{kind:'text',content:'respuesta'}]);
    expect(restarted.enqueue(incoming('1','a')).id).toBe(m.id);
    expect(restarted.enqueue(incoming('2','a')).id).not.toBe(m.id);
  });
  it('does not starve a third tenant behind a burst', () => {
    const q = new MessageQueue();
    for(let i=0;i<10;i++) q.enqueue(incoming('1',String(i)));
    q.enqueue(incoming('2','b'));q.enqueue(incoming('3','c'));
    expect([q.dequeue()?.tenantId,q.dequeue()?.tenantId,q.dequeue()?.tenantId]).toEqual(['1','2','3']);
  });
  it('isolates reconnection failures and respects startup concurrency',async()=>{
    let active=0,max=0;const started:number[]=[];
    await restaurarSesiones([1,2,2,3,-1],{concurrency:2,load:async id=>id,start:async id=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;if(id===2)throw Error('offline');started.push(id);},onError:()=>{}});
    expect(max).toBe(2);expect(started.sort()).toEqual([1,3]);
  });
});
