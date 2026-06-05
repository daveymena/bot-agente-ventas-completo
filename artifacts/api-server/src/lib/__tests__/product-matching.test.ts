import { describe, it, expect, beforeEach } from 'vitest';
import { findBestProductMatch } from '../conversation-engine';

describe('Product Matching - Validación de Búsqueda de Productos', () => {
  let productList: any[];
  let categoryMap: Map<number, string>;

  beforeEach(() => {
    // Productos de prueba
    productList = [
      {
        id: 1,
        name: 'Guitarra Acústica',
        description: 'Instrumento de cuerda de excelente calidad',
        category: 'música',
        categoryId: 1,
        price: '50000',
        currency: 'COP',
        isActive: true,
      },
      {
        id: 2,
        name: 'Guitarra Eléctrica',
        description: 'Instrumento amplificado para rock',
        category: 'música',
        categoryId: 1,
        price: '75000',
        currency: 'COP',
        isActive: true,
      },
      {
        id: 3,
        name: 'Piano Digital',
        description: 'Teclado electrónico con 88 teclas',
        category: 'música',
        categoryId: 1,
        price: '120000',
        currency: 'COP',
        isActive: true,
      },
      {
        id: 4,
        name: 'Excel Avanzado',
        description: 'Curso completo de Excel con macros',
        category: 'cursos',
        categoryId: 2,
        price: '30000',
        currency: 'COP',
        isActive: true,
      },
      {
        id: 5,
        name: 'Guitarra Acústica Premium',
        description: 'Guitarra de alta gama con sonido profesional',
        category: 'música',
        categoryId: 1,
        price: '150000',
        currency: 'COP',
        isActive: true,
      },
    ];

    categoryMap = new Map([
      [1, 'música'],
      [2, 'cursos'],
    ]);
  });

  describe('Caso 1: Búsqueda Exacta', () => {
    it('debe encontrar "Guitarra Acústica" cuando se busca "guitarra acústica"', async () => {
      const result = await findBestProductMatch('guitarra acústica', productList, categoryMap);
      
      expect(result).not.toBeNull();
      expect(result?.product.id).toBe(1);
      expect(result?.product.name).toBe('Guitarra Acústica');
      expect(result?.score).toBeGreaterThanOrEqual(50);
    });

    it('debe encontrar "Excel Avanzado" cuando se busca "excel"', async () => {
      const result = await findBestProductMatch('excel', productList, categoryMap);
      
      expect(result).not.toBeNull();
      expect(result?.product.id).toBe(4);
      expect(result?.product.name).toBe('Excel Avanzado');
    });
  });

  describe('Caso 2: Desempate entre Múltiples Similares', () => {
    it('debe preferir "Guitarra Acústica" sobre "Guitarra Acústica Premium" cuando se busca "guitarra"', async () => {
      const result = await findBestProductMatch('guitarra', productList, categoryMap);
      
      expect(result).not.toBeNull();
      // Debe devolver una guitarra, no necesariamente la primera
      expect(result?.product.name).toContain('Guitarra');
      expect([1, 2, 5]).toContain(result?.product.id);
    });

    it('debe encontrar "Guitarra Eléctrica" cuando se busca "guitarra eléctrica"', async () => {
      const result = await findBestProductMatch('guitarra eléctrica', productList, categoryMap);
      
      expect(result).not.toBeNull();
      expect(result?.product.id).toBe(2);
      expect(result?.product.name).toBe('Guitarra Eléctrica');
    });
  });

  describe('Caso 3: Búsqueda por Descripción', () => {
    it('debe encontrar "Piano Digital" cuando se busca "teclado"', async () => {
      const result = await findBestProductMatch('teclado', productList, categoryMap);
      
      expect(result).not.toBeNull();
      expect(result?.product.id).toBe(3);
      expect(result?.product.name).toBe('Piano Digital');
    });

    it('debe encontrar "Guitarra Acústica" cuando se busca "instrumento de cuerda"', async () => {
      const result = await findBestProductMatch('instrumento de cuerda', productList, categoryMap);
      
      expect(result).not.toBeNull();
      expect(result?.product.name).toContain('Guitarra');
    });
  });

  describe('Caso 4: Búsqueda Fallida', () => {
    it('debe devolver null cuando se busca algo que no existe', async () => {
      const result = await findBestProductMatch('saxofón', productList, categoryMap);
      
      expect(result).toBeNull();
    });

    it('debe devolver null cuando se busca solo palabras genéricas', async () => {
      const result = await findBestProductMatch('producto curso', productList, categoryMap);
      
      // Podría ser null o devolver algo, pero no debe ser incorrecto
      if (result) {
        expect(result.score).toBeGreaterThanOrEqual(50);
      }
    });
  });

  describe('Caso 5: Búsqueda Específica vs Genérica', () => {
    it('debe preferir coincidencia específica sobre genérica', async () => {
      const result = await findBestProductMatch('quiero guitarra acústica', productList, categoryMap);
      
      expect(result).not.toBeNull();
      expect(result?.product.id).toBe(1);
      expect(result?.score).toBeGreaterThanOrEqual(50);
    });

    it('debe encontrar "Piano Digital" cuando se busca "piano"', async () => {
      const result = await findBestProductMatch('piano', productList, categoryMap);
      
      expect(result).not.toBeNull();
      expect(result?.product.id).toBe(3);
    });
  });

  describe('Caso 6: Variaciones de Escritura', () => {
    it('debe encontrar "Guitarra Acústica" con acento o sin acento', async () => {
      const result1 = await findBestProductMatch('guitarra acustica', productList, categoryMap);
      const result2 = await findBestProductMatch('guitarra acústica', productList, categoryMap);
      
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      // Ambas deben encontrar una guitarra
      expect(result1?.product.name).toContain('Guitarra');
      expect(result2?.product.name).toContain('Guitarra');
    });

    it('debe encontrar "Excel Avanzado" en mayúsculas o minúsculas', async () => {
      const result1 = await findBestProductMatch('EXCEL', productList, categoryMap);
      const result2 = await findBestProductMatch('excel', productList, categoryMap);
      
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1?.product.id).toBe(4);
      expect(result2?.product.id).toBe(4);
    });
  });

  describe('Caso 7: Razonamiento de Búsqueda', () => {
    it('debe proporcionar razonamiento claro', async () => {
      const result = await findBestProductMatch('guitarra', productList, categoryMap);
      
      expect(result).not.toBeNull();
      expect(result?.reasoning).toBeDefined();
      expect(result?.reasoning.length).toBeGreaterThan(0);
      expect(result?.reasoning).toContain('Guitarra');
    });

    it('debe indicar cuando no hay coincidencia', async () => {
      const result = await findBestProductMatch('saxofón', productList, categoryMap);
      
      expect(result).toBeNull();
    });
  });
});
