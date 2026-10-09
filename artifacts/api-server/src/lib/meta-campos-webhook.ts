/**
 * Los eventos de la PÁGINA que la app necesita recibir por webhook.
 *
 * `POST /{page-id}/subscribed_apps` REEMPLAZA la lista de campos suscritos,
 * no la suma. Había dos lugares que suscribían con listas distintas:
 *
 *   - facebook.ts (al crear un formulario de leads): solo ["leadgen"]
 *   - el botón "Suscribir" de Messenger: sin `subscribed_fields`, que Graph
 *     rechaza con "(#100) The parameter subscribed_fields is required"
 *
 * O sea que crear un formulario de leads APAGABA los mensajes y los
 * comentarios de la página, y el botón de Messenger nunca suscribió nada.
 * Una sola lista, usada por los dos.
 *
 *   messages             → Messenger (y, con Instagram vinculado, sus DMs)
 *   messaging_postbacks  → botones de Messenger
 *   feed                 → comentarios en publicaciones y anuncios
 *   leadgen              → formularios de clientes potenciales
 *
 * Los comentarios y DMs de INSTAGRAM no se suscriben acá: el objeto
 * "instagram" se suscribe en el panel de la app de Meta (Webhooks →
 * Instagram → campos `comments` y `messages`).
 */
export const CAMPOS_WEBHOOK_PAGINA = ["messages", "messaging_postbacks", "feed", "leadgen"] as const;
