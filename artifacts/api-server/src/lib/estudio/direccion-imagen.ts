/** Pure art direction shared by image generation and tests. Text is added as
 * editable layers, never baked into a product photograph or a fake landing. */
export interface ProductoVisual { name: string | null; description: string | null; kind?: string | null }
export function promptDeProducto(product: ProductoVisual, variant: number): string {
  const name = String(product.name || '').trim().slice(0, 160);
  const description = String(product.description || '').replace(/<[^>]*>/g, ' ').slice(0, 700);
  const digital = product.kind === 'digital' || (!product.kind && /\b(curso|pack|megapack|plantillas|ebook|digital)\b/i.test(name));
  const direction = digital ? [
    'Premium editorial still life representing the actual learning topic. One strong topic-specific object, carefully composed tactile materials, sculptural depth, generous negative space. No generic pile of laptops. Studio photography with subtle directional light, cobalt blue and warm ivory, crisp natural textures.',
    'Art-directed learning workspace related specifically to this topic: authentic tools and materials in an intentional asymmetric composition. Natural side light, warm paper and deep slate palette. A compelling close-up of the craft, not a stock photo of a person pointing at a computer.',
    'Premium digital collection concept: elegant unbranded book-like panels with abstract topic-specific artwork, staggered in depth on an architectural plinth. Restrained blue accent, warm white seamless backdrop, soft realistic shadows. A conceptual cover image, not physical items promised to a customer.',
  ] : [
    'High-end studio product photography. Show only the described product, accurate proportions and materials, soft directional lighting, clean neutral backdrop, plenty of breathing room.',
    'Editorial contextual product photography in a setting relevant to its described use. Keep the actual product as the focal point, natural light, restrained colors, no invented accessories.',
    'Close-up product composition emphasizing the described materials and details, understated studio backdrop and realistic shadows.',
  ];
  return `Asset: standalone ${digital ? 'digital product cover illustration' : 'product photograph'} for "${name}". Factual subject: ${description}. ${direction[Math.abs(Math.floor(variant)) % direction.length]} ` +
    'Square composition, subject within central 80 percent for safe crops. No website, no landing page, no browser frame, no UI screenshot, no nested page, no buttons. No text, prices, testimonials, certificates, badges, watermarks or third-party logos. No invented outcomes or features. Title and call to action will be added separately as editable typography.';
}
