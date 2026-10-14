// opentype.js 2.x no publica tipos resolubles desde el bundle ESM que usa el
// repo; el Estudio solo usa parse/charToGlyph/getKerningValue/getPath.
declare module "opentype.js" {
  const opentype: any;
  export default opentype;
}
