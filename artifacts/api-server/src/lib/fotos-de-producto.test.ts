import { describe, it, expect } from "vitest";
import { fotosDelProducto, videosDelProducto } from "./fotos-de-producto";

// Pedido del dueño (13-09-2026): más de una foto por producto y URLs de video.
// Todo el sistema (ficha, landing, anuncios) tiene que ver la MISMA lista.
describe("fotosDelProducto", () => {
  it("principal primero, luego la galería del dueño, luego Dropi/Woo, sin repetidas", () => {
    const p = {
      imageUrl: "/images/products/5.jpg",
      metadata: JSON.stringify({
        imagenes: ["/uploads/products/5-abc.png", "https://cdn.x.com/a.jpg", "/images/products/5.jpg"],
        woocommerce: { imageUrls: ["https://cdn.x.com/a.jpg", "https://cdn.x.com/b.webp"] },
      }),
    };
    expect(fotosDelProducto(p, "https://ventasproia.com")).toEqual([
      "https://ventasproia.com/images/products/5.jpg",
      "https://ventasproia.com/uploads/products/5-abc.png",
      "https://cdn.x.com/a.jpg",
      "https://cdn.x.com/b.webp",
    ]);
  });

  it("acepta metadata como objeto y descarta lo que no es imagen", () => {
    const p = { imageUrl: null, metadata: { imagenes: ["https://x.com/video.mp4", "https://x.com/f.jpg?v=1"] } };
    expect(fotosDelProducto(p, "https://h")).toEqual(["https://x.com/f.jpg?v=1"]);
  });

  it("sin metadata ni imagen devuelve vacío", () => {
    expect(fotosDelProducto({ imageUrl: "", metadata: "no es json" }, "https://h")).toEqual([]);
  });

  // 23-10-2026: los diseños "estilo" (CleanHome, Urgencia, Clínico, Pro) y los
  // creativos salían con el recuadro de la foto vacío porque la foto principal
  // venía de un CDN sin extensión y el filtro la descartaba.
  it("la foto de un CDN sin extensión (Unsplash, Cloudinary, imgix) y .avif SÍ es foto", () => {
    const p = {
      imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&auto=format&fit=crop",
      metadata: { imagenes: ["https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/mochila", "https://cdn.x.com/a.avif"] },
    };
    expect(fotosDelProducto(p, "https://h")).toEqual([
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&auto=format&fit=crop",
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/mochila",
      "https://cdn.x.com/a.avif",
    ]);
  });

  it("video, documento o enlace a un sitio de video NO es foto", () => {
    const p = { imageUrl: null, metadata: { imagenes: ["https://youtu.be/abc", "https://www.youtube.com/watch?v=1", "https://x.com/ficha.pdf", "https://x.com/clip.webm", "https://x.com/ok.png"] } };
    expect(fotosDelProducto(p, "https://h")).toEqual(["https://x.com/ok.png"]);
  });
});

describe("videosDelProducto", () => {
  it("el principal es videoIntro y los demás van en otros, sin repetir el principal", () => {
    const p = { metadata: { videoIntro: "https://youtu.be/1", videos: ["https://youtu.be/1", "https://drive.google.com/2"] } };
    expect(videosDelProducto(p)).toEqual({ principal: "https://youtu.be/1", otros: ["https://drive.google.com/2"] });
  });
});
