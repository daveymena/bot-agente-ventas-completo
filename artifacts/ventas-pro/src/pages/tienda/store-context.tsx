import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export interface StoreProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  category: string;
  kind: string;
  currency?: string;
  features?: string[] | null;
  paymentLink?: string | null;
  deliveryLink?: string | null;
}

interface CartItem extends StoreProduct {
  quantity: number;
}

export interface StoreConfig {
  name: string;
  slug: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  whatsappPhone?: string | null;
}

interface StoreContextType {
  products: StoreProduct[];
  cart: CartItem[];
  config: StoreConfig;
  loading: boolean;
  setProducts: (p: StoreProduct[]) => void;
  setConfig: (c: StoreConfig) => void;
  setLoading: (v: boolean) => void;
  addToCart: (product: StoreProduct) => void;
  removeFromCart: (id: number) => void;
  updateQuantity: (id: number, qty: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  wishlist: number[];
  toggleWishlist: (id: number) => void;
}

const CART_KEY = "store_cart";
const WISHLIST_KEY = "store_wishlist";

function loadCart(): CartItem[] {
  try { return JSON.parse(sessionStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
}
function saveCart(cart: CartItem[]) {
  try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
}
function loadWishlist(): number[] {
  try { return JSON.parse(sessionStorage.getItem(WISHLIST_KEY) || "[]"); } catch { return []; }
}
function saveWishlist(w: number[]) {
  try { sessionStorage.setItem(WISHLIST_KEY, JSON.stringify(w)); } catch {}
}

const defaultConfig: StoreConfig = {
  name: "Mi Tienda",
  slug: "",
  logo: null,
  primaryColor: "#4f46e5",
  secondaryColor: "#9333ea",
};

const StoreCtx = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [config, setConfig] = useState<StoreConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>(loadCart);
  const [wishlist, setWishlist] = useState<number[]>(loadWishlist);

  useEffect(() => { saveCart(cart); }, [cart]);
  useEffect(() => { saveWishlist(wishlist); }, [wishlist]);

  const addToCart = useCallback((product: StoreProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: number) => {
    setCart(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: number, qty: number) => {
    if (qty <= 0) { removeFromCart(id); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  }, [removeFromCart]);

  const clearCart = useCallback(() => setCart([]), []);
  const toggleWishlist = useCallback((id: number) => {
    setWishlist(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }, []);

  const cartCount = cart.reduce((a, i) => a + i.quantity, 0);
  const cartTotal = cart.reduce((a, i) => a + Number(i.price) * i.quantity, 0);

  return (
    <StoreCtx.Provider value={{
      products, cart, config, loading,
      setProducts, setConfig, setLoading,
      addToCart, removeFromCart, updateQuantity, clearCart,
      cartCount, cartTotal, wishlist, toggleWishlist,
    }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStoreCart() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStoreCart must be used within StoreProvider");
  return ctx;
}
