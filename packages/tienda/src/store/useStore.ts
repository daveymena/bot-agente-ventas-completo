import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  type: 'digital' | 'physical' | 'dropshipping';
  stock: number;
}

interface CartItem extends Product {
  quantity: number;
}

interface MenuLink {
  id: string;
  label: string;
  path: string;
}

// Mismo shape que updateBrandingSchema.brandSocial en
// artifacts/api-server/src/routes/branding.ts -- ese Zod schema es la
// fuente de verdad de qué redes soporta el sistema.
interface SocialLinks {
  website?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  linkedin?: string;
}

interface StoreConfig {
  storeName: string;
  logoUrl: string;
  heroImage: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  borderRadius: 'none' | 'md' | '2xl' | 'full';
  theme: 'light' | 'dark' | 'glass' | 'corporate';
  menuLinks: MenuLink[];
  showHero: boolean;
  showWizard: boolean;
  showCategories: boolean;
  showFeatures: boolean;
  mercadopagoPublicKey: string;
  paypalClientId: string;
  ownerId: string;
  slug: string;
  whatsappPhone: string;
  socialLinks: SocialLinks;
}

interface Branch {
  id: string;
  name: string;
  city: string;
}

interface StoreState {
  products: Product[];
  cart: CartItem[];
  wishlist: string[];
  branches: Branch[];
  activeBranch: string | null;
  isAdmin: boolean;
  sessionChecked: boolean;
  checkSession: () => Promise<void>;
  config: StoreConfig;
  activeTemplate: string | null;
  addProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
  updateProduct: (product: Product) => void;
  setProducts: (products: Product[]) => void;
  addToCart: (product: Product) => void;
  removeFromCart: (id: string) => void;
  updateCartQuantity: (id: string, quantity: number) => void;
  toggleWishlist: (id: string) => void;
  setBranch: (id: string) => void;
  clearCart: () => void;
  setAdmin: (isAdmin: boolean) => void;
  updateConfig: (config: Partial<StoreConfig>) => void;
  applyTemplate: (template: import('./templates').StoreTemplate) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      products: [
        {
          id: '1',
          name: 'Curso de React Avanzado',
          description: 'Aprende React desde cero hasta experto con proyectos reales.',
          price: 49.99,
          image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&auto=format&fit=crop&q=60',
          category: 'Cursos',
          type: 'digital',
          stock: 999
        },
        {
          id: '2',
          name: 'Teclado Mecánico RGB',
          description: 'Teclado mecánico premium para gaming y productividad.',
          price: 129.99,
          image: 'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=800&auto=format&fit=crop&q=60',
          category: 'Periféricos',
          type: 'physical',
          stock: 15
        },
        {
          id: '3',
          name: 'Audífonos Inalámbricos',
          description: 'Cancelación de ruido activa y sonido de alta fidelidad.',
          price: 199.99,
          image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=60',
          category: 'Audio',
          type: 'dropshipping',
          stock: 50
        }
      ],
      cart: [],
      // isAdmin nunca se activaba antes -- no había ningún login real para
      // este editor, así que /admin y /editor eran inalcanzables (redirigían
      // a "/" apenas se montaba la ruta). Se valida contra la sesión real de
      // VentasPro (misma cookie firmada, mismo backend) en vez de una bandera
      // local que nadie ponía en true.
      isAdmin: false,
      sessionChecked: false,
      checkSession: async () => {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' });
          if (!res.ok) { set({ isAdmin: false, sessionChecked: true }); return; }
          const data = await res.json();
          const tenant = data.tenant;
          set((state) => ({
            isAdmin: true,
            sessionChecked: true,
            config: {
              ...state.config,
              slug: tenant.slug || state.config.slug,
              storeName: tenant.brandName || state.config.storeName,
              ownerId: String(tenant.id),
            },
          }));
        } catch {
          set({ isAdmin: false, sessionChecked: true });
        }
      },
      activeTemplate: null,
      addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
      removeProduct: (id) => set((state) => ({ products: state.products.filter(p => p.id !== id) })),
      updateProduct: (updatedProduct) => set((state) => ({
        products: state.products.map(p => p.id === updatedProduct.id ? updatedProduct : p)
      })),
      setProducts: (products) => set({ products }),
      addToCart: (product) => set((state) => {
        const existing = state.cart.find(item => item.id === product.id);
        if (existing) {
          return {
            cart: state.cart.map(item =>
              item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
            )
          };
        }
        return { cart: [...state.cart, { ...product, quantity: 1 }] };
      }),
      removeFromCart: (id) => set((state) => ({
        cart: state.cart.filter(item => item.id !== id)
      })),
      updateCartQuantity: (id, quantity) => set((state) => ({
        cart: state.cart.map(item =>
          item.id === id ? { ...item, quantity: Math.max(0, quantity) } : item
        ).filter(item => item.quantity > 0)
      })),
      clearCart: () => set({ cart: [] }),
      setAdmin: (isAdmin) => set({ isAdmin }),
      config: {
        storeName: 'ProStore MultiTenant',
        logoUrl: '',
        heroImage: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
        primaryColor: '#4f46e5',
        secondaryColor: '#9333ea',
        fontFamily: 'Inter',
        borderRadius: '2xl',
        theme: 'light',
        menuLinks: [
          { id: '1', label: 'Inicio', path: '/' },
          { id: '2', label: 'Tienda', path: '/shop' },
          { id: '3', label: 'Digitales', path: '/category/digital' }
        ],
        showHero: true,
        showWizard: true,
        showCategories: true,
        showFeatures: true,
        mercadopagoPublicKey: '',
        paypalClientId: '',
        ownerId: 'default-user',
        slug: '',
        whatsappPhone: '',
        socialLinks: {},
      },
      updateConfig: (newConfig) => set((state) => ({ 
        config: { ...state.config, ...newConfig } 
      })),
      applyTemplate: (template) => set((state) => ({
        activeTemplate: template.id,
        config: {
          ...state.config,
          ...template.configOverrides,
          primaryColor: template.colors.primary,
          secondaryColor: template.colors.secondary,
        },
        products: template.defaultProducts.map((p, i) => ({
          id: `template-${template.id}-${i}`,
          name: p.name,
          description: p.description,
          price: p.price,
          image: p.image,
          category: p.category,
          type: p.type,
          stock: 999,
        })),
      })),
      wishlist: [],
      branches: [
        { id: '1', name: 'Sede Central', city: 'Madrid' },
        { id: '2', name: 'Sucursal Norte', city: 'Bilbao' },
        { id: '3', name: 'Distribuidora Latam', city: 'México' }
      ],
      activeBranch: '1',
      toggleWishlist: (id) => set((state) => ({
        wishlist: state.wishlist.includes(id) 
          ? state.wishlist.filter(item => item !== id)
          : [...state.wishlist, id]
      })),
      setBranch: (id) => set({ activeBranch: id }),
    }),
    {
      name: 'store-storage',
    }
  )
);
